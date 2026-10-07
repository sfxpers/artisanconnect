import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConversationSummary } from "@/components/conversation";
import { copy } from "@/web/copy";

const t = copy.conversation;

export type JobTab = "overview" | "messages";

/** The Job page's tabs: its Overview, and its Messages, with how many wait unread. */
export function JobTabs({
  jobId,
  tab,
  conversations,
  overview,
  messages,
}: {
  jobId: string;
  tab: JobTab;
  conversations: ConversationSummary[];
  overview: ReactNode;
  messages: ReactNode;
}) {
  const navigate = useNavigate();
  const unread = conversations.reduce((sum, each) => sum + each.unread, 0);
  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        void navigate({
          to: "/jobs/$jobId",
          params: { jobId },
          search: (previous) => ({ ...previous, tab: value as JobTab }),
          replace: true,
        })
      }
    >
      <TabsList variant="line">
        <TabsTrigger value="overview">{t.tabs.overview}</TabsTrigger>
        <TabsTrigger value="messages">{t.tabs.messages(unread)}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        {overview}
      </TabsContent>
      <TabsContent value="messages" className="pt-4">
        {messages}
      </TabsContent>
    </Tabs>
  );
}
