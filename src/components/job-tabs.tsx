import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConversationSummary } from "@/components/conversation";
import { copy } from "@/web/copy";

const t = copy.conversation;

export type JobTab = "overview" | "messages" | "details";

export const JOB_TABS: readonly JobTab[] = ["overview", "messages", "details"];

/** The Job page's tabs (#107): its Overview, its Messages with how many wait unread, and its details. */
export function JobTabs({
  jobId,
  tab,
  conversations,
  overview,
  messages,
  details,
}: {
  jobId: string;
  tab: JobTab;
  conversations: ConversationSummary[];
  overview: ReactNode;
  messages: ReactNode;
  details: ReactNode;
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
        <TabsTrigger value="details">{t.tabs.details}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        {overview}
      </TabsContent>
      <TabsContent value="messages" className="pt-4">
        {messages}
      </TabsContent>
      <TabsContent value="details" className="pt-4">
        <Card>
          <CardContent>{details}</CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
