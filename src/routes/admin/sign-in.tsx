import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import { adminSignIn, requestAdminCode } from "@/web/admin";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/admin/sign-in")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  component: AdminSignIn,
});

const t = copy.admin.signIn;

/** An Admin signs in with an Email code only (ADR 0015). */
function AdminSignIn() {
  const router = useRouter();
  const navigate = useNavigate();
  const turnstile = useTurnstile();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setRefusal(null);
    const result = await requestAdminCode({ data: { email, turnstileToken: turnstile.token } });
    turnstile.reset();
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setSentTo(result.value.email);
  }

  async function signIn() {
    if (!sentTo) return;
    setBusy(true);
    setRefusal(null);
    const result = await adminSignIn({ data: { email: sentTo, code } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    await router.invalidate();
    await navigate({ to: "/admin" });
  }

  return (
    <Page narrow>
      <NextStepCard label={t.label} title={t.title}>
        {sentTo ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <p className="text-sm text-muted-foreground">{t.sent(sentTo)}</p>
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
            <Refusal message={refusal} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="lg"
                disabled={busy || code.trim().length !== EMAIL_CODE.length}
              >
                {t.submit}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => {
                  setSentTo(null);
                  setCode("");
                  setRefusal(null);
                }}
              >
                {t.otherEmail}
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendCode();
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
            <Button type="submit" size="lg" disabled={busy || !turnstile.token || !email.trim()}>
              {t.send}
            </Button>
          </form>
        )}
      </NextStepCard>
    </Page>
  );
}
