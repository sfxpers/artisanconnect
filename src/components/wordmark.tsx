import { cn } from "@/lib/utils";
import { copy } from "@/web/copy";

/** The ArtisanConnect word mark: the name, one word, in Geist 600 and the brand teal. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-lg font-semibold tracking-tight text-primary", className)}>
      {copy.appName}
    </span>
  );
}
