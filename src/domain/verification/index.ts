import { and, asc, eq, inArray, isNull, ne, notExists, type SQLWrapper } from "drizzle-orm";
import type { Actor, AdminActor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { publicName } from "../accounts/names";
import { startClock, type ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { causedBy } from "../errors";
import { fileLink } from "../file-links";
import { defineQueueItemKind, type Block, type DecisionField, type ItemRow } from "../queues";
import { ok, refuse, type Result } from "../result";
import { daysBefore, formatDay, isDay, saDay, saDayStart } from "../sa-days";
import { accounts, authUsers, queueItems, verificationChecks } from "../schema";
import { defineSection } from "../section";
import {
  isServiceCategory,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "../service-categories";
import { tell } from "../tells";
import { discardFiles, uploadFile, UPLOAD_CONTEXTS } from "../uploads";
import {
  CATEGORY_CREDENTIALS,
  CHECKS,
  checkDetails,
  DOCUMENT_TYPE_NAMES,
  formatIdentityNumber,
  identityKey,
  identityNumber,
  payoutAccountKey,
  slotOf,
  type CheckDetailsInput,
  type CheckKind,
  type FilePart,
  type IdentityNumber,
} from "./checks";
import { bankFacts, checkBankAccount, readCheck } from "./reading";
import { allSlots, checkTitle, Standing, type CheckRow } from "./standing";
import type { CheckDetails, CheckFile } from "./stored";

// Verification (#99, #118, ADR 0002): an Artisan submits each check, the
// Admin accepts or rejects it on its own row of the Artisan's Verification
// item, and an accepted check is a Verification Badge. An Artisan is verified
// for a Service Category only while every check it needs is current; Quotes
// and Hires ask `verifiedFor` at the moment they happen, so a lapse never
// touches a Hired Engagement.

/** Each part of a check's files, as the Artisan sends them. */
export type CheckFiles = Partial<Record<FilePart["part"], Blob[]>>;

const KIND = "verification.checks";

/** The checks of one Artisan waiting on the Admin, one item while any wait. */
const verificationItem = defineQueueItemKind(KIND, {
  queue: "verification",
  decisions: {
    // Recorded once no check waits, never chosen.
    checked: { label: "Every check decided", told: "Nobody", reason: "none" },
  },
  async allowed() {
    return [];
  },
  async decide() {
    return refuse("not-allowed", "Decide each check on its own row.");
  },
  async view(ctx, item) {
    const [artisan, checks] = await Promise.all([
      artisanRow(ctx, item.subjectId),
      checksOf(ctx, item.subjectId),
    ]);
    const standing = new Standing(checks, saDay(ctx.now()));
    const identity = standing.current("identity");
    const verified = standing.verifiedCategories();
    return {
      tabs: [],
      sidebar: [
        {
          title: "Artisan",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Name", value: artisan?.name ?? "" },
                { label: "Trading name", value: artisan?.tradingName ?? "None" },
                { label: "Email", value: artisan?.email ?? "" },
                {
                  label: "Identity Number",
                  value: identity ? formatIdentityNumber(identityOf(identity.details)) : "None yet",
                },
                {
                  label: "Verified for",
                  value:
                    verified
                      .map(({ category, gasWork }) =>
                        gasWork
                          ? `${SERVICE_CATEGORY_NAMES[category]} (gas work too)`
                          : SERVICE_CATEGORY_NAMES[category],
                      )
                      .join(", ") || "Nothing yet",
                },
              ],
            },
          ],
        },
      ],
      timeline: checks.flatMap((check) => {
        const title = titleOf(check);
        return [
          { at: check.submittedAt, text: `${title} submitted` },
          ...(check.decidedAt
            ? [
                {
                  at: check.decidedAt,
                  text:
                    check.state === "rejected"
                      ? `${title} rejected: ${check.reason}`
                      : `${title} accepted`,
                },
              ]
            : []),
          ...(check.removedAt
            ? [{ at: check.removedAt, text: `${title} badge removed: ${check.removedReason}` }]
            : []),
        ];
      }),
    };
  },
  rows: {
    async list(ctx, item) {
      const today = saDay(ctx.now());
      const standing = await standingOf(ctx, item.subjectId);
      const rows: ItemRow[] = [];
      for (const { slot } of allSlots()) {
        const waiting = standing.waiting(slot);
        if (waiting) rows.push(await waitingRow(ctx, waiting));
        const accepted = standing.accepted(slot);
        if (accepted) rows.push(acceptedRow(accepted, today));
      }
      return rows;
    },

    async decide(ctx, admin, item, choice) {
      const [check] = await ctx.db
        .select()
        .from(verificationChecks)
        .where(
          and(
            eq(verificationChecks.id, choice.rowId),
            eq(verificationChecks.artisanId, item.subjectId),
          ),
        );
      if (!check) return refuse("not-found", "That check does not exist.");
      const artisan = await artisanRow(ctx, item.subjectId);
      const about = `${titleOf(check)} for ${artisan?.name ?? "an Artisan"}`;
      switch (choice.decision) {
        case "accept": {
          const accepted = await acceptance(ctx, check, choice.fields);
          if (!accepted.ok) return accepted;
          return ok({
            writes: acceptWrites(ctx, admin, check, accepted.value),
            summary: `Accepted ${about}`,
          });
        }
        case "reject":
          return ok({
            writes: [
              // Unguarded on purpose: on a decided check a trigger aborts the batch.
              ctx.db
                .update(verificationChecks)
                .set({
                  state: "rejected",
                  reason: choice.reason,
                  decidedBy: admin.adminId,
                  decidedAt: ctx.now(),
                })
                .where(eq(verificationChecks.id, check.id)),
              ...tellArtisan(
                ctx,
                admin,
                check,
                "rejected",
                `Verification rejected: ${titleOf(check)}`,
              ),
            ],
            summary: `Rejected ${about}`,
          });
        case "remove":
          return ok({
            writes: [
              ctx.db
                .update(verificationChecks)
                .set({
                  state: "removed",
                  removedReason: choice.reason,
                  removedBy: admin.adminId,
                  removedAt: ctx.now(),
                })
                .where(eq(verificationChecks.id, check.id)),
              ...tellArtisan(ctx, admin, check, "removed", `Badge removed: ${titleOf(check)}`),
            ],
            summary: `Removed the badge ${about}`,
          });
        default:
          return refuse("not-allowed", "That decision is not allowed on this check.");
      }
    },

    async open(ctx, item, rowId) {
      const [check] = await ctx.db
        .select()
        .from(verificationChecks)
        .where(
          and(eq(verificationChecks.id, rowId), eq(verificationChecks.artisanId, item.subjectId)),
        );
      if (!check) return [];
      const counts: Partial<Record<FilePart["part"], number>> = {};
      const files = await Promise.all(
        check.files.map(async (file) => {
          counts[file.part] = (counts[file.part] ?? 0) + 1;
          return {
            kind: file.kind === "pdf" ? ("pdf" as const) : ("photo" as const),
            label: `${PART_NAMES[file.part]} ${counts[file.part]}`,
            href: await fileLink(ctx, file.key),
          };
        }),
      );
      const blocks: Block[] = [{ kind: "files", files }];
      if (check.reading.text.trim()) {
        blocks.push({ kind: "text", text: `Text read from the files:\n\n${check.reading.text}` });
      }
      return blocks;
    },

    settle(ctx, admin, item) {
      return ctx.db
        .update(queueItems)
        .set({ decision: "checked", decidedBy: admin.adminId, decidedAt: ctx.now() })
        .where(
          and(
            eq(queueItems.kind, KIND),
            eq(queueItems.subjectId, item.subjectId),
            isNull(queueItems.decidedAt),
            notExists(
              ctx.db
                .select({ id: verificationChecks.id })
                .from(verificationChecks)
                .where(
                  and(
                    eq(verificationChecks.artisanId, item.subjectId),
                    eq(verificationChecks.state, "submitted"),
                  ),
                ),
            ),
          ),
        );
    },

    refusalOf(error) {
      if (causedBy(error, "a check cannot change that way")) {
        return refuse("already-decided", "This check has been decided already.");
      }
      if (causedBy(error, "held by another Artisan")) {
        return refuse(
          "held",
          "Another Artisan's check with this Identity Number or bank account was accepted first.",
        );
      }
      return null;
    },
  },
});

const PART_NAMES: Record<FilePart["part"], string> = {
  document: "Document",
  selfie: "Selfie",
  photos: "Photo",
};

// Clocks: reminders 30 and 7 days before a check expires, and the expiry.

const REMINDERS = [30, 7] as const;

function expiryClock(event: "expiring" | "expired", days?: number): ClockHandler {
  return async (ctx, clock) => {
    const [check] = await ctx.db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.id, clock.subjectId));
    // A check removed, or replaced by one accepted since, has nothing to remind.
    if (check?.state !== "accepted" || !check.expiresOn) return [];
    const title =
      event === "expired"
        ? `Expired: ${titleOf(check)}`
        : `Expires in ${days} days: ${titleOf(check)}`;
    return tellArtisan(ctx, { kind: "system" }, check, event, title);
  };
}

const CLOCKS = {
  "verification.expires-in-30-days": expiryClock("expiring", 30),
  "verification.expires-in-7-days": expiryClock("expiring", 7),
  "verification.expired": expiryClock("expired"),
} satisfies Record<string, ClockHandler>;

export const verificationSection = defineSection({
  name: "verification",
  queueItems: [verificationItem],
  clocks: CLOCKS,
  api: (ctx) => ({
    /**
     * Submits one check with its files. It waits for the Admin; while it
     * waits, the check it would replace stays current.
     */
    async submit(actor: Actor, input: { details: CheckDetailsInput; files: CheckFiles }) {
      if (actor.kind !== "artisan") {
        return refuse("artisans-only", "Only an Artisan submits checks for Verification.");
      }
      const artisanId = actor.accountId;
      const parsed = await parseSubmission(ctx, artisanId, input);
      if (!parsed.ok) return parsed;
      const { kind, category, details, heldKey, expiresOn, issuedOn, files, standing } =
        parsed.value;

      const stored: CheckFile[] = [];
      const discard = () => discardFiles(ctx, stored);
      try {
        for (const part of CHECKS[kind].files) {
          for (const file of files[part.part] ?? []) {
            const uploaded = await uploadFile(
              ctx,
              file,
              part.photosOnly ? { takes: ["photo"] } : UPLOAD_CONTEXTS.verification,
            );
            if (!uploaded.ok) {
              await discard();
              return uploaded;
            }
            stored.push({ ...uploaded.value, part: part.part });
          }
        }
      } catch (error) {
        await discard();
        throw error;
      }

      const checkId = ctx.newId();
      const name = (await artisanRow(ctx, artisanId))?.name ?? "";
      try {
        const read = await readCheck(ctx, {
          kind,
          details,
          files: stored,
          name,
          identityNumber:
            kind === "identity" ? (details.number ?? null) : identityNumberOf(standing),
        });
        if (!read.ok) {
          await discard();
          return read;
        }
        await ctx.commit([
          ctx.db.insert(verificationChecks).values({
            id: checkId,
            artisanId,
            kind,
            category,
            slot: slotOf(kind, category),
            state: "submitted",
            details,
            heldKey,
            expiresOn,
            issuedOn,
            files: stored,
            reading: read.value,
            submittedAt: ctx.now(),
          }),
          // One item per Artisan waits at a time, however many checks it holds.
          verificationItem.raiseUnlessOpen(ctx, {
            subjectId: artisanId,
            title: `Verification: ${name}`,
          }).write,
        ]);
      } catch (error) {
        // Nothing stored stays behind a check that was not written.
        await discard();
        if (causedBy(error, "UNIQUE constraint failed: verification_checks")) {
          return alreadyWaiting(kind);
        }
        throw error;
      }
      return ok({ checkId });
    },

    /** The Artisan's own Verification: its checks in three groups, and what it is verified for. */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const standing = await standingOf(ctx, viewer.accountId);
      const views = new Map(
        allSlots().map(({ slot, kind, category }) => [
          slot,
          slotView(standing, slot, kind, category),
        ]),
      );
      const inGroup = (group: "once" | "optional") =>
        allSlots()
          .filter(({ kind }) => CHECKS[kind].group === group)
          .map(({ slot }) => views.get(slot)!);
      return {
        verified: standing.verifiedCategories(),
        once: inGroup("once"),
        categories: SERVICE_CATEGORIES.map((category) => ({
          category,
          name: SERVICE_CATEGORY_NAMES[category],
          ...standing.verifiedFor(category),
          checks: allSlots()
            .filter((each) => each.category === category)
            .map(({ slot }) => views.get(slot)!),
        })),
        optional: inGroup("optional"),
      };
    },

    /**
     * Whether an Artisan is verified now for a category, and, if gas work is
     * asked about, for gas work in it. Anyone may ask: the Profile shows it.
     */
    async verified(
      _viewer: Actor,
      input: { artisanId: string; category: string; gasWork?: boolean },
    ) {
      if (!isServiceCategory(input.category)) return false;
      const status = await verifiedFor(ctx, input.artisanId, input.category);
      return input.gasWork ? status.gasWork : status.verified;
    },

    /** The Artisan's Verification Badges, which anyone may see. */
    async badges(_viewer: Actor, input: { artisanId: string }) {
      return badgesOf(ctx, input.artisanId);
    },
  }),
});

/** Whether the Artisan is verified for the category now, and for gas work in it. */
export async function verifiedFor(ctx: Context, artisanId: string, category: ServiceCategory) {
  return (await standingOf(ctx, artisanId)).verifiedFor(category);
}

/**
 * What each of these Artisans is verified for now, by id. It reads accepted
 * checks only, so it answers what is current and nothing about what waits.
 */
export async function verifiedCategoriesOf(
  ctx: Context,
  artisanIds: SQLWrapper | string[],
): Promise<Map<string, { category: ServiceCategory; gasWork: boolean }[]>> {
  const rows = await ctx.db
    .select()
    .from(verificationChecks)
    .where(
      and(
        inArray(verificationChecks.artisanId, artisanIds),
        eq(verificationChecks.state, "accepted"),
      ),
    );
  const byArtisan = new Map<string, CheckRow[]>();
  for (const row of rows)
    byArtisan.set(row.artisanId, [...(byArtisan.get(row.artisanId) ?? []), row]);
  const today = saDay(ctx.now());
  return new Map(
    [...byArtisan].map(([artisanId, checks]) => [
      artisanId,
      new Standing(checks, today).verifiedCategories(),
    ]),
  );
}

/**
 * Checks that are not shown as badges: a work permit says the Artisan holds
 * a foreign passport, and a Payout account is the Artisan's own business.
 */
const UNSHOWN_BADGES: readonly CheckKind[] = ["work-permit", "payout-account"];

/**
 * The Artisan's Verification Badges, which anyone may see: every check
 * current now, but not a work permit or a Payout account, nor an identity
 * document's expiry date.
 */
export async function badgesOf(ctx: Context, artisanId: string) {
  const standing = await standingOf(ctx, artisanId);
  return allSlots().flatMap(({ slot, kind, category }) => {
    const current = standing.current(slot);
    if (!current || UNSHOWN_BADGES.includes(kind)) return [];
    const identity = kind === "identity";
    return [
      {
        kind,
        category,
        name: identity
          ? "Identity verified"
          : checkTitle(kind, category && SERVICE_CATEGORY_NAMES[category]),
        expiresOn: identity ? null : current.expiresOn,
        issuedOn: current.issuedOn,
      },
    ];
  });
}

// Submitting

type Submission = {
  kind: CheckKind;
  category: ServiceCategory | null;
  details: CheckDetails;
  heldKey: string | null;
  expiresOn: string | null;
  issuedOn: string | null;
  files: CheckFiles;
  /** Where the Artisan's Verification stood when it was sent. */
  standing: Standing;
};

/** Everything a submission can be refused for before a byte is stored. */
async function parseSubmission(
  ctx: Context,
  artisanId: string,
  input: { details: CheckDetailsInput; files: CheckFiles },
): Promise<Result<Submission>> {
  const parsed = checkDetails.safeParse(input.details);
  if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
  const given = parsed.data;
  const kind = given.kind;
  const today = saDay(ctx.now());

  let details: CheckDetails = {};
  let heldKey: string | null = null;
  let category: ServiceCategory | null = CHECKS[kind].category ?? null;
  if (given.kind === "identity") {
    const number = identityNumber.safeParse(given);
    if (!number.success) return refuse("invalid", firstProblem(number.error));
    details = number.data;
    heldKey = identityKey(number.data);
  } else if (given.kind === "payout-account") {
    const { kind: _, ...account } = given;
    details = account;
    heldKey = payoutAccountKey(account.accountNumber);
  } else if (given.kind === "work-photos") {
    category = given.category;
  }
  if ("registrationNumber" in given) details.registrationNumber = given.registrationNumber;
  const expiresOn = ("expiresOn" in given && given.expiresOn) || null;
  const issuedOn = ("issuedOn" in given && given.issuedOn) || null;
  const dates = checkDates({ expiresOn, issuedOn }, today);
  if (dates) return dates;

  const standing = await standingOf(ctx, artisanId);
  if (standing.waiting(slotOf(kind, category))) return alreadyWaiting(kind);
  if (kind === "work-permit" && !standing.takesWorkPermit()) {
    return refuse(
      "not-needed",
      standing.current("identity") || standing.waiting("identity")
        ? "A work permit is needed only with a foreign passport."
        : "Submit your identity document first. A work permit is needed only with a foreign passport.",
    );
  }
  if (heldKey && (await heldByOther(ctx, heldKey, artisanId))) return heldByAnother(kind);
  if (
    kind === "payout-account" &&
    standing
      .checks(slotOf(kind, null))
      .some((check) => check.heldKey === heldKey && check.payoutsStoppedAt)
  ) {
    return refuse(
      "stopped",
      "Your bank refused or sent back a Payout to this account, so nothing more is sent to it. Send a bank letter for another account.",
    );
  }

  for (const part of CHECKS[kind].files) {
    const count = input.files[part.part]?.length ?? 0;
    if (count < part.min || count > part.max) {
      return refuse(
        "files",
        part.min === part.max
          ? `${part.label}: send ${part.min} ${part.photosOnly ? "photo" : "file"}${part.min > 1 ? "s" : ""}.`
          : `${part.label}: send ${part.min} to ${part.max} files.`,
      );
    }
  }
  const expected = new Set(CHECKS[kind].files.map((part) => part.part));
  if (Object.keys(input.files).some((part) => !expected.has(part as FilePart["part"]))) {
    return refuse("files", "Send only the files this check asks for.");
  }
  return ok({
    kind,
    category,
    details,
    heldKey,
    expiresOn,
    issuedOn,
    files: input.files,
    standing,
  });
}

/** An expiry date still to come; an issue date already past. */
function checkDates(dates: { expiresOn: string | null; issuedOn: string | null }, today: string) {
  if (dates.expiresOn && dates.expiresOn <= today) {
    return refuse("expired", "This has expired. Send one that is current.");
  }
  if (dates.issuedOn && dates.issuedOn > today) {
    return refuse("invalid", "The issue date cannot be in the future.");
  }
  return null;
}

/** Whether another Artisan holds this Identity Number or Payout account: has it accepted now. */
async function heldByOther(ctx: Context, heldKey: string, artisanId: string) {
  const [held] = await ctx.db
    .select({ id: verificationChecks.id })
    .from(verificationChecks)
    .where(
      and(
        eq(verificationChecks.heldKey, heldKey),
        ne(verificationChecks.artisanId, artisanId),
        eq(verificationChecks.state, "accepted"),
      ),
    )
    .limit(1);
  return !!held;
}

/** Refused without saying whose it is. */
function heldByAnother(kind: CheckKind) {
  return refuse(
    "held",
    kind === "payout-account"
      ? "This bank account is already held by another Artisan Account. If it is yours, contact support."
      : "This Identity Number is already held by another Artisan Account. If it is yours, contact support.",
  );
}

function alreadyWaiting(kind: CheckKind) {
  return refuse(
    "waiting",
    `Your ${CHECKS[kind].name.toLowerCase()} is waiting for the Admin. You can send another once it is decided.`,
  );
}

// Deciding

type Accepted = {
  details: CheckDetails;
  heldKey: string | null;
  expiresOn: string | null;
  issuedOn: string | null;
};

/** What the Admin records on accepting a check: what was sent, as corrected. */
async function acceptance(
  ctx: Context,
  check: CheckRow,
  fields: Record<string, string>,
): Promise<Result<Accepted>> {
  const definition = CHECKS[check.kind];
  const value = (key: string, sent: string | null | undefined) =>
    (fields[key] ?? sent ?? "").trim();
  let details = check.details;
  let heldKey = check.heldKey;
  if (check.kind === "identity") {
    const number = identityNumber.safeParse({
      documentType: check.details.documentType,
      number: value("number", check.details.number),
      country: value("country", check.details.country),
    });
    if (!number.success) return refuse("invalid", firstProblem(number.error));
    details = { ...details, ...number.data };
    heldKey = identityKey(number.data);
  }
  if (definition.registrationNumber) {
    const registration = value("registrationNumber", check.details.registrationNumber);
    if (!registration) return refuse("invalid", "Give the registration number.");
    details = { ...details, registrationNumber: registration };
  }
  const expiresOn =
    definition.expiresOn === "none" ? null : value("expiresOn", check.expiresOn) || null;
  const issuedOn = definition.issuedOn ? value("issuedOn", check.issuedOn) || null : null;
  for (const day of [expiresOn, issuedOn]) {
    if (day && !isDay(day)) return refuse("invalid", "Give each date like 2027-03-31.");
  }
  if (definition.expiresOn === "required" && !expiresOn) {
    return refuse("invalid", "Give the expiry date.");
  }
  if (definition.issuedOn && !issuedOn) return refuse("invalid", "Give the issue date.");
  const dates = checkDates({ expiresOn, issuedOn }, saDay(ctx.now()));
  if (dates) return dates;
  if (heldKey && (await heldByOther(ctx, heldKey, check.artisanId))) {
    return heldByAnother(check.kind);
  }
  return ok({ details, heldKey, expiresOn, issuedOn });
}

function acceptWrites(ctx: Context, admin: AdminActor, check: CheckRow, accepted: Accepted) {
  const now = ctx.now();
  const writes: Write[] = [
    // What it replaces stops being current only now.
    ctx.db
      .update(verificationChecks)
      .set({ state: "superseded", supersededAt: now })
      .where(
        and(
          eq(verificationChecks.artisanId, check.artisanId),
          eq(verificationChecks.slot, check.slot),
          eq(verificationChecks.state, "accepted"),
          ne(verificationChecks.id, check.id),
        ),
      ),
    // Unguarded on purpose: on a decided check a trigger aborts the batch.
    ctx.db
      .update(verificationChecks)
      .set({ state: "accepted", decidedBy: admin.adminId, decidedAt: now, ...accepted })
      .where(eq(verificationChecks.id, check.id)),
    ...tellArtisan(ctx, admin, check, "accepted", `Verification accepted: ${titleOf(check)}`),
  ];
  if (accepted.expiresOn) {
    const clocks: [string, string][] = [
      ...REMINDERS.map((days): [string, string] => [
        `verification.expires-in-${days}-days`,
        daysBefore(accepted.expiresOn!, days),
      ]),
      ["verification.expired", accepted.expiresOn],
    ];
    for (const [kind, day] of clocks) {
      const dueAt = saDayStart(day);
      // A reminder whose day has passed is not sent late.
      if (dueAt > now) writes.push(startClock(ctx, { kind, subjectId: check.id, dueAt }));
    }
  }
  return writes;
}

function tellArtisan(
  ctx: Context,
  actor: Actor,
  check: CheckRow,
  event: string,
  title: string,
): Write[] {
  return tell(ctx, actor, [check.artisanId], {
    event: `verification.${event}`,
    title,
    link: "/verification",
  });
}

// Rows of the Admin's item

async function waitingRow(ctx: Context, check: CheckRow): Promise<ItemRow> {
  let reading = check.reading;
  if (check.kind === "payout-account" && reading.bank?.state === "pending") {
    // The bank may answer up to 120 seconds later; ask again, and keep the answer.
    const artisan = await artisanRow(ctx, check.artisanId);
    const bank = await checkBankAccount(ctx, {
      details: check.details,
      name: artisan?.name ?? "",
      identityNumber: identityNumberOf(await standingOf(ctx, check.artisanId)),
    });
    if (bank && bank.state !== "pending") {
      reading = { ...reading, bank };
      await ctx.db
        .update(verificationChecks)
        .set({ reading })
        .where(eq(verificationChecks.id, check.id));
    }
  }
  return {
    id: check.id,
    title: titleOf(check),
    state: "Waiting",
    blocks: [
      { kind: "facts", facts: sentFacts(check) },
      {
        kind: "facts",
        facts: [
          ...reading.facts,
          ...(check.kind === "payout-account" ? bankFacts(reading.bank) : []),
        ],
      },
    ],
    reads: [{ key: "documents", label: "the documents" }],
    decisions: [
      {
        key: "accept",
        label: "Accept",
        told: "The Artisan",
        reason: "none",
        fields: acceptFields(check),
      },
      {
        key: "reject",
        label: "Reject",
        told: "The Artisan, with the reason",
        reason: "required",
        fields: [],
      },
    ],
  };
}

function acceptedRow(check: CheckRow, today: string): ItemRow {
  const expired = !!check.expiresOn && check.expiresOn <= today;
  return {
    id: check.id,
    title: titleOf(check),
    state: check.payoutsStoppedAt
      ? "Badge, stopped by the bank"
      : expired
        ? "Badge, expired"
        : "Badge",
    blocks: [{ kind: "facts", facts: sentFacts(check) }],
    reads: [{ key: "documents", label: "the documents" }],
    decisions: [
      {
        key: "remove",
        label: "Remove badge",
        told: "The Artisan, with the reason",
        reason: "required",
        fields: [],
      },
    ],
  };
}

/** What the Artisan sent, and what the Admin recorded. */
function sentFacts(check: CheckRow): { label: string; value: string }[] {
  const { details } = check;
  const facts: { label: string; value: string }[] = [
    { label: "Submitted", value: saDay(check.submittedAt) },
  ];
  if (details.documentType) {
    facts.push({ label: "Document", value: DOCUMENT_TYPE_NAMES[details.documentType] });
    facts.push({ label: "Identity Number", value: formatIdentityNumber(identityOf(details)) });
  }
  if (details.accountHolder) facts.push({ label: "Account holder", value: details.accountHolder });
  if (details.bank) facts.push({ label: "Bank", value: details.bank });
  if (details.branchCode) facts.push({ label: "Branch code", value: details.branchCode });
  if (details.accountNumber) facts.push({ label: "Account number", value: details.accountNumber });
  if (details.registrationNumber) {
    facts.push({ label: "Registration number", value: details.registrationNumber });
  }
  if (check.expiresOn) facts.push({ label: "Expires", value: formatDay(check.expiresOn) });
  else if (CHECKS[check.kind].expiresOn === "optional") {
    facts.push({ label: "Expires", value: "No expiry date" });
  }
  if (check.issuedOn) facts.push({ label: "Issued", value: formatDay(check.issuedOn) });
  return facts;
}

/** What the Admin may record or correct from the document on accepting it. */
function acceptFields(check: CheckRow): DecisionField[] {
  const definition = CHECKS[check.kind];
  const fields: DecisionField[] = [];
  if (check.kind === "identity") {
    fields.push({
      key: "number",
      label: "Identity Number, as on the document",
      value: check.details.number ?? "",
      type: "text",
      required: true,
    });
    if (check.details.documentType === "passport") {
      fields.push({
        key: "country",
        label: "Issuing country (two-letter code)",
        value: check.details.country ?? "",
        type: "text",
        required: true,
      });
    }
  }
  if (definition.registrationNumber) {
    fields.push({
      key: "registrationNumber",
      label: "Registration number",
      value: check.details.registrationNumber ?? "",
      type: "text",
      required: true,
    });
  }
  if (definition.expiresOn !== "none") {
    fields.push({
      key: "expiresOn",
      label: "Expiry date",
      value: check.expiresOn ?? "",
      type: "day",
      required: definition.expiresOn === "required",
    });
  }
  if (definition.issuedOn) {
    fields.push({
      key: "issuedOn",
      label: "Issue date",
      value: check.issuedOn ?? "",
      type: "day",
      required: true,
    });
  }
  return fields;
}

// The Artisan's view of one slot

type SlotState =
  | "missing"
  | "waiting"
  | "accepted"
  | "expired"
  | "stopped"
  | "rejected"
  | "removed";

function slotView(
  standing: Standing,
  slot: string,
  kind: CheckKind,
  category: ServiceCategory | null,
) {
  const current = standing.current(slot);
  const waiting = standing.waiting(slot);
  const accepted = standing.accepted(slot);
  const [newest] = standing.checks(slot);
  let state: SlotState;
  let reason: string | null = null;
  if (current) state = "accepted";
  else if (waiting) state = "waiting";
  else if (newest?.state === "rejected") {
    state = "rejected";
    reason = newest.reason;
  } else if (newest?.state === "removed") {
    state = "removed";
    reason = newest.removedReason;
  } else if (accepted?.payoutsStoppedAt) state = "stopped";
  else if (accepted) state = "expired";
  else state = "missing";

  // A replacement sent while the badge is current: waiting, or rejected since.
  const replacement = !current
    ? null
    : waiting
      ? { state: "waiting" as const, reason: null }
      : newest?.state === "rejected" && newest.submittedAt > current.submittedAt
        ? { state: "rejected" as const, reason: newest.reason }
        : null;

  const credentials = category ? CATEGORY_CREDENTIALS[category] : null;
  const needed =
    kind === "work-permit"
      ? standing.takesWorkPermit()
        ? "required"
        : "not-needed"
      : CHECKS[kind].group === "optional" || credentials?.gasWork === kind
        ? "optional"
        : "required";
  return {
    slot,
    kind,
    category,
    name: CHECKS[kind].name,
    needed: needed as "required" | "optional" | "not-needed",
    state,
    /** Why it was rejected, or its badge removed. */
    reason,
    /** The badge's dates, while it is current; an expired one's expiry. */
    expiresOn: (current ?? accepted)?.expiresOn ?? null,
    issuedOn: current?.issuedOn ?? null,
    replacement,
  };
}

export type VerificationSlot = ReturnType<typeof slotView>;

// Reading the rows

async function checksOf(ctx: Context, artisanId: string): Promise<CheckRow[]> {
  return ctx.db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.artisanId, artisanId))
    .orderBy(asc(verificationChecks.submittedAt), asc(verificationChecks.id));
}

/** The Artisan's current Payout account, which Payouts are sent to; null if they have none. */
export async function currentPayoutAccount(ctx: Context, artisanId: string) {
  return (await standingOf(ctx, artisanId)).current("payout-account");
}

async function standingOf(ctx: Context, artisanId: string): Promise<Standing> {
  return new Standing(await checksOf(ctx, artisanId), saDay(ctx.now()));
}

async function artisanRow(ctx: Context, artisanId: string) {
  const [row] = await ctx.db
    .select({
      name: accounts.name,
      tradingName: accounts.tradingName,
      email: authUsers.email,
    })
    .from(accounts)
    .innerJoin(authUsers, eq(authUsers.id, accounts.id))
    .where(eq(accounts.id, artisanId));
  return row ? { ...row, publicName: publicName(row) } : null;
}

/** The Identity Number the bank check needs: the current one, else the one waiting. */
function identityNumberOf(standing: Standing): string | null {
  return (standing.current("identity") ?? standing.waiting("identity"))?.details.number ?? null;
}

function titleOf(check: CheckRow): string {
  return checkTitle(check.kind, check.category && SERVICE_CATEGORY_NAMES[check.category]);
}

function identityOf(details: CheckDetails): IdentityNumber {
  return {
    documentType: details.documentType ?? "sa-id",
    number: details.number ?? "",
    country: details.country ?? null,
  };
}
