import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";
import type { getJob } from "@/web/jobs";
import { searchSuburbs } from "@/web/regions";
import { shrinkPhoto } from "@/web/shrink-photo";

const t = copy.job;

/** A Job as its Client sees it. */
export type JobView = Extract<Awaited<ReturnType<typeof getJob>>, { as: "client" }>;
type Photo = JobView["photos"][number];
type Suburb = { id: string; name: string; region: { id: string; name: string } };

const SELECT = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

/** What a Draft holds as the Client fills it in. */
export type DraftState = {
  category: string;
  gasWork: "" | "yes" | "no";
  siteType: SiteType | "";
  suburb: Suburb | null;
  street: string;
  title: string;
  description: string;
  preferredStart: string;
  matching: Matching | "";
};

/** A Draft's form as last saved, or empty for a new Job. */
export function draftStateOf(job: JobView | null): DraftState {
  return {
    category: job?.category?.id ?? "",
    gasWork: job?.gasWork === true ? "yes" : job?.gasWork === false ? "no" : "",
    siteType: job?.siteType ?? "",
    suburb:
      job?.suburb && job.region
        ? { id: job.suburb.id, name: job.suburb.name, region: job.region }
        : null,
    street: job?.street ?? "",
    title: job?.title ?? "",
    description: job?.description ?? "",
    preferredStart: job?.preferredStart ?? "",
    matching: job?.matching ?? "",
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
  const [draft, setDraft] = useState<DraftState>(() => draftStateOf(job));
  const photos = usePhotos(job?.photos ?? []);
  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((now) => ({ ...now, [key]: value }));

  async function formData() {
    const form = new FormData();
    if (job) form.set("jobId", job.jobId);
    form.set("category", draft.category);
    if (draft.category === "plumbing") form.set("gasWork", draft.gasWork);
    form.set("siteType", draft.siteType);
    form.set("suburbId", draft.suburb?.id ?? "");
    form.set("street", draft.street);
    form.set("title", draft.title);
    form.set("description", draft.description);
    form.set("preferredStart", draft.preferredStart);
    form.set("matching", draft.matching);
    await photos.appendTo(form);
    return form;
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void formData().then(onPost);
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
      <div className="space-y-1.5">
        <Label htmlFor="category">{t.category}</Label>
        <select
          id="category"
          className={SELECT}
          value={draft.category}
          onChange={(event) => set("category", event.target.value)}
        >
          <option value="">{t.chooseCategory}</option>
          {SERVICE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {SERVICE_CATEGORY_NAMES[category]}
            </option>
          ))}
        </select>
      </div>

      {draft.category === "plumbing" && (
        <Choice
          legend={t.gasWork}
          name="gasWork"
          value={draft.gasWork}
          options={[
            { value: "yes", label: t.yes },
            { value: "no", label: t.no },
          ]}
          onChange={(value) => set("gasWork", value as DraftState["gasWork"])}
        />
      )}

      <SiteTypeChoice value={draft.siteType} onChange={(value) => set("siteType", value)} />

      <SuburbPicker value={draft.suburb} onChange={(suburb) => set("suburb", suburb)} />

      <div className="space-y-1.5">
        <Label htmlFor="street">{t.street}</Label>
        <Input
          id="street"
          autoComplete="street-address"
          maxLength={STREET_MAX}
          value={draft.street}
          onChange={(event) => set("street", event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.streetHint}</p>
      </div>

      <DetailsFields
        title={draft.title}
        description={draft.description}
        onTitle={(value) => set("title", value)}
        onDescription={(value) => set("description", value)}
      />

      <PhotosField photos={photos} />

      <PreferredStartField
        value={draft.preferredStart}
        onChange={(value) => set("preferredStart", value)}
      />

      {/* A Job opened by Hire Again is Invite-only, inviting only that Artisan (#139). */}
      {!job?.hireAgain && (
        <Choice
          legend={t.matching}
          name="matching"
          value={draft.matching}
          options={MATCHINGS.map((matching) => ({
            value: matching,
            label: t.matchings[matching],
            hint: t.matchingHints[matching],
          }))}
          onChange={(value) => set("matching", value as Matching)}
        />
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
          onClick={() => void formData().then(onSave)}
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
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description);
  const [siteType, setSiteType] = useState<SiteType | "">(job.siteType ?? "");
  const [preferredStart, setPreferredStart] = useState(job.preferredStart ?? "");
  const photos = usePhotos(job.photos);

  async function formData() {
    const form = new FormData();
    form.set("jobId", job.jobId);
    form.set("title", title);
    form.set("description", description);
    form.set("siteType", siteType);
    form.set("preferredStart", preferredStart);
    await photos.appendTo(form);
    return form;
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void formData().then(onSend);
      }}
    >
      <DetailsFields
        title={title}
        description={description}
        onTitle={setTitle}
        onDescription={setDescription}
      />
      <PhotosField photos={photos} />
      <SiteTypeChoice value={siteType} onChange={setSiteType} />
      <PreferredStartField value={preferredStart} onChange={setPreferredStart} />
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

function DetailsFields({
  title,
  description,
  onTitle,
  onDescription,
}: {
  title: string;
  description: string;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="title">{t.title}</Label>
        <Input
          id="title"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => onTitle(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">{t.description}</Label>
        <Textarea
          id="description"
          rows={6}
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(event) => onDescription(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t.descriptionHint} {description.length}/{DESCRIPTION_MAX}
        </p>
      </div>
    </>
  );
}

function SiteTypeChoice({
  value,
  onChange,
}: {
  value: SiteType | "";
  onChange: (value: SiteType) => void;
}) {
  return (
    <Choice
      legend={t.siteType}
      name="siteType"
      value={value}
      options={SITE_TYPES.map((siteType) => ({ value: siteType, label: t.siteTypes[siteType] }))}
      onChange={(next) => onChange(next as SiteType)}
    />
  );
}

function PreferredStartField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="preferredStart">{t.preferredStart}</Label>
      <Input
        id="preferredStart"
        type="date"
        className="w-auto"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** One of a few choices, as radio buttons. */
function Choice({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-w-32 flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm",
              value === option.value && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </span>
            {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The suburb, searched as the City publishes it, each with its Region beside
 * it: two pairs of official names read alike (GOEDE HOOP and GOEDEHOOP).
 */
function SuburbPicker({
  value,
  onChange,
}: {
  value: Suburb | null;
  onChange: (suburb: Suburb | null) => void;
}) {
  const [query, setQuery] = useState("");
  // What was found, and for which query, so an older answer never shows under a newer query.
  const [found, setFound] = useState<{ query: string; suburbs: Suburb[] } | null>(null);
  const searching = !value && query.trim() !== "";

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

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="text-sm font-medium">{t.suburb}</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            {value.name} <span className="text-muted-foreground">· {value.region.name}</span>
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={() => onChange(null)}>
            {t.suburbChange}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor="suburb">{t.suburb}</Label>
      <Input
        id="suburb"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t.suburbHint}</p>
      {searching &&
        found?.query === query &&
        (found.suburbs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noSuburb}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm" aria-live="polite">
            {found.suburbs.map((suburb) => (
              <li key={suburb.id}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    onChange(suburb);
                    setQuery("");
                  }}
                >
                  <span>{suburb.name}</span>
                  <span className="text-muted-foreground">{suburb.region.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** The photos a Job holds, those the Client removes, and those to add. */
function usePhotos(holding: Photo[]) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<File[]>([]);
  const kept = holding.filter((photo) => !removed.has(photo.id));
  return {
    holding,
    removed,
    added,
    count: kept.length + added.length,
    toggle(id: string) {
      setRemoved((now) => {
        const next = new Set(now);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    setAdded,
    /** The ids kept, in order, and each new photo made smaller. */
    async appendTo(form: FormData) {
      for (const photo of kept) form.append("keep", photo.id);
      for (const file of await Promise.all(added.map(shrinkPhoto))) form.append("add", file);
    },
  };
}

function PhotosField({ photos }: { photos: ReturnType<typeof usePhotos> }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="add">{t.photos}</Label>
      <p className="text-xs text-muted-foreground">
        {t.photosHint(JOB_PHOTOS_MAX)} {photos.count}/{JOB_PHOTOS_MAX}
      </p>
      {photos.holding.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.holding.map((photo, index) => {
            const gone = photos.removed.has(photo.id);
            return (
              <li key={photo.id} className="space-y-1">
                <img
                  src={photo.thumbnailHref}
                  alt={t.photo(index + 1)}
                  className={cn(
                    "aspect-[4/3] w-full rounded-lg border object-cover",
                    gone && "opacity-30",
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => photos.toggle(photo.id)}
                >
                  {gone ? t.restore : t.remove}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Input
        id="add"
        type="file"
        multiple
        accept="image/*"
        onChange={(event) => photos.setAdded(Array.from(event.target.files ?? []))}
      />
      {photos.added.length > 0 && (
        <p className="text-xs text-muted-foreground">{t.added(photos.added.length)}</p>
      )}
    </div>
  );
}
