import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { QUEUE_NAMES, type QueueName } from "@/domain/queue-names";
import type { Block } from "@/domain/queues";
import { copy } from "@/web/copy";

// Pieces of the Admin's pages, in the Contract look (#107).

/** Every queue with its count, each linking to the home stream filtered to it. */
export function QueueCounts({
  counts,
  current,
}: {
  counts: Record<QueueName, number>;
  current?: QueueName;
}) {
  return (
    <nav aria-label={copy.admin.home.title} className="flex flex-wrap gap-2">
      {QUEUE_NAMES.map((queue) => (
        <Link
          key={queue}
          to="/admin"
          search={{ queue }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs",
            queue === current ? "border-primary text-foreground" : "text-muted-foreground",
          )}
        >
          {copy.admin.queues[queue]}
          <span
            className={cn(
              "font-semibold tabular-nums",
              counts[queue] > 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {counts[queue]}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function QueueBadge({ queue }: { queue: QueueName }) {
  return <Badge variant="secondary">{copy.admin.queues[queue]}</Badge>;
}

/** What a kind of item shows in a tab or the sidebar. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, index) =>
        block.kind === "text" ? (
          <p key={index} className="whitespace-pre-line">
            {block.text}
          </p>
        ) : (
          <dl key={index} className="space-y-1">
            {block.facts.map((fact) => (
              <div key={fact.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{fact.label}</dt>
                <dd className="text-right tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ),
      )}
    </div>
  );
}
