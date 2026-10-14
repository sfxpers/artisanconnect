import { Bell, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { markNoticesSeen } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { EmptyState } from "@/components/page";

/**
 * Marks the Notices read once they are shown, and gives how many were new,
 * held from before, so their New badges stay while the stream is open.
 */
export function useNoticesSeen(shown = true) {
  const router = useRouter();
  const unread = useRouterState({
    select: (state) => state.matches[0]?.context.unreadNotices ?? 0,
  });
  // How many were new when the page opened; reading them does not take the badges away.
  const [fresh] = useState(unread);
  useEffect(() => {
    if (shown && unread > 0) void markNoticesSeen().then(() => router.invalidate());
  }, [shown, unread, router]);
  return fresh;
}

type Notice = { id: string; title: string; link: string; toldAt: Date | string };

/**
 * A Notices stream: one row per Tell, newest first, each linking to what it
 * is about; the first `fresh` are new since the stream was last opened.
 */
export function NoticeList({ notices, fresh = 0 }: { notices: Notice[]; fresh?: number }) {
  if (notices.length === 0) {
    return <EmptyState icon={<Bell />}>{copy.notices.empty}</EmptyState>;
  }
  return (
    <Card className="py-0">
      <ul className="divide-y">
        {notices.map((notice, index) => (
          // The title links to what the Tell is about, and covers the whole row.
          <li key={notice.id} className="relative flex items-center gap-4 p-4 hover:bg-muted">
            <div className="min-w-0 flex-1">
              <Link to={notice.link} className="font-medium after:absolute after:inset-0">
                {notice.title}
              </Link>
              {index < fresh && <Badge className="ml-2">{copy.notices.new}</Badge>}
              <div className="text-xs text-muted-foreground">{formatDate(notice.toldAt)}</div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </li>
        ))}
      </ul>
    </Card>
  );
}
