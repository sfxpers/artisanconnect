import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppForm } from "@/components/form";
import { Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { email, name, password, tradingNameText } from "@/domain/accounts/inputs";
import { getCurrentRules, signUp } from "@/web/accounts";
import { copy, pageTitle } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  loader: () => getCurrentRules(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: SignUp,
});

const STEPS = ["kind", "names", "email", "rules"] as const;
type Step = (typeof STEPS)[number];

const t = copy.signUp;

/** Sign-up as a record of folded rows (#106): kind, names, Email and password, rules. */
function SignUp() {
  const rules = Route.useLoaderData();
  const navigate = useNavigate();
  const turnstile = useTurnstile();
  const [step, setStep] = useState<Step>("kind");
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      kind: null as "client" | "artisan" | null,
      name: "",
      tradingName: "",
      email: "",
      password: "",
      acceptsRules: false,
      consentsToDataUse: false,
    },
    onSubmit: async ({ value }) => {
      if (!value.kind || !value.acceptsRules || !value.consentsToDataUse) return;
      setRefusal(null);
      const result = await signUp({
        data: {
          kind: value.kind,
          name: value.name,
          tradingName: value.tradingName,
          email: value.email,
          password: value.password,
          rulesVersion: rules.version,
          consentsToDataUse: true,
          turnstileToken: turnstile.token,
        },
      });
      turnstile.reset();
      if (!result.ok) {
        setRefusal(result.refusal.message);
        // The Content check refused the names: back to them, as typed.
        if (result.refusal.reason === "content") setStep("names");
        return;
      }
      await navigate({ to: "/confirm-email", search: { email: result.value.email } });
    },
  });

  const at = STEPS.indexOf(step);
  async function continueFrom(fields: ("name" | "tradingName" | "email" | "password")[]) {
    const errors = await Promise.all(
      fields.map(async (field) => form.validateField(field, "submit")),
    );
    if (errors.every((list) => list.length === 0)) setStep(STEPS[at + 1]!);
  }

  return (
    <Page title={t.title} narrow>
      <form.AppForm>
        <form.Form className="space-y-3">
          <Row title={t.kind.step} index={0} at={at} onChange={() => setStep("kind")}>
            {(open) =>
              open ? (
                <form.Field name="kind">
                  {(field) => (
                    <div className="space-y-3">
                      <RadioGroup
                        aria-label={t.kind.step}
                        value={field.state.value}
                        onValueChange={(kind) => {
                          field.handleChange(kind as "client" | "artisan");
                          setStep("names");
                        }}
                        className="grid gap-3 sm:grid-cols-2"
                      >
                        {(["client", "artisan"] as const).map((kind) => (
                          <FieldLabel key={kind} htmlFor={`kind-${kind}`}>
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>{t.kind[kind]}</FieldTitle>
                                <FieldDescription>
                                  {kind === "client" ? t.kind.clientHint : t.kind.artisanHint}
                                </FieldDescription>
                              </FieldContent>
                              <RadioGroupItem value={kind} id={`kind-${kind}`} />
                            </Field>
                          </FieldLabel>
                        ))}
                      </RadioGroup>
                      <p className="text-xs text-muted-foreground">{t.kind.fixed}</p>
                    </div>
                  )}
                </form.Field>
              ) : (
                <form.Subscribe selector={(state) => state.values.kind}>
                  {(kind) => (kind ? t.kind.chosen[kind] : null)}
                </form.Subscribe>
              )
            }
          </Row>

          <Row title={t.names.step} index={1} at={at} onChange={() => setStep("names")}>
            {(open) =>
              open ? (
                <div className="space-y-4">
                  <form.AppField name="name" validators={{ onSubmit: name }}>
                    {(field) => <field.TextField label={t.names.name} autoComplete="name" />}
                  </form.AppField>
                  <form.AppField name="tradingName" validators={{ onSubmit: tradingNameText }}>
                    {(field) => (
                      <field.TextField label={t.names.tradingName} autoComplete="organization" />
                    )}
                  </form.AppField>
                  <form.Subscribe selector={(state) => state.values.kind}>
                    {(kind) => (
                      <p className="text-xs text-muted-foreground">
                        {kind === "artisan" ? t.names.artisanHint : t.names.clientHint}
                      </p>
                    )}
                  </form.Subscribe>
                  <Refusal message={refusal} />
                  <Button type="button" onClick={() => void continueFrom(["name", "tradingName"])}>
                    {t.continue}
                  </Button>
                </div>
              ) : (
                <form.Subscribe selector={(state) => [state.values.name, state.values.tradingName]}>
                  {([fullName, trading]) => [fullName, trading].filter(Boolean).join(" · ")}
                </form.Subscribe>
              )
            }
          </Row>

          <Row title={t.email.step} index={2} at={at} onChange={() => setStep("email")}>
            {(open) =>
              open ? (
                <div className="space-y-4">
                  <form.AppField name="email" validators={{ onSubmit: email }}>
                    {(field) => (
                      <field.TextField label={t.email.email} type="email" autoComplete="email" />
                    )}
                  </form.AppField>
                  <form.AppField name="password" validators={{ onSubmit: password }}>
                    {(field) => (
                      <field.TextField
                        label={t.email.password}
                        type="password"
                        autoComplete="new-password"
                      />
                    )}
                  </form.AppField>
                  <Button type="button" onClick={() => void continueFrom(["email", "password"])}>
                    {t.continue}
                  </Button>
                </div>
              ) : (
                <form.Subscribe selector={(state) => state.values.email}>
                  {(value) => value}
                </form.Subscribe>
              )
            }
          </Row>

          <Row title={t.rules.step} index={3} at={at} onChange={() => setStep("rules")}>
            {(open) =>
              open && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {rules.summary}{" "}
                    <Link
                      to="/rules"
                      target="_blank"
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      {t.rules.read}
                    </Link>
                  </p>
                  <form.AppField name="acceptsRules">
                    {(field) => <field.CheckboxField label={t.rules.accept(rules.version)} />}
                  </form.AppField>
                  <form.AppField name="consentsToDataUse">
                    {(field) => <field.CheckboxField label={copy.consent} />}
                  </form.AppField>
                  {turnstile.widget}
                  <Refusal message={refusal} />
                  <form.Subscribe
                    selector={(state) =>
                      state.values.acceptsRules && state.values.consentsToDataUse
                    }
                  >
                    {(accepted) => (
                      <form.Submit size="lg" disabled={!accepted || !turnstile.token}>
                        {t.send}
                      </form.Submit>
                    )}
                  </form.Subscribe>
                </div>
              )
            }
          </Row>
        </form.Form>
      </form.AppForm>
      <p className="text-sm text-muted-foreground">
        {t.haveAccount}{" "}
        <Link to="/sign-in" className="font-medium text-primary underline underline-offset-4">
          {copy.signIn.title}
        </Link>
      </p>
    </Page>
  );
}

/** One folded row: done (with its answer and Change), open, or still to come. */
function Row({
  title,
  index,
  at,
  onChange,
  children,
}: {
  title: string;
  index: number;
  at: number;
  onChange: () => void;
  children: (open: boolean) => React.ReactNode;
}) {
  const done = index < at;
  const open = index === at;
  return (
    <Card className={cn(open && "ring-primary", index > at && "bg-muted shadow-none")}>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md border border-input text-xs font-semibold",
              done && "border-primary bg-primary text-primary-foreground",
              open && "border-primary text-primary",
            )}
          >
            {done ? <Check className="size-4" /> : index + 1}
          </span>
          <span className="font-semibold">{title}</span>
          {done && (
            <>
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {children(false)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={onChange}
              >
                {copy.signUp.change}
              </Button>
            </>
          )}
        </div>
        {open && children(true)}
      </CardContent>
    </Card>
  );
}
