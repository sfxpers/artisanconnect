import { useEffect, useState, type ReactNode } from "react";
import { useAppForm } from "@/components/form";
import { PhotosField, usePhotos } from "@/components/photos-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Refusal } from "@/components/page";
import {
  DESCRIPTION_MAX,
  JOB_PHOTOS_MAX,
  MATCHINGS,
  SITE_TYPES,
  STREET_MAX,
  TITLE_MAX,
  type Matching,
  type SiteType,
} from "@/domain/jobs/inputs";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_NAMES } from "@/domain/service-categories";
import { copy } from "@/web/copy";
import type { getJob } from "@/web/jobs";
import { searchSuburbs } from "@/web/regions";
import { Choose } from "@/components/choose";

const t = copy.job;

/** A Job as its Client sees it. */
export type JobView = Extract<Awaited<ReturnType<typeof getJob>>, { as: "client" }>;
export type Suburb = { id: string; name: string; region: { id: string; name: string } };

/** A Draft's form as last saved, or empty for a new Job. */
function draftValuesOf(job: JobView | null) {
  return {
    category: job?.category?.id ?? "",
    gasWork: (job?.gasWork === true ? "yes" : job?.gasWork === false ? "no" : "") as
      | ""
      | "yes"
      | "no",
    siteType: (job?.siteType ?? "") as SiteType | "",
    suburb:
      job?.suburb && job.region
        ? ({ id: job.suburb.id, name: job.suburb.name, region: job.region } as Suburb)
        : null,
    street: job?.street ?? "",
    title: job?.title ?? "",
    description: job?.description ?? "",
    preferredStart: job?.preferredStart ?? "",
    matching: (job?.matching ?? "") as Matching | "",
  };
}

/**
 * Every field of a Draft. Saving or posting is the caller's: it is given the
 * form to send, with the photos kept and the new ones made smaller.
 */
export function DraftForm({
  job,
  busy,
  refusal,
  notice,
  onSave,
  onPost,
  extra,
}: {
  job: JobView | null;
  busy: boolean;
  refusal: string | null;
  notice: string | null;
  onSave: (form: FormData) => void;
  onPost: (form: FormData) => void;
  extra?: ReactNode;
}) {
  const photos = usePhotos(job?.photos ?? []);
  const form = useAppForm({
    defaultValues: draftValuesOf(job),
    onSubmit: async ({ value }) => onPost(await formData(value)),
  });

  async function formData({ suburb, gasWork, ...draft }: ReturnType<typeof draftValuesOf>) {
    const sent = asFormData({ ...draft, suburbId: suburb?.id ?? "", jobId: job?.jobId });
    if (draft.category === "plumbing") sent.set("gasWork", gasWork);
    await photos.appendTo(sent);
    return sent;
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {job?.hireAgain && (
        <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{t.hireAgain}</p>
          <p className="text-muted-foreground">
            {t.hireAgainDraftLead(job.hireAgain.publicName ?? copy.quotes.noName)}
          </p>
        </div>
      )}
      <form.Field name="category">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="category">{t.category}</FieldLabel>
            <Choose
              id="category"
              value={field.state.value}
              onChange={field.handleChange}
              placeholder={t.chooseCategory}
              options={SERVICE_CATEGORIES.map((category) => ({
                value: category,
                label: SERVICE_CATEGORY_NAMES[category],
              }))}
            />
          </Field>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.category === "plumbing"}>
        {(plumbing) =>
          plumbing && (
            <form.AppField name="gasWork">
              {(field) => (
                <field.ChoiceField
                  label={t.gasWork}
                  options={[
                    { value: "yes", label: t.yes },
                    { value: "no", label: t.no },
                  ]}
                />
              )}
            </form.AppField>
          )
        }
      </form.Subscribe>
      <form.AppField name="siteType">
        {(field) => <field.ChoiceField {...siteTypes} />}
      </form.AppField>
      <form.Field name="suburb">
        {(field) => <SuburbPicker value={field.state.value} onChange={field.handleChange} />}
      </form.Field>
      <form.AppField name="street">
        {(field) => (
          <field.TextField
            label={t.street}
            description={t.streetHint}
            autoComplete="street-address"
            maxLength={STREET_MAX}
          />
        )}
      </form.AppField>
      <form.AppField name="title">{(field) => <field.TextField {...title} />}</form.AppField>
      <form.AppField name="description">
        {(field) => <field.TextareaField {...description} />}
      </form.AppField>
      <PhotosField
        photos={photos}
        label={t.photos}
        hint={t.photosHint(JOB_PHOTOS_MAX)}
        max={JOB_PHOTOS_MAX}
      />
      <form.AppField name="preferredStart">
        {(field) => <field.DateField {...preferredStart} />}
      </form.AppField>
      {/* A Job opened by Hire Again is Invite-only, inviting only that Artisan (#139). */}
      {!job?.hireAgain && (
        <form.AppField name="matching">
          {(field) => (
            <field.ChoiceField
              label={t.matching}
              options={MATCHINGS.map((matching) => ({
                value: matching,
                label: t.matchings[matching],
                hint: t.matchingHints[matching],
              }))}
            />
          )}
        </form.AppField>
      )}

      <Refusal message={refusal} />
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {t.postJob}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void formData(form.state.values).then(onSave)}
        >
          {t.saveDraft}
        </Button>
        {extra}
      </div>
    </form>
  );
}

/** What may change on a posted Job until its first Quote. */
export function EditForm({
  job,
  busy,
  refusal,
  onSend,
  onCancel,
}: {
  job: JobView;
  busy: boolean;
  refusal: string | null;
  onSend: (form: FormData) => void;
  onCancel: () => void;
}) {
  const photos = usePhotos(job.photos);
  const form = useAppForm({
    defaultValues: {
      title: job.title,
      description: job.description,
      siteType: (job.siteType ?? "") as SiteType | "",
      preferredStart: job.preferredStart ?? "",
    },
    onSubmit: async ({ value }) => {
      const sent = asFormData({ ...value, jobId: job.jobId });
      await photos.appendTo(sent);
      onSend(sent);
    },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="title">{(field) => <field.TextField {...title} />}</form.AppField>
      <form.AppField name="description">
        {(field) => <field.TextareaField {...description} />}
      </form.AppField>
      <PhotosField
        photos={photos}
        label={t.photos}
        hint={t.photosHint(JOB_PHOTOS_MAX)}
        max={JOB_PHOTOS_MAX}
      />
      <form.AppField name="siteType">
        {(field) => <field.ChoiceField {...siteTypes} />}
      </form.AppField>
      <form.AppField name="preferredStart">
        {(field) => <field.DateField {...preferredStart} />}
      </form.AppField>
      <Refusal message={refusal} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t.sendEdit}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

// The fields the Draft and an edit share, as each one's field is given them.
const title = { label: t.title, maxLength: TITLE_MAX };
const description = {
  label: t.description,
  description: t.descriptionHint,
  rows: 6,
  maxLength: DESCRIPTION_MAX,
};
const siteTypes = {
  label: t.siteType,
  options: SITE_TYPES.map((siteType) => ({ value: siteType, label: t.siteTypes[siteType] })),
};
const preferredStart = { label: t.preferredStart };

/** The form's values as the server function takes them, leaving out none given. */
function asFormData(values: Record<string, string | undefined>) {
  const sent = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) sent.set(key, value);
  return sent;
}

/**
 * The suburb, searched as the City publishes it, each with its Region beside
 * it: two pairs of official names read alike (GOEDE HOOP and GOEDEHOOP).
 */
export function SuburbPicker({
  value,
  onChange,
  label = t.suburb,
  hint = t.suburbHint,
}: {
  value: Suburb | null;
  onChange: (suburb: Suburb | null) => void;
  label?: string;
  hint?: string | null;
}) {
  const [query, setQuery] = useState("");
  // What was found, and for which query, so an older answer never shows under a newer query.
  const [found, setFound] = useState<{ query: string; suburbs: Suburb[] } | null>(null);
  const searching = query.trim() !== "" && query !== (value && labelOf(value));

  useEffect(() => {
    if (!searching) return;
    let current = true;
    const wait = setTimeout(() => {
      void searchSuburbs({ data: { query } }).then((result) => {
        if (current) setFound({ query, suburbs: result });
      });
    }, 200);
    return () => {
      current = false;
      clearTimeout(wait);
    };
  }, [query, searching]);

  return (
    <Field>
      <FieldLabel htmlFor="suburb">{label}</FieldLabel>
      <Combobox
        items={found?.suburbs ?? []}
        filter={null}
        value={value}
        onValueChange={onChange}
        onInputValueChange={setQuery}
        itemToStringLabel={labelOf}
        isItemEqualToValue={(item, chosen) => item.id === chosen.id}
      >
        <ComboboxInput id="suburb" autoComplete="off" showTrigger={false} showClear />
        <ComboboxContent>
          {searching && found?.query === query && <ComboboxEmpty>{t.noSuburb}</ComboboxEmpty>}
          <ComboboxList>
            {(suburb: Suburb) => (
              <ComboboxItem key={suburb.id} value={suburb} className="justify-between">
                <span>{suburb.name}</span>
                <span className="text-muted-foreground">{suburb.region.name}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

const labelOf = (suburb: Suburb) => `${suburb.name} · ${suburb.region.name}`;
