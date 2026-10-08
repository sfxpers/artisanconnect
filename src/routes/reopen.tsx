import { useState } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import type { MarketplaceRules } from "@/domain/accounts/rules";
import { getCurrentRules, reopen, requestReopenCode } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";
import { landingFor } from "@/web/me";

export const Route = createFileRoute("/reopen")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: Reopen,
});

const t = copy.reopen;

/** A Closed Account reopens with its Email and an Email code (#141), and is signed in. */
function Reopen() {
  const router = useRouter();
  const navigate = useNavigate();
  const turnstile = useTurnstile();
  const search = Route.useSearch();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(search.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ reason: string; message: string } | null>(null);
  // Set when the Marketplace rules changed while the Account was Closed.
  const [newRules, setNewRules] = useState<MarketplaceRules | null>(null);
  const [accepts, setAccepts] = useState({ rules: false, consent: false });

  async function send() {
    setBusy(true);
    setRefusal(null);
    const result = await requestReopenCode({ data: { email, turnstileToken: turnstile.token } });
    turnstile.reset();
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal);
    setEmail(result.value.email);
    setStage("code");
  }

  async function submit() {
    setBusy(true);
    setRefusal(null);
    const result = await reopen({
      data: {
        email,
        code,
        acceptsRules:
          newRules && accepts.rules && accepts.consent
            ? { rulesVersion: newRules.version, consentsToDataUse: true }
            : undefined,
      },
    });
    setBusy(false);
    if (!result.ok) {
      if (result.refusal.reason === "accept-rules") setNewRules(await getCurrentRules());
      return setRefusal(result.refusal);
    }
    await router.invalidate();
    if (result.value.me) await navigate({ to: landingFor(result.value.me) });
  }

  return (
    <Page narrow>
      <NextStepCard label={copy.signIn.title} title={newRules ? copy.signIn.rulesTitle : t.title}>
        {stage === "email" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <p className="text-sm text-muted-foreground">{t.lead}</p>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {turnstile.widget}
            <Refusal message={refusal?.message} />
            <Button type="submit" size="lg" disabled={busy || !turnstile.token}>
              {t.send}
            </Button>
          </form>
        )}
        {stage === "code" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {newRules ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{copy.signIn.rulesLead}</p>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {copy.rules.version(newRules.version, formatDate(newRules.publishedAt))}
                  </div>
                  <p>{newRules.summary}</p>
                  <Link to="/rules" target="_blank" className="underline">
                    {copy.signUp.rules.read}
                  </Link>
                </div>
                <Label className="items-start gap-2 leading-snug font-normal">
                  <Checkbox
                    checked={accepts.rules}
                    onCheckedChange={(checked) => setAccepts({ ...accepts, rules: checked })}
                  />
                  {copy.signUp.rules.accept(newRules.version)}
                </Label>
                <Label className="items-start gap-2 leading-snug font-normal">
                  <Checkbox
                    checked={accepts.consent}
                    onCheckedChange={(checked) => setAccepts({ ...accepts, consent: checked })}
                  />
                  {copy.consent}
                </Label>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t.sent(email)}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="code">{t.code}</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={EMAIL_CODE.length}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
              </>
            )}
            {refusal?.reason !== "accept-rules" && <Refusal message={refusal?.message} />}
            <Button
              type="submit"
              size="lg"
              disabled={busy || (!!newRules && !(accepts.rules && accepts.consent))}
            >
              {newRules ? t.acceptAndReopen : t.submit}
            </Button>
          </form>
        )}
      </NextStepCard>
    </Page>
  );
}
