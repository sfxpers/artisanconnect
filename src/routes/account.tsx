import { useState, type ReactNode } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Page, Refusal } from "@/components/page";
import { changeNames, signOut, withdrawNames } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import type { Me } from "@/web/me";

export const Route = createFileRoute("/account")({
  beforeLoad: ({ context }) => ({ me: onlyFor("account", context) }),
  component: Account,
});

const t = copy.account;

/** Settings rows. Changing the others comes with Account self-service (#141). */
function Account() {
  const { me } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <Page title={t.title} narrow>
      <Card className="py-0">
        <dl className="divide-y">
          <SettingsRow label={t.kind}>{copy.signUp.kind.chosen[me.kind]}</SettingsRow>
          <SettingsRow label={t.name}>{me.name}</SettingsRow>
          <SettingsRow label={t.tradingName}>{me.tradingName ?? t.none}</SettingsRow>
          <NamesRow me={me} />
          <SettingsRow label={t.email}>{me.email}</SettingsRow>
          <SettingsRow label={t.rules}>
            <Link to="/rules" className="underline">
              {t.accepted(me.rules.version, formatDate(me.rules.acceptedAt))}
            </Link>
          </SettingsRow>
          <SettingsRow label={t.support}>
            <Link to="/support" className="underline">
              {t.supportLink}
            </Link>
          </SettingsRow>
        </dl>
      </Card>
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          await router.invalidate();
          await navigate({ to: "/" });
        }}
      >
        {t.signOut}
      </Button>
    </Page>
  );
}

/**
 * Where the names stand: being checked (and withdrawable), refused with the
 * Admin's reason, or not yet seen by anyone else; and a way to give new ones.
 */
function NamesRow({ me }: { me: Me }) {
  const router = useRouter();
  const { names } = me;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [tradingName, setTradingName] = useState(me.tradingName ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setRefusal(null);
    const result = await changeNames({ data: { name, tradingName } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setEditing(false);
    setDone(result.value.names === "shown" ? t.names.saved : t.names.held);
    await router.invalidate();
  }

  async function withdraw() {
    setBusy(true);
    setRefusal(null);
    const result = await withdrawNames();
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setDone(null);
    await router.invalidate();
  }

  return (
    <div className="space-y-3 p-4">
      {names.beingChecked && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{t.names.beingChecked}</Badge>
            {[names.beingChecked.name, names.beingChecked.tradingName].filter(Boolean).join(" · ")}
          </div>
          <p className="text-xs text-muted-foreground">{t.names.beingCheckedLead}</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void withdraw()}>
            {t.names.withdraw}
          </Button>
        </div>
      )}
      {names.refused && (
        <p role="alert" className="text-sm text-destructive">
          {t.names.refused(names.refused.reason)}
        </p>
      )}
      {!names.shown && !names.beingChecked && (
        <p className="text-sm text-muted-foreground">{t.names.notShown}</p>
      )}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">{copy.signUp.names.name}</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tradingName">{copy.signUp.names.tradingName}</Label>
            <Input
              id="tradingName"
              autoComplete="organization"
              value={tradingName}
              onChange={(event) => setTradingName(event.target.value)}
            />
          </div>
          <Refusal message={refusal} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {t.names.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {t.names.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {!names.beingChecked && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {t.names.change}
            </Button>
          )}
          <Refusal message={refusal} />
        </>
      )}
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
