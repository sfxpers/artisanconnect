import * as z from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { closeAccount, closedRefusal, closedState } from "../accounts/closing";
import type { Context, Write } from "../context";
import { WITHDRAWN } from "../content/held";
import { formatRands } from "../money";
import { defineQueueItemKind, type ItemView } from "../queues";
import { peoplePage } from "../quotes/held";
import { ok, refuse } from "../result";
import { accounts, authUsers, dataRequests, DATA_REQUEST_KINDS, queueItems } from "../schema";
import { defineSection } from "../section";
import { emailAddress, tell } from "../tells";
import { discardFiles } from "../uploads";
import { eraseWrites, stillOwedCents } from "./erasure";
import { exportOf } from "./export";

// Data requests (#141): an Account asks for a copy of its data, or for its
// erasure, under POPIA. Each is an item in the Data requests queue. The Admin
// sends a copy as an export the Account downloads, anonymises a Closed
// Account once no money is still owed to it, or refuses with a reason. Asking
// for erasure closes the Account, as erasure is only of a Closed one. The
// Account is told by email.

type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number];

const KIND_NAMES: Record<DataRequestKind, string> = {
  copy: "A copy of the data",
  erasure: "Erasure",
};

const requestInput = z.object({
  kind: z.enum(DATA_REQUEST_KINDS, { error: "Ask for a copy of your data, or for erasure." }),
});

/** Where an export is stored: one per request, so sending it again replaces it. */
function exportKey(requestId: string) {
  return `data-exports/${requestId}.json`;
}

const dataRequest = defineQueueItemKind("data.request", {
  queue: "data-requests",
  decisions: {
    "send-export": { label: "Send the export", told: "The Account, by email", reason: "none" },
    erase: { label: "Erase the Account", told: "The Account, by email", reason: "none" },
    refuse: { label: "Refuse", told: "The Account, by email", reason: "required" },
    // Recorded as the Account reopens, never offered to the Admin.
    [WITHDRAWN]: { label: "Withdrawn as the Account reopened", told: "Nobody", reason: "none" },
  },
  async allowed(ctx, item) {
    const request = await requestRow(ctx, item.subjectId);
    if (!request) return [];
    if (request.kind === "copy") return request.erasedAt ? ["refuse"] : ["send-export", "refuse"];
    // Erasure only of a Closed Account, once no money is still owed to it.
    if (!request.closedAt || request.erasedAt) return ["refuse"];
    return (await stillOwedCents(ctx, ownerOf(request))) === 0 ? ["erase", "refuse"] : ["refuse"];
  },
  async decide(ctx, admin, item, choice) {
    const request = await requestRow(ctx, item.subjectId);
    if (!request) return refuse("not-found", "That Data request does not exist.");
    if (choice.decision === "refuse") {
      // An erased Account has no Email left to tell.
      if (request.erasedAt) return ok([]);
      return ok([
        emailAddress(ctx, request.email, {
          event: "data-request.refused",
          title: "Your Data request was refused",
          link: "/account",
          body: [
            `Your request for ${KIND_NAMES[request.kind].toLowerCase()} was refused:`,
            choice.reason ?? "",
          ].join("\n\n"),
        }),
      ]);
    }
    if (choice.decision === "send-export") {
      const data = await exportOf(ctx, request.accountId);
      if (!data) return refuse("not-found", "That Account does not exist.");
      const key = exportKey(request.id);
      // Put first, so the export is there once the Account is told; a batch
      // that then fails leaves a file the next try replaces.
      await ctx.ports.files.put(key, JSON.stringify(data, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });
      return ok([
        ctx.db.update(dataRequests).set({ exportKey: key }).where(eq(dataRequests.id, request.id)),
        ...tell(ctx, admin, [request.accountId], {
          event: "data-request.export-sent",
          title: "Your copy of your data is ready",
          link: "/account",
        }),
      ]);
    }
    const erasing = await eraseWrites(ctx, { id: request.accountId, email: request.email });
    return ok({
      writes: erasing.writes,
      async afterCommit() {
        // It may have reopened since the decision was offered: then nothing was erased.
        if (!(await closedState(ctx, request.accountId))?.erasedAt) return;
        await discardFiles(ctx, erasing.files);
        if (erasing.exports.length > 0) {
          await ctx.ports.files.delete(erasing.exports).catch(() => {});
        }
        // Sent at once and not kept, as the address is no longer held.
        await ctx.ports.mailer
          .send({
            to: request.email,
            subject: "Your ArtisanConnect data is erased",
            text: [
              "As you asked, your ArtisanConnect Account is erased: its names, Email, and password are gone, and it cannot be reopened.",
              "We keep its money records, and its Reviews are shown without a name.",
            ].join("\n\n"),
          })
          .catch((error: unknown) => {
            console.error("The erasure email did not go", error);
          });
      },
    });
  },
  async view(ctx, item) {
    const request = await requestRow(ctx, item.subjectId);
    if (!request) return { tabs: [], sidebar: [] };
    const facts = [
      { label: "Asks for", value: KIND_NAMES[request.kind] },
      {
        label: "Account",
        value: request.erasedAt ? "Erased" : request.closedAt ? "Closed" : "Open",
      },
    ];
    if (request.kind === "erasure" && !request.erasedAt) {
      const owed = await stillOwedCents(ctx, ownerOf(request));
      facts.push({
        label: "Still owed to it",
        value: owed > 0 ? `${formatRands(owed)}. Erase it once this is paid.` : "Nothing",
      });
    }
    const view: ItemView = {
      tabs: [{ key: "request", label: "Request", blocks: [{ kind: "facts", facts }] }],
      sidebar: [
        {
          title: "Account",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Kind", value: request.accountKind === "client" ? "Client" : "Artisan" },
                { label: "Name", value: request.name },
                { label: "Email", value: request.email },
              ],
            },
            { kind: "link", label: "Open on the People page", href: peoplePage(request.accountId) },
          ],
        },
      ],
    };
    return view;
  },
});

/**
 * The write that withdraws the Account's erasure request waiting for the
 * Admin, if one is: reopening changes its mind.
 */
export function withdrawErasureWrite(ctx: Context, accountId: string): Write {
  return ctx.db
    .update(queueItems)
    .set({ decision: WITHDRAWN, decidedAt: ctx.now() })
    .where(
      and(
        inArray(
          queueItems.id,
          ctx.db
            .select({ id: dataRequests.queueItemId })
            .from(dataRequests)
            .where(and(eq(dataRequests.accountId, accountId), eq(dataRequests.kind, "erasure"))),
        ),
        isNull(queueItems.decidedAt),
      ),
    );
}

export const dataRequestsSection = defineSection({
  name: "dataRequests",
  queueItems: [dataRequest],
  api: (ctx) => ({
    /**
     * Asks the Admin for a copy of the signed-in Account's data, or for its
     * erasure, one of each waiting at a time. Erasure closes the Account
     * first, as closing does, and is refused while it cannot close.
     */
    async request(actor: Actor, input: { kind: string }) {
      if (actor.kind !== "client" && actor.kind !== "artisan") {
        return refuse("sign-in-required", "Sign in to ask for your data.");
      }
      const parsed = requestInput.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const { kind } = parsed.data;
      if (await waitingOf(ctx, actor.accountId, kind)) {
        return refuse(
          "already-waiting",
          `You asked for ${KIND_NAMES[kind].toLowerCase()} already. We answer by email.`,
        );
      }
      const [account] = await ctx.db
        .select({ name: accounts.name, closedAt: accounts.closedAt })
        .from(accounts)
        .where(eq(accounts.id, actor.accountId));
      if (!account) return refuse("sign-in-required", "Sign in to ask for your data.");
      if (account.closedAt) return closedRefusal();

      let requestId = "";
      const asked = () => {
        requestId = ctx.newId();
        const raised = dataRequest.raise(ctx, {
          subjectId: requestId,
          title: `${KIND_NAMES[kind]}, for ${account.name}`,
        });
        return [
          raised.write,
          ctx.db.insert(dataRequests).values({
            id: requestId,
            accountId: actor.accountId,
            kind,
            requestedAt: ctx.now(),
            exportKey: null,
            queueItemId: raised.itemId,
          }),
        ];
      };
      // Erasure is only of a Closed Account, so asking for it closes this one.
      if (kind === "erasure") {
        const closed = await closeAccount(ctx, actor, asked);
        if (!closed.ok) return closed;
      } else {
        await ctx.commit(asked());
      }
      return ok({ requestId });
    },

    /** The viewer's own Data requests, newest first, with where each stands. */
    async mine(viewer: Actor) {
      const accountId = accountIdOf(viewer);
      if (!accountId) return [];
      const rows = await ctx.db
        .select({
          requestId: dataRequests.id,
          kind: dataRequests.kind,
          requestedAt: dataRequests.requestedAt,
          decision: queueItems.decision,
          decidedAt: queueItems.decidedAt,
          reason: queueItems.reason,
        })
        .from(dataRequests)
        .innerJoin(queueItems, eq(queueItems.id, dataRequests.queueItemId))
        .where(eq(dataRequests.accountId, accountId))
        .orderBy(desc(dataRequests.requestedAt), desc(dataRequests.id));
      return rows.map(({ decision, reason, ...row }) => ({
        ...row,
        state: !row.decidedAt
          ? ("waiting" as const)
          : decision === "refuse"
            ? ("refused" as const)
            : decision === "erase"
              ? ("erased" as const)
              : decision === WITHDRAWN
                ? ("withdrawn" as const)
                : ("sent" as const),
        /** Why the Admin refused it. */
        reason: decision === "refuse" ? reason : null,
      }));
    },

    /** The export of one of the viewer's own Data requests, once the Admin sent it. */
    async exportFile(viewer: Actor, input: { requestId: string }) {
      const accountId = accountIdOf(viewer);
      if (!accountId) return null;
      const [row] = await ctx.db
        .select({ key: dataRequests.exportKey })
        .from(dataRequests)
        .where(and(eq(dataRequests.id, input.requestId), eq(dataRequests.accountId, accountId)));
      if (!row?.key) return null;
      const object = await ctx.ports.files.get(row.key);
      if (!object) return null;
      return { body: object.body, contentType: "application/json", size: object.size };
    },
  }),
});

/** Whether a request of the kind from the Account waits for the Admin. */
async function waitingOf(ctx: Context, accountId: string, kind: DataRequestKind) {
  const [row] = await ctx.db
    .select({ id: dataRequests.id })
    .from(dataRequests)
    .innerJoin(queueItems, eq(queueItems.id, dataRequests.queueItemId))
    .where(
      and(
        eq(dataRequests.accountId, accountId),
        eq(dataRequests.kind, kind),
        isNull(queueItems.decidedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

type RequestRow = NonNullable<Awaited<ReturnType<typeof requestRow>>>;

/** The Account a request is from. */
function ownerOf(request: RequestRow) {
  return { id: request.accountId, kind: request.accountKind };
}

async function requestRow(ctx: Context, requestId: string) {
  const [row] = await ctx.db
    .select({
      id: dataRequests.id,
      kind: dataRequests.kind,
      accountId: dataRequests.accountId,
      accountKind: accounts.kind,
      name: accounts.name,
      email: authUsers.email,
      closedAt: accounts.closedAt,
      erasedAt: accounts.erasedAt,
    })
    .from(dataRequests)
    .innerJoin(accounts, eq(accounts.id, dataRequests.accountId))
    .innerJoin(authUsers, eq(authUsers.id, dataRequests.accountId))
    .where(eq(dataRequests.id, requestId));
  return row ?? null;
}
