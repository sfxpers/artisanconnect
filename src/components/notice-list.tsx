import { Bell, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { copy, formatDate } from "@/web/copy";
import { EmptyState } from "@/components/page";

type Notice = { id: string; title: string; link: string; toldAt: Date | string };

/** A Notices stream: one row per Tell, newest first, each linking to what it is about. */
export function NoticeList({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) {
    return <EmptyState icon={<Bell />}>{copy.notices.empty}</EmptyState>;
  }
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {notices.map((notice) => (
          // The title links to what the Tell is about, and covers the whole row.
          <li key={notice.id} className="relative flex items-center gap-4 p-4 hover:bg-muted">
            <div className="min-w-0 flex-1">
              <Link to={notice.link} className="font-medium after:absolute after:inset-0">
                {notice.title}
              </Link>
              <div className="text-xs text-muted-foreground">{formatDate(notice.toldAt)}</div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </li>
        ))}
      </ul>
    </Card>
  );
}
