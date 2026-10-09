import { useState, type ReactNode } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Page, Refusal } from "@/components/page";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import {
  changeEmail,
  changeNames,
  closeAccount,
  requestEmailChange,
  setVatNumber,
  signOut,
  withdrawNames,
} from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { getMyDataRequests, requestData } from "@/web/data-requests";
import { onlyFor } from "@/web/guards";
import type { Me } from "@/web/me";

export const Route = createFileRoute("/account")({
  beforeLoad: ({ context }) => ({ me: onlyFor("account", context) }),
  loader: () => getMyDataRequests(),
  component: Account,
});

const t = copy.account;

/** Every setting of the Account in one place (#141). */
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
          <SettingsRow label={t.email}>
            <EmailRow email={me.email} />
          </SettingsRow>
          {me.kind === "artisan" && (
            <>
              <SettingsRow label={t.vat.label}>
                <VatNumber vatNumber={me.vatNumber} />
              </SettingsRow>
              <SettingsRow label={t.payoutAccount.label}>
                <div>
                  {me.payoutAccount
                    ? t.payoutAccount.ending(me.payoutAccount.bank, me.payoutAccount.accountEnding)
                    : t.payoutAccount.none}
                </div>
                <Link to="/verification" className="underline">
                  {t.payoutAccount.change}
                </Link>
              </SettingsRow>
            </>
          )}
          <SettingsRow label={t.rules}>
            <Link to="/rules" className="underline">
              {t.accepted(me.rules.version, formatDate(me.rules.acceptedAt))}
            </Link>
          </SettingsRow>
          {me.kind === "artisan" && (
            <SettingsRow label={t.identityNumber.label}>
              <div>{me.identityNumber ?? t.identityNumber.none}</div>
              <p className="text-xs text-muted-foreground">{t.identityNumber.lead}</p>
            </SettingsRow>
          )}
          <SettingsRow label={t.support}>
            <Link to="/support" className="underline">
              {t.supportLink}
            </Link>
          </SettingsRow>
          <StandingRows standing={me.standing} />
          <SettingsRow label={t.data.label}>
            <DataRequests />
          </SettingsRow>
          <SettingsRow label={t.close.label}>
            <CloseAccount />
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

/** The Account's Suspension, with the reason, while one stands, and its warnings (#136). */
function StandingRows({ standing }: { standing: Me["standing"] }) {
  const s = copy.standing;
  return (
    <>
      {standing.suspended && (
        <SettingsRow label={s.suspended}>
          <span className="text-destructive">{standing.suspended.reason}</span>
          <span className="block text-xs text-muted-foreground">
            {s.since(formatDate(standing.suspended.since))}
          </span>
        </SettingsRow>
      )}
      <SettingsRow label={s.warnings}>
        {standing.warnings.length === 0 ? (
          s.none
        ) : (
          <ul className="space-y-1">
            {standing.warnings.map((warning, index) => (
              <li key={index}>
                {warning.reason}
                <span className="block text-xs text-muted-foreground">
                  {s.warned(formatDate(warning.at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsRow>
    </>
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

/**
 * The Email, and a change of it: a code goes to the new one, and until it is
 * entered the Email stays as it is.
 */
function EmailRow({ email }: { email: string }) {
  const router = useRouter();
  const e = t.emailChange;
  const [stage, setStage] = useState<"shown" | "new" | "code">("shown");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    setBusy(true);
    setRefusal(null);
    const result = await requestEmailChange({ data: { email: newEmail, password } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setPassword("");
    setNewEmail(result.value.email);
    setStage("code");
  }

  async function confirm() {
    setBusy(true);
    setRefusal(null);
    const result = await changeEmail({ data: { email: newEmail, code } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setStage("shown");
    setCode("");
    setDone(true);
    await router.invalidate();
  }

  function cancel() {
    setStage("shown");
    setRefusal(null);
    setPassword("");
    setCode("");
  }

  return (
    <div className="space-y-2">
      <div>{email}</div>
      {done && <p className="text-xs text-muted-foreground">{e.done}</p>}
      {stage === "shown" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDone(false);
            setNewEmail("");
            setStage("new");
          }}
        >
          {e.change}
        </Button>
      )}
      {stage === "new" && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <p className="text-xs text-muted-foreground">{e.lead}</p>
          <Label htmlFor="new-email">{e.newEmail}</Label>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
          <Label htmlFor="current-password">{e.password}</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Refusal message={refusal} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {e.send}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>
              {e.cancel}
            </Button>
          </div>
        </form>
      )}
      {stage === "code" && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <p className="text-xs text-muted-foreground">{e.sent(newEmail)}</p>
          <Label htmlFor="email-code">{e.code}</Label>
          <Input
            id="email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={EMAIL_CODE.length}
            className="max-w-40"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Refusal message={refusal} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {e.submit}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>
              {e.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * The Account's Data requests, each with where it stands and a sent copy's
 * download, and a way to ask for a copy or for erasure, which closes it.
 */
function DataRequests() {
  const requests = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const d = t.data;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function ask(kind: "copy" | "erasure") {
    if (kind === "erasure" && !window.confirm(d.confirmErasure)) return;
    setBusy(true);
    setRefusal(null);
    const result = await requestData({ data: { kind } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    await router.invalidate();
    if (kind === "erasure") await navigate({ to: "/" });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{d.lead}</p>
      {requests.length > 0 && (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.requestId} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                {d.kinds[request.kind]}
                <Badge variant={request.state === "refused" ? "destructive" : "secondary"}>
                  {d.states[request.state]}
                </Badge>
                {request.state === "sent" && (
                  <a href={`/data-exports/${request.requestId}`} className="underline" download>
                    {d.download}
                  </a>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.asked(formatDate(request.requestedAt))}
              </div>
              {request.reason && <div className="text-xs">{d.refused(request.reason)}</div>}
            </li>
          ))}
        </ul>
      )}
      <Refusal message={refusal} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void ask("copy")}>
          {d.copy}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void ask("erasure")}>
          {d.erasure}
        </Button>
      </div>
    </div>
  );
}

/** Closing the Account, refused while an Engagement is in progress. */
function CloseAccount() {
  const router = useRouter();
  const navigate = useNavigate();
  const c = t.close;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function close() {
    if (!window.confirm(c.confirm)) return;
    setBusy(true);
    setRefusal(null);
    const result = await closeAccount();
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    await router.invalidate();
    await navigate({ to: "/" });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{c.lead}</p>
      <Refusal message={refusal} />
      <Button variant="destructive" size="sm" disabled={busy} onClick={() => void close()}>
        {c.submit}
      </Button>
    </div>
  );
}

/** An Artisan's VAT number, stated or cleared: their Quotes' amounts include VAT. */
function VatNumber({ vatNumber }: { vatNumber: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(vatNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(next: string) {
    setBusy(true);
    setRefusal(null);
    const result = await setVatNumber({ data: { vatNumber: next } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setEditing(false);
    setDone(true);
    await router.invalidate();
  }

  if (editing) {
    return (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save(value);
        }}
      >
        <Input
          aria-label={t.vat.label}
          inputMode="numeric"
          placeholder={t.vat.placeholder}
          className="max-w-48"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.vat.lead}</p>
        <Refusal message={refusal} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {t.vat.save}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t.vat.cancel}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className="space-y-2">
      <div>{vatNumber ?? t.vat.none}</div>
      {done && <p className="text-xs text-muted-foreground">{t.vat.saved}</p>}
      <Refusal message={refusal} />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDone(false);
            setValue(vatNumber ?? "");
            setEditing(true);
          }}
        >
          {vatNumber ? t.vat.change : t.vat.add}
        </Button>
        {vatNumber && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save("")}>
            {t.vat.remove}
          </Button>
        )}
      </div>
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
