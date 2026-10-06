import type { ReactNode } from "react";
import type { JobView } from "@/components/job-form";
import { formatDay } from "@/domain/sa-days";
import { copy } from "@/web/copy";

// What the Job page shows of a Job to its Client and to an Artisan offered it.

const t = copy.job;

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What changes until the first Quote: the details, photos, Site type, and Preferred start. */
export function Details({
  job,
}: {
  job: Pick<JobView, "title" | "description" | "photos" | "siteType" | "preferredStart">;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-medium">{job.title}</h3>
        <p className="text-sm whitespace-pre-line">{job.description}</p>
      </div>
      <dl className="flex flex-wrap gap-6 text-sm">
        <Fact label={t.siteType}>{job.siteType && t.siteTypes[job.siteType]}</Fact>
        <Fact label={t.preferredStartShown}>
          {job.preferredStart ? formatDay(job.preferredStart) : t.none}
        </Fact>
      </dl>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {job.photos.map((photo, index) => (
          <li key={photo.id}>
            <a href={photo.href} target="_blank" rel="noreferrer">
              <img
                src={photo.thumbnailHref}
                alt={t.photo(index + 1)}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg border object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
