import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Refusal } from "@/components/page";
import { firstProblem } from "@/domain/accounts/inputs";
import { formatRands } from "@/domain/money";
import {
  DURATION_MAX_DAYS,
  MATERIALS_BY,
  quoteFields,
  SCOPE_MAX,
  WARRANTY_MAX,
  type MaterialsBy,
  type QuoteFields,
} from "@/domain/quotes/inputs";
import { copy } from "@/web/copy";

const t = copy.quote;

/** A Quote as its form starts: empty, or the Quote being revised. */
export type QuoteStart = {
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
  const [scope, setScope] = useState(start?.scope ?? "");
  const [labour, setLabour] = useState(asRands(start?.labourCents));
  const [materials, setMaterials] = useState(asRands(start?.materialsCents));
  const [materialsBy, setMaterialsBy] = useState<MaterialsBy | "">(start?.materialsBy ?? "");
  const [startOn, setStartOn] = useState(start?.startOn ?? "");
  const [durationDays, setDurationDays] = useState(String(start?.durationDays ?? ""));
  const [warranty, setWarranty] = useState(start?.warranty ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const fields = {
    scope,
    labour,
    materials: materialsBy === "client" ? "0" : materials || "0",
    materialsBy: materialsBy as MaterialsBy,
    startOn,
    durationDays,
    warranty,
  };
  const parsed = quoteFields.safeParse(fields);
  const total = parsed.success ? parsed.data.labour + parsed.data.materials : null;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!parsed.success) return setProblem(firstProblem(parsed.error));
        setProblem(null);
        onSend(fields);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="scope">{t.scope}</Label>
        <Textarea
          id="scope"
          rows={5}
          maxLength={SCOPE_MAX}
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t.scopeHint} {scope.length}/{SCOPE_MAX}
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.materialsBy}</legend>
        <div className="flex flex-wrap gap-4">
          {MATERIALS_BY.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="materialsBy"
                value={option}
                checked={materialsBy === option}
                onChange={() => setMaterialsBy(option)}
              />
              {t.materialsByOptions[option]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="labour">{t.labour}</Label>
          <Input
            id="labour"
            inputMode="decimal"
            value={labour}
            onChange={(event) => setLabour(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t.labourHint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="materials">{t.materials}</Label>
          <Input
            id="materials"
            inputMode="decimal"
            disabled={materialsBy === "client"}
            value={materialsBy === "client" ? "0.00" : materials}
            onChange={(event) => setMaterials(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t.materialsHint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startOn">{t.startOn}</Label>
          <Input
            id="startOn"
            type="date"
            className="w-auto"
            value={startOn}
            onChange={(event) => setStartOn(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationDays">{t.durationDays}</Label>
          <Input
            id="durationDays"
            type="number"
            min={1}
            max={DURATION_MAX_DAYS}
            step={1}
            className="w-28"
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t.durationHint}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="warranty">{t.warranty}</Label>
        <Textarea
          id="warranty"
          rows={2}
          maxLength={WARRANTY_MAX}
          value={warranty}
          onChange={(event) => setWarranty(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.warrantyHint}</p>
      </div>
      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t.total}</span>
          <span className="text-base font-semibold">
            {total === null ? "–" : formatRands(total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.minimum} {vatNumber ? t.includesVat(vatNumber) : t.noVat}
        </p>
      </div>
      <Refusal message={problem ?? refusal} />
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
    </form>
  );
}
