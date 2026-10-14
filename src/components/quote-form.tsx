import { Button } from "@/components/ui/button";
import { issuesOf, useAppForm } from "@/components/form";
import { MoneyLines, Refusal } from "@/components/page";
import {
  DURATION_MAX_DAYS,
  MATERIALS_BY,
  quoteFields,
  rands,
  SCOPE_MAX,
  WARRANTY_MAX,
  type MaterialsBy,
  type QuoteFields,
} from "@/domain/quotes/inputs";
import { copy } from "@/web/copy";

const t = copy.quote;

/** A Quote as its form starts: empty, or the Quote being revised. */
type QuoteStart = {
  scope: string;
  labourCents: number;
  materialsCents: number;
  materialsBy: MaterialsBy;
  startOn: string;
  durationDays: number;
  warranty: string | null;
};

/** Cents as the form shows them, "1500.00"; empty for none. */
function asRands(cents: number | undefined) {
  return cents === undefined ? "" : (cents / 100).toFixed(2);
}

/**
 * A Quote's fields (#124): the scope, Labour, Materials, who supplies them,
 * the start date, the duration, and an optional Warranty, with the total.
 * It is checked by the same rules the domain module applies before it is sent.
 */
export function QuoteForm({
  start,
  vatNumber,
  busy,
  refusal,
  submit,
  onSend,
  onCancel,
}: {
  start?: QuoteStart;
  vatNumber: string | null;
  busy: boolean;
  refusal: string | null;
  submit: string;
  onSend: (fields: QuoteFields) => void;
  onCancel?: () => void;
}) {
  const form = useAppForm({
    defaultValues: {
      scope: start?.scope ?? "",
      labour: asRands(start?.labourCents),
      materials: asRands(start?.materialsCents),
      materialsBy: (start?.materialsBy ?? "") as MaterialsBy | "",
      startOn: start?.startOn ?? "",
      durationDays: String(start?.durationDays ?? ""),
      warranty: start?.warranty ?? "",
    },
    validators: { onSubmit: ({ value }) => issuesOf(quoteFields.safeParse(sent(value))) },
    onSubmit: ({ value }) => onSend(sent(value)),
  });

  return (
    <form.AppForm>
      <form.Form className="space-y-5">
        <form.AppField name="scope">
          {(field) => (
            <field.TextareaField
              label={t.scope}
              description={t.scopeHint}
              rows={5}
              maxLength={SCOPE_MAX}
            />
          )}
        </form.AppField>
        <form.AppField name="materialsBy">
          {(field) => (
            <field.ChoiceField
              label={t.materialsBy}
              options={MATERIALS_BY.map((value) => ({ value, label: t.materialsByOptions[value] }))}
            />
          )}
        </form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="labour">
            {(field) => (
              <field.TextField label={t.labour} description={t.labourHint} inputMode="decimal" />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.materialsBy === "client"}>
            {(clientSupplies) => (
              <form.AppField name="materials">
                {(field) => (
                  <field.TextField
                    label={t.materials}
                    description={t.materialsHint}
                    inputMode="decimal"
                    disabled={clientSupplies}
                    {...(clientSupplies && { value: "0.00" })}
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="startOn">
            {(field) => <field.DateField label={t.startOn} />}
          </form.AppField>
          <form.AppField name="durationDays">
            {(field) => (
              <field.TextField
                label={t.durationDays}
                description={t.durationHint}
                type="number"
                min={1}
                max={DURATION_MAX_DAYS}
                step={1}
                className="w-28"
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="warranty">
          {(field) => (
            <field.TextareaField
              label={t.warranty}
              description={t.warrantyHint}
              rows={2}
              maxLength={WARRANTY_MAX}
            />
          )}
        </form.AppField>
        {/* The money as lines, from Labour and Materials alone, so it adds up while it is typed. */}
        <form.Subscribe selector={(state) => sent(state.values)}>
          {(values) => {
            const labour = cents(rands(t.labour).safeParse(values.labour));
            const materials = cents(rands(t.materials).safeParse(values.materials));
            return (
              <div className="space-y-2 rounded-lg border bg-muted p-3">
                <MoneyLines
                  lines={[
                    { label: t.labourShort, cents: labour },
                    { label: t.materialsShort, cents: materials },
                    { label: t.total, cents: labour + materials, total: true },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {t.minimum} {vatNumber ? t.includesVat(vatNumber) : t.noVat}
                </p>
              </div>
            );
          }}
        </form.Subscribe>
        <Refusal message={refusal} />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {submit}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
              {t.cancel}
            </Button>
          )}
        </div>
      </form.Form>
    </form.AppForm>
  );
}

/** Cents from a parse of rands, or none while what is typed is not yet an amount. */
function cents(parsed: { success: boolean; data?: number }) {
  return parsed.success ? (parsed.data ?? 0) : 0;
}

/** The Quote as it is sent: no Materials when the Client supplies them, and none typed is zero. */
function sent(values: Omit<QuoteFields, "materialsBy"> & { materialsBy: MaterialsBy | "" }) {
  const materials = values.materialsBy === "client" ? "0" : values.materials || "0";
  return { ...values, materials, materialsBy: values.materialsBy as MaterialsBy };
}
