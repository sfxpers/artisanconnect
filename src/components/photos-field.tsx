import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FilePicker } from "@/components/file-picker";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";
import { shrinkPhoto } from "@/web/shrink-photo";

type Photo = { id: string; thumbnailHref: string };

const t = copy.job;

/** The photos a Job or Profile holds, those its owner removes, and those to add. */
export function usePhotos(holding: Photo[]) {
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

export function PhotosField({
  photos,
  label,
  hint,
  max,
}: {
  photos: ReturnType<typeof usePhotos>;
  label: string;
  hint: string;
  max: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="add">{label}</FieldLabel>
      <FieldDescription>
        {hint} {photos.count}/{max}
      </FieldDescription>
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
                    "aspect-4/3 w-full rounded-lg border object-cover",
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
      <FilePicker id="add" accept="image/*" files={photos.added} onFiles={photos.setAdded} />
    </Field>
  );
}
