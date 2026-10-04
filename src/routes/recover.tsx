import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { recover, requestRecovery } from "@/web/accounts";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/recover")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  component: Recover,
});

const t = copy.recover;

function Recover() {
  const turnstile = useTurnstile();
  const [stage, setStage] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setRefusal(null);
    const result = await requestRecovery({ data: { email, turnstileToken: turnstile.token } });
    turnstile.reset();
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setEmail(result.value.email);
    setStage("code");
  }

  async function setNewPassword() {
    setBusy(true);
    setRefusal(null);
    const result = await recover({ data: { email, code, password } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setStage("done");
  }

  return (
    <Page narrow>
      <NextStepCard label={copy.signIn.title} title={t.title}>
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
            <Refusal message={refusal} />
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
              void setNewPassword();
            }}
          >
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
            <div className="space-y-1.5">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Refusal message={refusal} />
            <Button type="submit" size="lg" disabled={busy}>
              {t.submit}
            </Button>
          </form>
        )}
        {stage === "done" && (
          <div className="space-y-4">
            <p className="text-sm">{t.done}</p>
            <Link to="/sign-in" className={buttonVariants()}>
              {t.signIn}
            </Link>
          </div>
        )}
      </NextStepCard>
    </Page>
  );
}
