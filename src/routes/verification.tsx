import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { firstProblem } from "@/domain/accounts/inputs";
import { formatDay } from "@/domain/sa-days";
import { SERVICE_CATEGORY_NAMES, type ServiceCategory } from "@/domain/service-categories";
import {
  CHECKS,
  DOCUMENT_TYPE_NAMES,
  DOCUMENT_TYPES,
  checkDetails,
  countryName,
  identityNumber,
  passportCountries,
  type CheckDetailsInput,
  type CheckKind,
  type DocumentType,
  type FilePart,
} from "@/domain/verification/checks";
import type { VerificationSlot } from "@/domain/verification";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMyVerification, submitCheck } from "@/web/verification";

export const Route = createFileRoute("/verification")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  loader: () => getMyVerification(),
  component: Verification,
});

const t = copy.verification;

/** Where an Artisan lands: every check in three groups, each with its state and how to send it. */
function Verification() {
  const mine = Route.useLoaderData();
  if (!mine) return null;
  const verified = mine.verified
    .map(({ category, gasWork }) =>
      gasWork
        ? `${SERVICE_CATEGORY_NAMES[category]} (${t.gasWork})`
        : SERVICE_CATEGORY_NAMES[category],
    )
    .join(", ");
  return (
    <Page title={t.title}>
      <NextStepCard
        label={t.nextStep}
        title={verified ? t.verifiedFor(verified) : copy.home.verification}
      >
        <p className="text-sm text-muted-foreground">{t.lead}</p>
        {!verified && <p className="text-sm">{t.notYet}</p>}
      </NextStepCard>

      <Group {...t.groups.once}>
        <Card>
          <CardContent className="divide-y">
            {mine.once.map((check) => (
              <CheckRow key={check.slot} check={check} />
            ))}
          </CardContent>
        </Card>
      </Group>

      <Group {...t.groups.category}>
        <div className="grid gap-4 md:grid-cols-2">
          {mine.categories.map((group) => (
            <Card key={group.category} size="sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{group.name}</CardTitle>
                  {group.verified ? (
                    <Badge>
                      {t.verified}
                      {group.gasWork && `, ${t.gasWork}`}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t.notVerified}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="divide-y">
                {group.checks.map((check) => (
                  <CheckRow key={check.slot} check={check} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </Group>

      <Group {...t.groups.optional}>
        <Card>
          <CardContent className="divide-y">
            {mine.optional.map((check) => (
              <CheckRow key={check.slot} check={check} />
            ))}
          </CardContent>
        </Card>
      </Group>
    </Page>
  );
}

function Group({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}

const STATE_VARIANTS = {
  missing: "outline",
  waiting: "secondary",
  accepted: "default",
  expired: "destructive",
  rejected: "destructive",
  removed: "destructive",
} as const;

/** One check: its state, its dates or why it was refused, and how to send it. */
function CheckRow({ check }: { check: VerificationSlot }) {
  const [open, setOpen] = useState(false);
  const notNeeded = check.needed === "not-needed";
  const canSend = !notNeeded && check.state !== "waiting" && check.replacement?.state !== "waiting";
  const action =
    check.state === "accepted" ? t.replace : check.state === "missing" ? t.submit : t.submitAgain;
  return (
    <div className="space-y-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{check.name}</span>
            {notNeeded && check.state === "missing" ? (
              <Badge variant="outline">{t.notNeeded}</Badge>
            ) : (
              <Badge variant={STATE_VARIANTS[check.state]}>{t.states[check.state]}</Badge>
            )}
            {check.needed === "optional" && check.state === "missing" && (
              <span className="text-xs text-muted-foreground">{t.optionalCheck}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{CHECKS[check.kind].hint}</p>
          <CheckDetailsLine check={check} />
        </div>
        {canSend && !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {action}
          </Button>
        )}
      </div>
      {open && (
        <CheckForm kind={check.kind} category={check.category} onDone={() => setOpen(false)} />
      )}
    </div>
  );
}

function CheckDetailsLine({ check }: { check: VerificationSlot }) {
  const lines: string[] = [];
  if (check.state === "accepted") {
    if (check.expiresOn) lines.push(t.expires(formatDay(check.expiresOn)));
    if (check.issuedOn) lines.push(t.issued(formatDay(check.issuedOn)));
  }
  if (check.state === "expired" && check.expiresOn)
    lines.push(t.expired(formatDay(check.expiresOn)));
  if (check.reason) lines.push(t.reason(check.reason));
  if (check.replacement?.state === "waiting") lines.push(t.replacementWaiting);
  if (check.replacement?.state === "rejected") {
    lines.push(t.replacementRejected(check.replacement.reason ?? ""));
  }
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5 text-sm">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

type Values = Record<string, string>;

/** Sends one check: what its kind asks for, and its files. */
function CheckForm({
  kind,
  category,
  onDone,
}: {
  kind: CheckKind;
  category: ServiceCategory | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const definition = CHECKS[kind];
  const [values, setValues] = useState<Values>({ documentType: "sa-id" });
  const [files, setFiles] = useState<Partial<Record<FilePart["part"], File[]>>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  function details(): CheckDetailsInput {
    const fields = Object.fromEntries(
      Object.entries(values).filter(([key]) => fieldsOf(kind, values).includes(key)),
    );
    return {
      kind,
      ...(kind === "work-photos" ? { category } : {}),
      ...fields,
    } as CheckDetailsInput;
  }

  async function send() {
    setRefusal(null);
    // Refused here the same way the domain refuses it, before any file goes.
    const given = details();
    const parsed = checkDetails.safeParse(given);
    if (!parsed.success) return setRefusal(firstProblem(parsed.error));
    if (given.kind === "identity") {
      const number = identityNumber.safeParse(given);
      if (!number.success) return setRefusal(firstProblem(number.error));
    }
    const form = new FormData();
    form.set("details", JSON.stringify(given));
    for (const [part, chosen] of Object.entries(files)) {
      for (const file of chosen ?? []) form.append(part, file);
    }
    setBusy(true);
    const result = await submitCheck({ data: form });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    onDone();
    await router.invalidate();
  }

  const shown = fieldsOf(kind, values);
  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {shown.includes("documentType") && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t.fields.documentType}</legend>
          <div className="flex flex-wrap gap-2">
            {DOCUMENT_TYPES.map((type) => (
              <Choice
                key={type}
                name="documentType"
                checked={values.documentType === type}
                onChange={() => setValues((current) => ({ ...current, documentType: type }))}
              >
                {DOCUMENT_TYPE_NAMES[type]}
              </Choice>
            ))}
          </div>
        </fieldset>
      )}
      {shown.includes("number") && (
        <Field
          id={`${kind}-number`}
          label={values.documentType === "sa-id" ? t.fields.saIdNumber : t.fields.number}
        >
          <Input
            id={`${kind}-number`}
            inputMode={values.documentType === "sa-id" ? "numeric" : "text"}
            autoComplete="off"
            value={values.number ?? ""}
            onChange={set("number")}
          />
        </Field>
      )}
      {shown.includes("country") && (
        <Field id={`${kind}-country`} label={t.fields.country}>
          <select
            id={`${kind}-country`}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={values.country ?? ""}
            onChange={set("country")}
          >
            <option value="">{t.fields.chooseCountry}</option>
            {sortedCountries().map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {(["accountHolder", "bank", "branchCode", "accountNumber", "registrationNumber"] as const)
        .filter((key) => shown.includes(key))
        .map((key) => (
          <Field key={key} id={`${kind}-${key}`} label={t.fields[key]}>
            <Input
              id={`${kind}-${key}`}
              inputMode={key === "branchCode" || key === "accountNumber" ? "numeric" : "text"}
              autoComplete="off"
              value={values[key] ?? ""}
              onChange={set(key)}
            />
          </Field>
        ))}
      {shown.includes("expiresOn") && (
        <Field
          id={`${kind}-expiresOn`}
          label={
            definition.expiresOn === "optional" ? t.fields.expiresOnOptional : t.fields.expiresOn
          }
        >
          <Input
            id={`${kind}-expiresOn`}
            type="date"
            value={values.expiresOn ?? ""}
            onChange={set("expiresOn")}
          />
        </Field>
      )}
      {shown.includes("issuedOn") && (
        <Field id={`${kind}-issuedOn`} label={t.fields.issuedOn}>
          <Input
            id={`${kind}-issuedOn`}
            type="date"
            value={values.issuedOn ?? ""}
            onChange={set("issuedOn")}
          />
        </Field>
      )}
      {definition.files.map((part) => (
        <Field
          key={part.part}
          id={`${kind}-${part.part}`}
          label={part.label}
          hint={part.photosOnly ? t.photosOnly : t.photosOrPdf}
        >
          <Input
            id={`${kind}-${part.part}`}
            type="file"
            multiple={part.max > 1}
            accept={
              part.photosOnly
                ? "image/jpeg,image/png,image/webp"
                : "image/jpeg,image/png,image/webp,application/pdf"
            }
            onChange={(event) =>
              setFiles((current) => ({
                ...current,
                [part.part]: Array.from(event.target.files ?? []),
              }))
            }
          />
        </Field>
      ))}
      <Refusal message={refusal} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t.send}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDone}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

/** The fields a kind of check asks for, given what is chosen so far. */
function fieldsOf(kind: CheckKind, values: Values): string[] {
  const definition = CHECKS[kind];
  const fields: string[] = [];
  if (kind === "identity") {
    fields.push("documentType", "number");
    if ((values.documentType as DocumentType) === "passport") fields.push("country");
  }
  if (kind === "payout-account")
    fields.push("accountHolder", "bank", "branchCode", "accountNumber");
  if (definition.registrationNumber) fields.push("registrationNumber");
  if (definition.expiresOn !== "none") fields.push("expiresOn");
  if (definition.issuedOn) fields.push("issuedOn");
  return fields;
}

let countries: { code: string; name: string }[] | undefined;

function sortedCountries() {
  return (countries ??= passportCountries()
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en")));
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1 text-sm hover:border-primary has-focus-visible:ring-2 has-focus-visible:ring-ring",
        checked && "border-primary bg-primary text-primary-foreground",
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}
