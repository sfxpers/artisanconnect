import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { issuesOf, useAppForm } from "@/components/form";
import { NextStepCard, Page, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
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
import { copy, pageTitle } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMyVerification, submitCheck } from "@/web/verification";
import { Choose } from "@/components/choose";
import { FilePicker } from "@/components/file-picker";

export const Route = createFileRoute("/verification")({
  beforeLoad: ({ context }) => {
    onlyFor("artisan", context);
  },
  loader: () => getMyVerification(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
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
                    <Badge variant="success">
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
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  );
}

const STATE_VARIANTS = {
  missing: "outline",
  waiting: "warning",
  accepted: "success",
  expired: "destructive",
  stopped: "destructive",
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
  if (check.state === "stopped") lines.push(t.stopped);
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

const TEXT_FIELDS = [
  "accountHolder",
  "bank",
  "branchCode",
  "accountNumber",
  "registrationNumber",
] as const;

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
  const definition = CHECKS[kind];
  const [files, setFiles] = useState<Partial<Record<FilePart["part"], File[]>>>({});
  const { refusal, run } = useAction();
  const details = (values: Values) =>
    ({
      kind,
      ...(kind === "work-photos" ? { category } : {}),
      ...Object.fromEntries(
        Object.entries(values).filter(([key]) => fieldsOf(kind, values).includes(key)),
      ),
    }) as CheckDetailsInput;
  const form = useAppForm({
    defaultValues: { documentType: "sa-id" } as Values,
    // Refused here the same way the domain refuses it, before any file goes.
    validators: {
      onSubmit: ({ value }) => {
        const given = details(value);
        return (
          issuesOf(checkDetails.safeParse(given)) ??
          (given.kind === "identity" ? issuesOf(identityNumber.safeParse(given)) : undefined)
        );
      },
    },
    onSubmit: ({ value }) => {
      const sent = new FormData();
      sent.set("details", JSON.stringify(details(value)));
      for (const [part, chosen] of Object.entries(files)) {
        for (const file of chosen ?? []) sent.append(part, file);
      }
      return run(() => submitCheck({ data: sent }), onDone);
    },
  });

  return (
    <form.AppForm>
      <form.Form className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const shown = fieldsOf(kind, values);
            return (
              <>
                {shown.includes("documentType") && (
                  <form.AppField name="documentType">
                    {(field) => (
                      <field.ChoiceField
                        label={t.fields.documentType}
                        options={DOCUMENT_TYPES.map((value) => ({
                          value,
                          label: DOCUMENT_TYPE_NAMES[value],
                        }))}
                      />
                    )}
                  </form.AppField>
                )}
                {shown.includes("number") && (
                  <form.AppField name="number">
                    {(field) => (
                      <field.TextField
                        label={
                          values.documentType === "sa-id" ? t.fields.saIdNumber : t.fields.number
                        }
                        inputMode={values.documentType === "sa-id" ? "numeric" : "text"}
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                )}
                {shown.includes("country") && (
                  <form.Field name="country">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor={`${kind}-country`}>{t.fields.country}</FieldLabel>
                        <Choose
                          id={`${kind}-country`}
                          value={field.state.value ?? ""}
                          onChange={field.handleChange}
                          placeholder={t.fields.chooseCountry}
                          options={sortedCountries().map(({ code, name }) => ({
                            value: code,
                            label: name,
                          }))}
                        />
                      </Field>
                    )}
                  </form.Field>
                )}
                {TEXT_FIELDS.filter((key) => shown.includes(key)).map((key) => (
                  <form.AppField key={key} name={key}>
                    {(field) => (
                      <field.TextField
                        label={t.fields[key]}
                        inputMode={
                          key === "branchCode" || key === "accountNumber" ? "numeric" : "text"
                        }
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                ))}
                {shown.includes("expiresOn") && (
                  <form.AppField name="expiresOn">
                    {(field) => (
                      <field.DateField
                        label={
                          definition.expiresOn === "optional"
                            ? t.fields.expiresOnOptional
                            : t.fields.expiresOn
                        }
                      />
                    )}
                  </form.AppField>
                )}
                {shown.includes("issuedOn") && (
                  <form.AppField name="issuedOn">
                    {(field) => <field.DateField label={t.fields.issuedOn} />}
                  </form.AppField>
                )}
              </>
            );
          }}
        </form.Subscribe>
        {definition.files.map((part) => (
          <FilePicker
            key={part.part}
            id={`${kind}-${part.part}`}
            label={part.label}
            hint={part.photosOnly ? t.photosOnly : t.photosOrPdf}
            multiple={part.max > 1}
            accept={
              part.photosOnly
                ? "image/jpeg,image/png,image/webp"
                : "image/jpeg,image/png,image/webp,application/pdf"
            }
            files={files[part.part] ?? []}
            onFiles={(chosen) => setFiles((current) => ({ ...current, [part.part]: chosen }))}
          />
        ))}
        <Refusal message={refusal} />
        <div className="flex gap-2">
          <form.Submit size="sm">{t.send}</form.Submit>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            {t.cancel}
          </Button>
        </div>
      </form.Form>
    </form.AppForm>
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
