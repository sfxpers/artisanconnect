import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Page, Refusal } from "@/components/page";
import { formatRands } from "@/domain/money";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { holdPayouts, liftPayoutHold } from "@/web/payouts";
import { getPerson, liftSuspension, suspendPerson, warnPerson } from "@/web/people";

export const Route = createFileRoute("/admin/people/$accountId")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: ({ params }) => getPerson({ data: { accountId: params.accountId } }),
  component: Person,
});

const t = copy.admin.people;

type Person = Awaited<ReturnType<typeof getPerson>>;
type Act = "warn" | "suspend" | "lift";

/**
 * One Account (#136): where it stands, every warning and Suspension it has
 * had, and the Admin's powers over it: warn, suspend, or lift a Suspension;
 * hold or free an Artisan's Payouts; and an Artisan's record. Each is a Tell
 * to the Account, and written to the audit log.
 */
function Person() {
  const person = Route.useLoaderData();
  return (
    <Page>
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/admin/people" className="hover:text-foreground">
          {t.title}
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{person.name}</span>
      </nav>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
          <Badge variant="secondary">{copy.signUp.kind.chosen[person.kind]}</Badge>
          {person.suspended && <Badge variant="destructive">{t.suspended}</Badge>}
          {person.payoutsHeld && <Badge variant="destructive">{t.payoutsHeld}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {person.email} · {t.signedUp(formatDate(person.signedUpAt))}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Actions person={person} />
          <Card>
            <CardHeader>
              <CardTitle>{t.history}</CardTitle>
            </CardHeader>
            <CardContent>
              <History person={person} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          {person.kind === "artisan" && <PayoutsCard person={person} />}
          {person.artisanRecord && <ArtisanRecord record={person.artisanRecord} />}
        </div>
      </div>
    </Page>
  );
}

function Actions({ person }: { person: Person }) {
  const router = useRouter();
  const [act, setAct] = useState<Act | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const acts: Act[] = person.suspended ? ["warn", "lift"] : ["warn", "suspend"];

  async function record() {
    if (!act) return;
    setBusy(true);
    setRefusal(null);
    const data = { accountId: person.accountId, reason };
    const result =
      act === "warn"
        ? await warnPerson({ data })
        : act === "suspend"
          ? await suspendPerson({ data })
          : await liftSuspension({ data });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setDone(t.done[act]);
    setAct(null);
    setReason("");
    await router.invalidate();
  }

  return (
    <Card className="ring-2 ring-primary/80">
      <CardHeader>
        <CardTitle>
          {person.suspended ? t.suspendedSince(formatDate(person.suspended.since)) : t.act}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {person.suspended && <p className="text-sm">{person.suspended.reason}</p>}
        <div className="flex flex-wrap gap-2">
          {acts.map((each) => (
            <Button
              key={each}
              variant={act === each ? "default" : "outline"}
              aria-pressed={act === each}
              onClick={() => {
                setAct(each);
                setDone(null);
              }}
            >
              {t.acts[each]}
            </Button>
          ))}
        </div>
        {act && (
          <div className="space-y-1.5">
            <Label htmlFor="reason">{act === "lift" ? t.liftNote : t.reason}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.told[act]}</p>
          </div>
        )}
        <Refusal message={refusal} />
        {done && <p className="text-sm text-muted-foreground">{done}</p>}
        {act && (
          <Button
            disabled={busy || (act !== "lift" && !reason.trim())}
            onClick={() => void record()}
          >
            {t.record}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function History({ person }: { person: Person }) {
  const entries = [
    ...person.warnings.map((each) => ({
      at: new Date(each.at),
      text: t.warned(each.reason, each.leaving),
    })),
    ...person.suspensions.flatMap((each) => [
      { at: new Date(each.since), text: t.suspendedFor(each.reason, each.leaving) },
      ...(each.liftedAt ? [{ at: new Date(each.liftedAt), text: t.lifted }] : []),
    ]),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t.noHistory}</p>;
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((entry, index) => (
        <li key={index}>
          <div>{entry.text}</div>
          <div className="text-xs text-muted-foreground">{formatDate(entry.at)}</div>
        </li>
      ))}
    </ol>
  );
}

function PayoutsCard({ person }: { person: Person }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setRefusal(null);
    const change = person.payoutsHeld ? liftPayoutHold : holdPayouts;
    const result = await change({ data: { artisanId: person.accountId } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{copy.admin.payouts.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{person.payoutsHeld ? t.payoutsHeldLead : t.payoutsFreeLead}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle()}>
            {person.payoutsHeld ? copy.admin.payouts.lift : copy.admin.payouts.hold}
          </Button>
          <Link
            to="/admin/payouts/$artisanId"
            params={{ artisanId: person.accountId }}
            className="text-sm underline"
          >
            {copy.admin.payouts.history}
          </Link>
        </div>
        <Refusal message={refusal} />
      </CardContent>
    </Card>
  );
}

function ArtisanRecord({ record }: { record: NonNullable<Person["artisanRecord"]> }) {
  const r = t.artisanRecord;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{r.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{r.byArtisan}</dt>
            <dd className="tabular-nums">{record.cancelledByArtisan}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{r.byClients}</dt>
            <dd className="tabular-nums">{record.cancelledByClientsBeforeWorkStarted}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{r.disputes}</dt>
            <dd className="tabular-nums">{record.disputesDecidedAgainst}</dd>
          </div>
        </dl>
        <ul className="space-y-2">
          {record.cancellations.map((each, index) => (
            <li key={`c${index}`}>
              {r.cancellation(each.jobTitle, each.by, each.afterWorkStarted, each.reason)}
              <div className="text-xs text-muted-foreground">{formatDate(each.cancelledAt)}</div>
            </li>
          ))}
          {record.disputes.map((each, index) => (
            <li key={`d${index}`}>
              {r.dispute(
                each.jobTitle,
                formatRands(each.refundedCents),
                formatRands(each.heldCents),
              )}
              <div className="text-xs text-muted-foreground">{formatDate(each.decidedAt)}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
