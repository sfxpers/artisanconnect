import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_CODE } from "@/domain/accounts/inputs";
import { copy } from "@/web/copy";

// Every form is TanStack Form (ADR 0017) on shadcn's Field, with these fields
// bound once: a form's own code names only its values, schema, and submit.

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

/** An Email code's input, as a phone offers the code it was sent. */
export const CODE_INPUT = {
  inputMode: "numeric",
  autoComplete: "one-time-code",
  maxLength: EMAIL_CODE.length,
} as const;

type Labelled = { label: ReactNode; description?: ReactNode };

/** The field's state as shadcn's Field shows it: invalid once a check found a problem. */
function useBound<T>() {
  const field = useFieldContext<T>();
  const id = `${useId()}-${field.name}`;
  const invalid = !field.state.meta.isValid;
  const error = invalid ? <FieldError errors={field.state.meta.errors} /> : null;
  return { field, id, invalid, error };
}

function TextField({ label, description, ...input }: Labelled & ComponentProps<typeof Input>) {
  const { field, id, invalid, error } = useBound<string>();
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid}
        {...input}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error}
    </Field>
  );
}

/** A day as "YYYY-MM-DD", read and written in the browser's own calendar. */
const dayOf = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
const dateOf = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date);
};

/**
 * A day: typed, or picked on shadcn's Calendar in a Popover (its date picker
 * with an input), so typing costs no more clicks than before. "" for none.
 */
function DateField({ label, description }: Labelled) {
  const { field, id, invalid, error } = useBound<string>();
  const [open, setOpen] = useState(false);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(field.state.value) ? dateOf(field.state.value) : undefined;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="w-56">
        <InputGroupInput
          id={id}
          type="date"
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          aria-invalid={invalid}
        />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<InputGroupButton size="icon-xs" aria-label={copy.pickDay} />}>
              <CalendarDays />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={day}
                defaultMonth={day}
                captionLayout="dropdown"
                onSelect={(picked) => {
                  field.handleChange(picked ? dayOf(picked) : "");
                  field.handleBlur();
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      {error}
    </Field>
  );
}

/** A textarea, with how much of its limit is used when it has one. */
function TextareaField({
  label,
  description,
  maxLength,
  ...input
}: Labelled & ComponentProps<typeof Textarea>) {
  const { field, id, invalid, error } = useBound<string>();
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        name={field.name}
        maxLength={maxLength}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid}
        {...input}
      />
      {(description || maxLength) && (
        <FieldDescription>
          {description} {maxLength && `${field.state.value.length}/${maxLength}`}
        </FieldDescription>
      )}
      {error}
    </Field>
  );
}

/** One of a few options: radios, or cards when an option has a hint. */
function ChoiceField<Option extends string>({
  label,
  description,
  options,
}: Labelled & { options: readonly { value: Option; label: ReactNode; hint?: ReactNode }[] }) {
  const { field, id: group, invalid, error } = useBound<Option | "">();
  const cards = options.some((option) => option.hint);
  return (
    <FieldSet data-invalid={invalid}>
      <FieldLegend variant="label">{label}</FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      <RadioGroup
        name={group}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value as Option)}
        className={cards ? "sm:grid-cols-2" : "flex flex-wrap gap-4"}
      >
        {options.map((option) => {
          const id = `${group}-${option.value}`;
          return (
            <FieldLabel key={option.value} htmlFor={id}>
              <Field orientation="horizontal">
                <RadioGroupItem
                  id={id}
                  value={option.value}
                  aria-labelledby={`${id}-label`}
                  aria-invalid={invalid}
                />
                {cards ? (
                  <FieldContent>
                    <FieldTitle id={`${id}-label`}>{option.label}</FieldTitle>
                    <FieldDescription>{option.hint}</FieldDescription>
                  </FieldContent>
                ) : (
                  <span id={`${id}-label`} className="font-normal">
                    {option.label}
                  </span>
                )}
              </Field>
            </FieldLabel>
          );
        })}
      </RadioGroup>
      {error}
    </FieldSet>
  );
}

function CheckboxField({ label }: { label: ReactNode }) {
  const { field, id, invalid, error } = useBound<boolean>();
  return (
    <Field orientation="horizontal" data-invalid={invalid}>
      <Checkbox
        id={id}
        checked={field.state.value}
        onCheckedChange={(checked) => field.handleChange(checked === true)}
        aria-invalid={invalid}
      />
      <FieldLabel htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
      {error}
    </Field>
  );
}

/**
 * A domain schema's verdict on the values as they would be sent, each issue
 * shown on its field: the form checks by the same rules the module does.
 */
export function issuesOf(result: { success: boolean; error?: { issues: Issue[] } }) {
  if (result.success || !result.error) return undefined;
  // The first issue of a field is the one shown.
  const issues = [...result.error.issues].reverse();
  return {
    fields: Object.fromEntries(
      issues.map((issue) => [issue.path.join("."), { message: issue.message }]),
    ),
  };
}

type Issue = { path: PropertyKey[]; message: string };

/** The form element, submitting through TanStack Form. */
function Form(props: Omit<ComponentProps<"form">, "onSubmit">) {
  const form = useFormContext();
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    />
  );
}

/** The submit button, idle while the form submits. */
function Submit({ disabled, ...props }: ComponentProps<typeof Button>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(submitting) => <Button type="submit" disabled={submitting || disabled} {...props} />}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, DateField, TextareaField, ChoiceField, CheckboxField },
  formComponents: { Form, Submit },
});
