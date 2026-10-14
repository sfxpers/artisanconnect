import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { CODE_INPUT, useAppForm } from "@/components/form";
import { AuthCard, Refusal, RulesCard } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import type { MarketplaceRules } from "@/domain/accounts/rules";
import { getCurrentRules, reopen, requestReopenCode } from "@/web/accounts";
import { copy, pageTitle } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";
import { landingFor } from "@/web/me";

export const Route = createFileRoute("/reopen")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
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
  const [refusal, setRefusal] = useState<{ reason: string; message: string } | null>(null);
  // Set when the Marketplace rules changed while the Account was Closed.
  const [newRules, setNewRules] = useState<MarketplaceRules | null>(null);
  const form = useAppForm({
    defaultValues: { email: search.email ?? "", code: "", acceptsRules: false, consents: false },
    onSubmit: async ({ value, formApi }) => {
      setRefusal(null);
      if (stage === "email") {
        const sent = await requestReopenCode({
          data: { email: value.email, turnstileToken: turnstile.token },
        });
        turnstile.reset();
        if (!sent.ok) return setRefusal(sent.refusal);
        formApi.setFieldValue("email", sent.value.email);
        return setStage("code");
      }
      const result = await reopen({
        data: {
          email: value.email,
          code: value.code,
          acceptsRules:
            newRules && value.acceptsRules && value.consents
              ? { rulesVersion: newRules.version, consentsToDataUse: true }
              : undefined,
        },
      });
      if (!result.ok) {
        if (result.refusal.reason === "accept-rules") setNewRules(await getCurrentRules());
        return setRefusal(result.refusal);
      }
      await router.invalidate();
      if (result.value.me) await navigate({ to: landingFor(result.value.me) });
    },
  });

  return (
    <AuthCard label={copy.signIn.title} title={newRules ? copy.signIn.rulesTitle : t.title}>
      <form.AppForm>
        <form.Form className="space-y-4">
          {stage === "email" ? (
            <>
              <p className="text-sm text-muted-foreground">{t.lead}</p>
              <form.AppField name="email">
                {(field) => <field.TextField label={t.email} type="email" autoComplete="email" />}
              </form.AppField>
              {turnstile.widget}
            </>
          ) : newRules ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{copy.signIn.rulesLead}</p>
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
              <p className="text-sm text-muted-foreground">{t.sent(form.state.values.email)}</p>
              <form.AppField name="code">
                {(field) => <field.TextField label={t.code} {...CODE_INPUT} />}
              </form.AppField>
            </>
          )}
          {refusal?.reason !== "accept-rules" && <Refusal message={refusal?.message} />}
          <form.Subscribe selector={(state) => state.values.acceptsRules && state.values.consents}>
            {(accepted) => (
              <form.Submit
                size="lg"
                className="w-full"
                disabled={stage === "email" ? !turnstile.token : !!newRules && !accepted}
              >
                {stage === "email" ? t.send : newRules ? t.acceptAndReopen : t.submit}
              </form.Submit>
            )}
          </form.Subscribe>
        </form.Form>
      </form.AppForm>
    </AuthCard>
  );
}
