import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { confirmEmail, resendCode } from "@/web/accounts";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";
import { landingFor } from "@/web/me";

export const Route = createFileRoute("/confirm-email")({
  validateSearch: (search: Record<string, unknown>) => ({ email: String(search.email ?? "") }),
  beforeLoad: ({ context }) => onlyForVisitors(context.me),
  component: ConfirmEmail,
});

const t = copy.confirm;

function ConfirmEmail() {
  const { email } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const turnstile = useTurnstile();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function confirm() {
    setBusy(true);
    setRefusal(null);
    const result = await confirmEmail({ data: { email, code } });
    setBusy(false);
    if (!result.ok && result.refusal.reason === "accept-rules") {
      return navigate({ to: "/sign-in" });
    }
    if (!result.ok) return setRefusal(result.refusal.message);
    await router.invalidate();
    if (result.value.me) await navigate({ to: landingFor(result.value.me) });
  }

  async function resend() {
    setRefusal(null);
    setResent(false);
    const result = await resendCode({ data: { email, turnstileToken: turnstile.token } });
    turnstile.reset();
    if (!result.ok) return setRefusal(result.refusal.message);
    setResent(true);
  }

  return (
    <Page narrow>
      <NextStepCard label={copy.signUp.title} title={t.title}>
        <p className="text-sm text-muted-foreground">{t.lead(email)}</p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
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
          {resent && <p className="text-sm text-muted-foreground">{t.resent}</p>}
          <Button
            type="submit"
            size="lg"
            disabled={busy || code.trim().length !== EMAIL_CODE.length}
          >
            {t.submit}
          </Button>
        </form>
        <div className="space-y-2 border-t pt-4">
          {turnstile.widget}
          <Button variant="outline" onClick={() => void resend()} disabled={!turnstile.token}>
            {t.resend}
          </Button>
        </div>
      </NextStepCard>
    </Page>
  );
}
