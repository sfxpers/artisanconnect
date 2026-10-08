import { useState } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import type { MarketplaceRules } from "@/domain/accounts/rules";
import { getCurrentRules, signIn } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";
import { landingFor } from "@/web/me";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  component: SignIn,
});

const t = copy.signIn;

function SignIn() {
  const router = useRouter();
  const navigate = useNavigate();
  const turnstile = useTurnstile();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ reason: string; message: string } | null>(null);
  // Set when the Marketplace rules changed since this Account accepted them.
  const [newRules, setNewRules] = useState<MarketplaceRules | null>(null);
  const [accepts, setAccepts] = useState({ rules: false, consent: false });

  async function submit() {
    setBusy(true);
    setRefusal(null);
    const result = await signIn({
      data: {
        email,
        password,
        turnstileToken: turnstile.token,
        acceptsRules:
          newRules && accepts.rules && accepts.consent
            ? { rulesVersion: newRules.version, consentsToDataUse: true }
            : undefined,
      },
    });
    turnstile.reset();
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
      <NextStepCard label={copy.appName} title={newRules ? t.rulesTitle : t.title}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {newRules ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.rulesLead}</p>
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
              <div className="space-y-1.5">
                <Label htmlFor="password">{t.password}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </>
          )}
          {turnstile.widget}
          {refusal?.reason !== "accept-rules" && <Refusal message={refusal?.message} />}
          {refusal?.reason === "email-not-proven" && (
            <Link to="/confirm-email" search={{ email }} className="text-sm underline">
              {t.enterCode}
            </Link>
          )}
          {refusal?.reason === "closed" && (
            <Link to="/reopen" search={{ email }} className="text-sm underline">
              {copy.reopen.submit}
            </Link>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={
              busy || !turnstile.token || (!!newRules && !(accepts.rules && accepts.consent))
            }
          >
            {newRules ? t.acceptAndSignIn : t.submit}
          </Button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex flex-col gap-1">
            <Link to="/recover" className="underline">
              {t.forgot}
            </Link>
            <Link to="/reopen" search={{ email: undefined }} className="underline">
              {copy.reopen.link}
            </Link>
          </span>
          <span>
            {t.noAccount}{" "}
            <Link to="/sign-up" className="underline">
              {copy.signUp.title}
            </Link>
          </span>
        </div>
      </NextStepCard>
    </Page>
  );
}
