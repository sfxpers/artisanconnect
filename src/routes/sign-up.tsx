import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldErrors, Page, Refusal } from "@/components/page";
import { useTurnstile } from "@/components/turnstile";
import { email, name, password, tradingNameText } from "@/domain/accounts/inputs";
import { getCurrentRules, signUp } from "@/web/accounts";
import { copy } from "@/web/copy";
import { onlyForVisitors } from "@/web/guards";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context }) => onlyForVisitors(context),
  loader: () => getCurrentRules(),
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

  const form = useForm({
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
        return;
      }
      await navigate({ to: "/confirm-email", search: { email: result.value.email } });
    },
  });

  const at = STEPS.indexOf(step);
  async function continueFrom(fields: ("name" | "tradingName" | "email" | "password")[]) {
    const errors = await Promise.all(fields.map((field) => form.validateField(field, "submit")));
    if (errors.every((list) => list.length === 0)) setStep(STEPS[at + 1]!);
  }

  return (
    <Page title={t.title} narrow>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Row title={t.kind.step} index={0} at={at} onChange={() => setStep("kind")}>
          {(open) =>
            open ? (
              <form.Field name="kind">
                {(field) => (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["client", "artisan"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className={cn(
                            "rounded-lg border p-4 text-left hover:border-primary",
                            field.state.value === kind && "border-primary ring-1 ring-primary",
                          )}
                          onClick={() => {
                            field.handleChange(kind);
                            setStep("names");
                          }}
                        >
                          <div className="font-medium">{t.kind[kind]}</div>
                          <div className="text-sm text-muted-foreground">
                            {kind === "client" ? t.kind.clientHint : t.kind.artisanHint}
                          </div>
                        </button>
                      ))}
                    </div>
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
                <form.Field name="name" validators={{ onSubmit: name }}>
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>{t.names.name}</Label>
                      <Input
                        id={field.name}
                        autoComplete="name"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldErrors errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
                <form.Field name="tradingName" validators={{ onSubmit: tradingNameText }}>
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>{t.names.tradingName}</Label>
                      <Input
                        id={field.name}
                        autoComplete="organization"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldErrors errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
                <form.Subscribe selector={(state) => state.values.kind}>
                  {(kind) => (
                    <p className="text-xs text-muted-foreground">
                      {kind === "artisan" ? t.names.artisanHint : t.names.clientHint}
                    </p>
                  )}
                </form.Subscribe>
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
                <form.Field name="email" validators={{ onSubmit: email }}>
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>{t.email.email}</Label>
                      <Input
                        id={field.name}
                        type="email"
                        autoComplete="email"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldErrors errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
                <form.Field name="password" validators={{ onSubmit: password }}>
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>{t.email.password}</Label>
                      <Input
                        id={field.name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldErrors errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>
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
                  <Link to="/rules" target="_blank" className="underline">
                    {t.rules.read}
                  </Link>
                </p>
                <form.Field name="acceptsRules">
                  {(field) => (
                    <Label className="items-start gap-2 leading-snug font-normal">
                      <Checkbox
                        checked={field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked)}
                      />
                      {t.rules.accept(rules.version)}
                    </Label>
                  )}
                </form.Field>
                <form.Field name="consentsToDataUse">
                  {(field) => (
                    <Label className="items-start gap-2 leading-snug font-normal">
                      <Checkbox
                        checked={field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked)}
                      />
                      {copy.consent}
                    </Label>
                  )}
                </form.Field>
                {turnstile.widget}
                <Refusal message={refusal} />
                <form.Subscribe
                  selector={(state) =>
                    [
                      state.values.acceptsRules && state.values.consentsToDataUse,
                      state.isSubmitting,
                    ] as const
                  }
                >
                  {([accepted, submitting]) => (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!accepted || submitting || !turnstile.token}
                    >
                      {t.send}
                    </Button>
                  )}
                </form.Subscribe>
              </div>
            )
          }
        </Row>
      </form>
      <p className="text-sm text-muted-foreground">
        {t.haveAccount}{" "}
        <Link to="/sign-in" className="underline">
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
    <Card className={cn(open && "ring-2 ring-primary/80", index > at && "opacity-60")}>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
              done && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {done ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span className="font-medium">{title}</span>
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
