import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CODE_INPUT, useAppForm } from "@/components/form";
import { AuthCard, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { confirmEmail, resendCode } from "@/web/accounts";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import { copy, pageTitle } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";
import { landingFor } from "@/web/me";

export const Route = createFileRoute("/confirm-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : "",
  }),
  beforeLoad: ({ context }) => onlyForVisitors(context),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: ConfirmEmail,
});

const t = copy.confirm;

function ConfirmEmail() {
  const { email } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const turnstile = useTurnstile();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useAppForm({
    defaultValues: { code: "" },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      const result = await confirmEmail({ data: { email, code: value.code } });
      if (!result.ok && result.refusal.reason === "accept-rules") {
        return navigate({ to: "/sign-in" });
      }
      if (!result.ok) return setRefusal(result.refusal.message);
      await router.invalidate();
      if (result.value.me) await navigate({ to: landingFor(result.value.me) });
    },
  });

  async function resend() {
    setRefusal(null);
    setResent(false);
    const result = await resendCode({ data: { email, turnstileToken: turnstile.token } });
    turnstile.reset();
    if (!result.ok) return setRefusal(result.refusal.message);
    setResent(true);
  }

  return (
    <AuthCard label={copy.signUp.title} title={t.title}>
      <p className="text-sm text-muted-foreground">{t.lead(email)}</p>
      <form.AppForm>
        <form.Form className="space-y-4">
          <form.AppField name="code">
            {(field) => <field.TextField label={t.code} {...CODE_INPUT} />}
          </form.AppField>
          <Refusal message={refusal} />
          {resent && <p className="text-sm text-muted-foreground">{t.resent}</p>}
          <form.Subscribe
            selector={(state) => state.values.code.trim().length === EMAIL_CODE.length}
          >
            {(whole) => (
              <form.Submit size="lg" className="w-full" disabled={!whole}>
                {t.submit}
              </form.Submit>
            )}
          </form.Subscribe>
        </form.Form>
      </form.AppForm>
      <div className="space-y-2 border-t pt-4">
        {turnstile.widget}
        <Button variant="outline" onClick={() => void resend()} disabled={!turnstile.token}>
          {t.resend}
        </Button>
      </div>
    </AuthCard>
  );
}
