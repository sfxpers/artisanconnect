import { useState } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useAppForm } from "@/components/form";
import { AuthCard, Refusal, RulesCard } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import type { MarketplaceRules } from "@/domain/accounts/rules";
import { getCurrentRules, signIn } from "@/web/accounts";
import { copy } from "@/web/copy";
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
  const [refusal, setRefusal] = useState<{ reason: string; message: string } | null>(null);
  // Set when the Marketplace rules changed since this Account accepted them.
  const [newRules, setNewRules] = useState<MarketplaceRules | null>(null);
  const form = useAppForm({
    defaultValues: { email: "", password: "", acceptsRules: false, consents: false },
    onSubmit: async ({ value }) => {
      setRefusal(null);
      const result = await signIn({
        data: {
          email: value.email,
          password: value.password,
          turnstileToken: turnstile.token,
          acceptsRules:
            newRules && value.acceptsRules && value.consents
              ? { rulesVersion: newRules.version, consentsToDataUse: true }
              : undefined,
        },
      });
      turnstile.reset();
      if (!result.ok) {
        if (result.refusal.reason === "accept-rules") setNewRules(await getCurrentRules());
        return setRefusal(result.refusal);
      }
      await router.invalidate();
      if (result.value.me) await navigate({ to: landingFor(result.value.me) });
    },
  });

  return (
    <AuthCard label={t.label} title={newRules ? t.rulesTitle : t.title}>
      <form.AppForm>
        <form.Form className="space-y-4">
          {newRules ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.rulesLead}</p>
              <RulesCard rules={newRules} />
              <form.AppField name="acceptsRules">
                {(field) => (
                  <field.CheckboxField label={copy.signUp.rules.accept(newRules.version)} />
                )}
              </form.AppField>
              <form.AppField name="consents">
                {(field) => <field.CheckboxField label={copy.consent} />}
              </form.AppField>
            </div>
          ) : (
            <>
              <form.AppField name="email">
                {(field) => <field.TextField label={t.email} type="email" autoComplete="email" />}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.TextField
                    label={t.password}
                    type="password"
                    autoComplete="current-password"
                  />
                )}
              </form.AppField>
            </>
          )}
          {turnstile.widget}
          {refusal?.reason !== "accept-rules" && <Refusal message={refusal?.message} />}
          {refusal?.reason === "email-not-proven" && (
            <Link
              to="/confirm-email"
              search={{ email: form.state.values.email }}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              {t.enterCode}
            </Link>
          )}
          {refusal?.reason === "closed" && (
            <Link
              to="/reopen"
              search={{ email: form.state.values.email }}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              {copy.reopen.submit}
            </Link>
          )}
          <form.Subscribe selector={(state) => state.values.acceptsRules && state.values.consents}>
            {(accepted) => (
              <form.Submit
                size="lg"
                className="w-full"
                disabled={!turnstile.token || (!!newRules && !accepted)}
              >
                {newRules ? t.acceptAndSignIn : t.submit}
              </form.Submit>
            )}
          </form.Subscribe>
        </form.Form>
      </form.AppForm>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <span className="flex flex-col gap-1">
          <Link to="/recover" className="font-medium text-primary underline underline-offset-4">
            {t.forgot}
          </Link>
          <Link
            to="/reopen"
            search={{ email: undefined }}
            className="font-medium text-primary underline underline-offset-4"
          >
            {copy.reopen.link}
          </Link>
        </span>
        <span>
          {t.noAccount}{" "}
          <Link to="/sign-up" className="font-medium text-primary underline underline-offset-4">
            {copy.signUp.title}
          </Link>
        </span>
      </div>
    </AuthCard>
  );
}
