import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { copy, formatDate } from "@/web/copy";

type Notice = { id: string; title: string; link: string; toldAt: Date | string };

/** A Notices stream: one row per Tell, newest first, each linking to what it is about. */
export function NoticeList({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.notices.empty}</p>;
  }
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {notices.map((notice) => (
          <li key={notice.id} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{notice.title}</div>
              <div className="text-xs text-muted-foreground">{formatDate(notice.toldAt)}</div>
            </div>
            <Link to={notice.link} className="shrink-0 text-sm underline">
              {copy.notices.open}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
