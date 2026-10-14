import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CODE_INPUT, useAppForm } from "@/components/form";
import { AuthCard, Refusal } from "@/components/page";
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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { email: "", code: "" },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      if (!sentTo) {
        const sent = await requestAdminCode({
          data: { email: value.email, turnstileToken: turnstile.token },
        });
        turnstile.reset();
        if (!sent.ok) return setRefusal(sent.refusal.message);
        return setSentTo(sent.value.email);
      }
      const result = await adminSignIn({ data: { email: sentTo, code: value.code } });
      if (!result.ok) return setRefusal(result.refusal.message);
      await router.invalidate();
      await navigate({ to: "/admin" });
    },
  });

  return (
    <AuthCard label={t.label} title={t.title}>
      <form.AppForm>
        <form.Form className="space-y-4">
          {sentTo ? (
            <>
              <p className="text-sm text-muted-foreground">{t.sent(sentTo)}</p>
              <form.AppField name="code">
                {(field) => <field.TextField label={t.code} {...CODE_INPUT} />}
              </form.AppField>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t.lead}</p>
              <form.AppField name="email">
                {(field) => <field.TextField label={t.email} type="email" autoComplete="email" />}
              </form.AppField>
              {turnstile.widget}
            </>
          )}
          <Refusal message={refusal} />
          <div className="flex flex-wrap gap-2">
            <form.Subscribe
              selector={(state) =>
                sentTo
                  ? state.values.code.trim().length === EMAIL_CODE.length
                  : !!state.values.email.trim()
              }
            >
              {(ready) => (
                <form.Submit size="lg" disabled={!ready || (!sentTo && !turnstile.token)}>
                  {sentTo ? t.submit : t.send}
                </form.Submit>
              )}
            </form.Subscribe>
            {sentTo && (
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => {
                  setSentTo(null);
                  form.setFieldValue("code", "");
                  setRefusal(null);
                }}
              >
                {t.otherEmail}
              </Button>
            )}
          </div>
        </form.Form>
      </form.AppForm>
    </AuthCard>
  );
}
