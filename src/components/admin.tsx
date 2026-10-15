import { Link, useNavigate } from "@tanstack/react-router";
import { Choose } from "@/components/choose";
import { FieldLabel } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QUEUE_NAMES, type QueueName } from "@/domain/shared/queue-names";
import type { Block } from "@/domain/queues";
import { copy } from "@/web/copy";

// Pieces of the Admin's pages (#107).

/**
 * All queues and each queue with its count, each opening the home stream
 * filtered to it: buttons on a wide screen, one Select on a phone.
 */
export function QueueCounts({
  counts,
  current,
}: {
  counts: Record<QueueName, number>;
  current?: QueueName;
}) {
  const navigate = useNavigate();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const link = (active: boolean) =>
    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" });
  return (
    <>
      <div className="md:hidden">
        <FieldLabel htmlFor="queue" className="sr-only">
          {copy.admin.home.filter}
        </FieldLabel>
        <Choose
          id="queue"
          value={current ?? ""}
          onChange={(queue) => void navigate({ to: "/admin", search: queue ? { queue } : {} })}
          options={[
            { value: "", label: `${copy.admin.home.all} (${total})` },
            ...QUEUE_NAMES.map((queue) => ({
              value: queue,
              label: `${copy.admin.queues[queue]} (${counts[queue]})`,
            })),
          ]}
        />
      </div>
      <nav aria-label={copy.admin.home.filter} className="hidden flex-wrap gap-1 md:flex">
        <Link to="/admin" className={link(!current)} aria-current={current ? undefined : "page"}>
          {copy.admin.home.all}
          <Badge variant="outline" className="tabular-nums">
            {total}
          </Badge>
        </Link>
        {QUEUE_NAMES.map((queue) => (
          <Link
            key={queue}
            to="/admin"
            search={{ queue }}
            className={link(queue === current)}
            aria-current={queue === current ? "page" : undefined}
          >
            {copy.admin.queues[queue]}
            <Badge variant={counts[queue] > 0 ? "default" : "outline"} className="tabular-nums">
              {counts[queue]}
            </Badge>
          </Link>
        ))}
      </nav>
    </>
  );
}

export function QueueBadge({ queue }: { queue: QueueName }) {
  return <Badge variant="secondary">{copy.admin.queues[queue]}</Badge>;
}

/** What a kind of item shows in a tab or the sidebar. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "text":
            return (
              <p key={index} className="whitespace-pre-line">
                {block.text}
              </p>
            );
          case "facts":
            return (
              <dl key={index} className="space-y-1">
                {block.facts.map((fact) => (
                  <div key={fact.label} className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
                    {/* A long value, such as an Email, breaks rather than widening the page. */}
                    <dd className="min-w-0 text-right tabular-nums wrap-anywhere">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case "link":
            return (
              <p key={index}>
                <a href={block.href} className="text-primary underline-offset-2 hover:underline">
                  {block.label}
                </a>
              </p>
            );
          case "files":
            return <Files key={index} files={block.files} />;
        }
      })}
    </div>
  );
}

/** Stored files: photos shown, voice notes played, PDFs opened in a new tab. Their links work for a while. */
function Files({ files }: { files: Extract<Block, { kind: "files" }>["files"] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {files.map((file) => (
        <li key={file.href} className="space-y-1">
          <a
            href={file.href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {file.label}
            {file.kind === "pdf" && ` (${copy.admin.item.pdf})`}
          </a>
          {file.kind === "photo" && (
            <img src={file.href} alt={file.label} className="w-full rounded-md border" />
          )}
          {file.kind === "voice-note" && (
            <audio controls preload="none" src={file.href} className="w-full" />
          )}
        </li>
      ))}
    </ul>
  );
}
