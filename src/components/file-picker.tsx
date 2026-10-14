import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";

const t = copy.files;

/**
 * Files to send, chosen with a button rather than the browser's own box, each
 * shown (a photo as a thumbnail) with a way to take it out. More may be
 * chosen after the first, up to what the field takes.
 */
export function FilePicker({
  id,
  label,
  hint,
  accept,
  multiple = true,
  files,
  onFiles,
}: {
  id: string;
  /** None when the picker sits in a field that labels it already. */
  label?: string;
  hint?: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const photosOnly = !accept.includes("pdf") && !accept.includes("audio");
  return (
    <Field>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {files.map((file, index) => (
            <li key={`${file.name}:${file.size}:${index}`} className="space-y-1">
              <Preview file={file} />
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.remove(file.name)}
                  onClick={() => onFiles(files.filter((_, at) => at !== index))}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* The browser's input, hidden; its label is the button, and shows its focus. */}
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="peer sr-only"
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          onFiles(multiple ? [...files, ...picked] : picked);
          // Emptied, so the same file can be chosen again after it is taken out.
          event.target.value = "";
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-fit cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
        )}
      >
        {photosOnly ? (
          <ImagePlus data-icon="inline-start" />
        ) : (
          <Paperclip data-icon="inline-start" />
        )}
        {files.length > 0 && multiple ? t.more : photosOnly ? t.photos : t.files}
      </label>
    </Field>
  );
}

/** A chosen photo as a thumbnail, or another file as an icon. */
function Preview({ file }: { file: File }) {
  if (!file.type.startsWith("image/")) {
    return (
      <div className="grid aspect-4/3 w-full place-items-center rounded-lg border bg-muted text-muted-foreground">
        <FileText aria-hidden />
      </div>
    );
  }
  return (
    <img
      // The photo's address lives as long as the thumbnail does.
      ref={(node) => {
        if (!node) return;
        const url = URL.createObjectURL(file);
        node.src = url;
        return () => URL.revokeObjectURL(url);
      }}
      alt=""
      className="aspect-4/3 w-full rounded-lg border bg-muted object-cover"
    />
  );
}
