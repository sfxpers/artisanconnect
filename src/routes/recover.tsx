import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { CODE_INPUT, useAppForm } from "@/components/form";
import { AuthCard, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { recover, requestRecovery } from "@/web/accounts";
import { copy, pageTitle } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/recover")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: Recover,
});

const t = copy.recover;

function Recover() {
  const turnstile = useTurnstile();
  const [stage, setStage] = useState<"email" | "code" | "done">("email");
  const [refusal, setRefusal] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { email: "", code: "", password: "" },
    onSubmit: async ({ value, formApi }) => {
      setRefusal(null);
      if (stage === "email") {
        const sent = await requestRecovery({
          data: { email: value.email, turnstileToken: turnstile.token },
        });
        turnstile.reset();
        if (!sent.ok) return setRefusal(sent.refusal.message);
        formApi.setFieldValue("email", sent.value.email);
        return setStage("code");
      }
      const result = await recover({ data: value });
      if (!result.ok) return setRefusal(result.refusal.message);
      setStage("done");
    },
  });

  return (
    <AuthCard label={copy.signIn.title} title={t.title}>
      {stage === "done" ? (
        <div className="space-y-4">
          <p className="text-sm">{t.done}</p>
          <Link to="/sign-in" className={buttonVariants()}>
            {t.signIn}
          </Link>
        </div>
      ) : (
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
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t.sent(form.state.values.email)}</p>
                <form.AppField name="code">
                  {(field) => <field.TextField label={t.code} {...CODE_INPUT} />}
                </form.AppField>
                <form.AppField name="password">
                  {(field) => (
                    <field.TextField
                      label={t.password}
                      type="password"
                      autoComplete="new-password"
                    />
                  )}
                </form.AppField>
              </>
            )}
            <Refusal message={refusal} />
            <form.Submit
              size="lg"
              className="w-full"
              disabled={stage === "email" && !turnstile.token}
            >
              {stage === "email" ? t.send : t.submit}
            </form.Submit>
          </form.Form>
        </form.AppForm>
      )}
    </AuthCard>
  );
}
