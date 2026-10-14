import { useState, type ReactNode } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useConfirm } from "@/components/confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTurnstile } from "@/components/turnstile";
import { CODE_INPUT, useAppForm } from "@/components/form";
import { useAction } from "@/components/use-action";
import { Page, Refusal } from "@/components/page";
import {
  changeEmail,
  changeNames,
  closeAccount,
  requestEmailChange,
  setVatNumber,
  signOut,
  withdrawNames,
} from "@/web/accounts";
import { copy, formatDate, pageTitle } from "@/web/copy";
import { getMyDataRequests, requestData } from "@/web/data-requests";
import { onlyFor } from "@/web/guards";
import type { Me } from "@/web/me";

export const Route = createFileRoute("/account")({
  beforeLoad: ({ context }) => ({ me: onlyFor("account", context) }),
  loader: () => getMyDataRequests(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
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
                <Link
                  to="/verification"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {t.payoutAccount.change}
                </Link>
              </SettingsRow>
            </>
          )}
          <SettingsRow label={t.rules}>
            <Link to="/rules" className="font-medium text-primary underline underline-offset-4">
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
            <Link to="/support" className="font-medium text-primary underline underline-offset-4">
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
  const { names } = me;
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { busy, refusal, run } = useAction();
  const form = useAppForm({
    defaultValues: { name: me.name, tradingName: me.tradingName ?? "" },
    onSubmit: ({ value }) =>
      run(
        () => changeNames({ data: value }),
        (saved) => {
          setEditing(false);
          setDone(saved.names === "shown" ? t.names.saved : t.names.held);
        },
      ),
  });

  return (
    // Under the names, in their value column, so changing them reads as part of them.
    <div className="space-y-3 p-4 sm:grid sm:grid-cols-3">
      <div className="space-y-3 sm:col-span-2 sm:col-start-2">
        {names.beingChecked && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="warning">{t.names.beingChecked}</Badge>
              {[names.beingChecked.name, names.beingChecked.tradingName]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <p className="text-xs text-muted-foreground">{t.names.beingCheckedLead}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run(withdrawNames, () => setDone(null))}
            >
              {t.names.withdraw}
            </Button>
          </div>
        )}
        {names.refused && <Refusal message={t.names.refused(names.refused.reason)} />}
        {!names.shown && !names.beingChecked && (
          <p className="text-sm text-muted-foreground">{t.names.notShown}</p>
        )}
        {done && <p className="text-sm text-muted-foreground">{done}</p>}
        {editing ? (
          <form.AppForm>
            <form.Form className="space-y-3">
              <form.AppField name="name">
                {(field) => <field.TextField label={copy.signUp.names.name} autoComplete="name" />}
              </form.AppField>
              <form.AppField name="tradingName">
                {(field) => (
                  <field.TextField
                    label={copy.signUp.names.tradingName}
                    autoComplete="organization"
                  />
                )}
              </form.AppField>
              <Refusal message={refusal} />
              <div className="flex gap-2">
                <form.Submit>{t.names.save}</form.Submit>
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  {t.names.cancel}
                </Button>
              </div>
            </form.Form>
          </form.AppForm>
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
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const turnstile = useTurnstile();
  const form = useAppForm({
    defaultValues: { email: "", password: "", code: "" },
    onSubmit: async ({ value, formApi }) => {
      setRefusal(null);
      if (stage === "new") {
        const sent = await requestEmailChange({
          data: { email: value.email, password: value.password, turnstileToken: turnstile.token },
        });
        turnstile.reset();
        if (!sent.ok) return setRefusal(sent.refusal.message);
        formApi.setFieldValue("email", sent.value.email);
        return setStage("code");
      }
      const result = await changeEmail({ data: { email: value.email, code: value.code } });
      if (!result.ok) return setRefusal(result.refusal.message);
      setStage("shown");
      setDone(true);
      await router.invalidate();
    },
  });

  function cancel() {
    setStage("shown");
    setRefusal(null);
  }

  return (
    <div className="space-y-2">
      <div>{email}</div>
      {done && <p className="text-xs text-muted-foreground">{e.done}</p>}
      {stage === "shown" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDone(false);
            form.reset();
            setStage("new");
          }}
        >
          {e.change}
        </Button>
      ) : (
        <form.AppForm>
          <form.Form className="space-y-2">
            {stage === "new" ? (
              <>
                <p className="text-xs text-muted-foreground">{e.lead}</p>
                <form.AppField name="email">
                  {(field) => (
                    <field.TextField label={e.newEmail} type="email" autoComplete="email" />
                  )}
                </form.AppField>
                <form.AppField name="password">
                  {(field) => (
                    <field.TextField
                      label={e.password}
                      type="password"
                      autoComplete="current-password"
                    />
                  )}
                </form.AppField>
                {turnstile.widget}
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{e.sent(form.state.values.email)}</p>
                <form.AppField name="code">
                  {(field) => (
                    <field.TextField label={e.code} className="max-w-40" {...CODE_INPUT} />
                  )}
                </form.AppField>
              </>
            )}
            <Refusal message={refusal} />
            <div className="flex gap-2">
              <form.Submit size="sm" disabled={stage === "new" && !turnstile.token}>
                {stage === "new" ? e.send : e.submit}
              </form.Submit>
              <Button type="button" size="sm" variant="ghost" onClick={cancel}>
                {e.cancel}
              </Button>
            </div>
          </form.Form>
        </form.AppForm>
      )}
    </div>
  );
}

/**
 * The Account's Data requests, each with where it stands and a sent copy's
 * download, and a way to ask for a copy or for erasure, which closes it.
 */
function DataRequests() {
  const confirm = useConfirm();
  const requests = Route.useLoaderData();
  const navigate = useNavigate();
  const d = t.data;
  const { busy, refusal, run } = useAction();

  async function ask(kind: "copy" | "erasure") {
    if (kind === "erasure" && !(await confirm(d.confirmErasure))) return;
    void run(
      () => requestData({ data: { kind } }),
      () => kind === "erasure" && navigate({ to: "/" }),
    );
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
                  <a
                    href={`/data-exports/${request.requestId}`}
                    className="font-medium text-primary underline underline-offset-4"
                    download
                  >
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
        <Button variant="outline" size="sm" disabled={busy} onClick={() => ask("copy")}>
          {d.copy}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => ask("erasure")}>
          {d.erasure}
        </Button>
      </div>
    </div>
  );
}

/** Closing the Account, refused while an Engagement is in progress. */
function CloseAccount() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const c = t.close;
  const { busy, refusal, run } = useAction();

  async function close() {
    if (await confirm(c.confirm)) void run(closeAccount, () => navigate({ to: "/" }));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{c.lead}</p>
      <Refusal message={refusal} />
      <Button variant="destructive" size="sm" disabled={busy} onClick={close}>
        {c.submit}
      </Button>
    </div>
  );
}

/** An Artisan's VAT number, stated or cleared: their Quotes' amounts include VAT. */
function VatNumber({ vatNumber }: { vatNumber: string | null }) {
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(false);
  const { busy, refusal, run } = useAction();
  const form = useAppForm({
    defaultValues: { vatNumber: vatNumber ?? "" },
    onSubmit: ({ value }) => save(value.vatNumber),
  });

  function save(next: string) {
    return run(
      () => setVatNumber({ data: { vatNumber: next } }),
      () => {
        setEditing(false);
        setDone(true);
      },
    );
  }

  if (editing) {
    return (
      <form.AppForm>
        <form.Form className="space-y-2">
          <form.AppField name="vatNumber">
            {(field) => (
              <field.TextField
                label={t.vat.label}
                description={t.vat.lead}
                inputMode="numeric"
                placeholder={t.vat.placeholder}
                className="max-w-48"
              />
            )}
          </form.AppField>
          <Refusal message={refusal} />
          <div className="flex gap-2">
            <form.Submit size="sm">{t.vat.save}</form.Submit>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t.vat.cancel}
            </Button>
          </div>
        </form.Form>
      </form.AppForm>
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
            form.reset();
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
    <div className="grid gap-1 p-4 sm:grid-cols-3 sm:*:last:col-span-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
