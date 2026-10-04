import { useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Blocks, QueueCounts } from "@/components/admin";
import { Page, Refusal } from "@/components/page";
import type { Block } from "@/domain/queues";
import { decideQueueItem, getQueueItem, openLoggedRead } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/items/$itemId")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: ({ params }) => getQueueItem({ data: { itemId: params.itemId } }),
  component: QueueItemPage,
});

const t = copy.admin.item;

type Item = Awaited<ReturnType<typeof getQueueItem>>;

/**
 * A queue item in the Contract look (#107): breadcrumb with queue counts, a
 * highlighted Decision card, tabs, and a sidebar. Each kind of item fills the
 * tabs and sidebar; a recorded decision is shown and never reopened.
 */
function QueueItemPage() {
  const item = Route.useLoaderData();
  return (
    <Page>
      <div className="space-y-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/admin" className="hover:text-foreground">
            {t.queues}
          </Link>
          <ChevronRight className="size-3" />
          <Link to="/admin" search={{ queue: item.queue }} className="hover:text-foreground">
            {copy.admin.queues[item.queue]}
          </Link>
        </div>
        <QueueCounts counts={item.counts} current={item.queue} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
          {item.decided ? <Badge variant="secondary">{t.decided}</Badge> : <Badge>{t.open}</Badge>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          {item.decided ? <DecidedCard decided={item.decided} /> : <DecisionCard item={item} />}
          {item.tabs.length > 0 && (
            <Tabs defaultValue={item.tabs[0]!.key}>
              <TabsList variant="line">
                {item.tabs.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {item.tabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="pt-4">
                  <Card>
                    <CardContent>
                      {"read" in tab ? (
                        <LoggedRead itemId={item.id} read={tab.read} label={tab.label} />
                      ) : (
                        <Blocks blocks={tab.blocks} />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
        <div className="space-y-6">
          {item.sidebar.map((section) => (
            <Card key={section.title} size="sm">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Blocks blocks={section.blocks} />
              </CardContent>
            </Card>
          ))}
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t.timeline}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {item.timeline.map((entry, index) => (
                  <li key={index} className="flex gap-2">
                    <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <div>{entry.text}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(entry.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/** The highlighted card: only the decisions allowed now, each saying who is told. */
function DecisionCard({ item }: { item: Item }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const option = item.decisions.find((decision) => decision.key === chosen);

  async function record() {
    if (!option) return;
    setBusy(true);
    setRefusal(null);
    const result = await decideQueueItem({
      data: { itemId: item.id, decision: option.key, reason },
    });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    await router.invalidate();
  }

  return (
    <Card className="ring-2 ring-primary/80">
      <CardHeader>
        <CardDescription>{t.decision}</CardDescription>
        <CardTitle className="text-lg">{option?.label ?? t.choose}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {item.decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.nothingAllowed}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {item.decisions.map((decision) => (
              <Button
                key={decision.key}
                variant={decision.key === chosen ? "default" : "outline"}
                aria-pressed={decision.key === chosen}
                onClick={() => setChosen(decision.key)}
              >
                {decision.label}
              </Button>
            ))}
          </div>
        )}
        {option && option.reason !== "none" && (
          <div className="space-y-1.5">
            <Label htmlFor="reason">
              {option.reason === "required" ? t.reason : t.reasonOptional}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {option && `${t.told(option.told)} `}
          {t.final}
        </p>
        <Refusal message={refusal} />
      </CardContent>
      {item.decisions.length > 0 && (
        <CardFooter>
          <Button
            size="lg"
            disabled={busy || !option || (option.reason === "required" && !reason.trim())}
            onClick={() => void record()}
          >
            {t.record}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function DecidedCard({ decided }: { decided: NonNullable<Item["decided"]> }) {
  return (
    <Card className="ring-2 ring-primary/80">
      <CardHeader>
        <CardDescription>{t.decision}</CardDescription>
        <CardTitle className="text-lg">{t.recorded(decided.label)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {decided.reason && (
          <p>
            <span className="text-muted-foreground">{t.reason}: </span>
            {decided.reason}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t.by(decided.by, formatDate(decided.at))}. {t.final}
        </p>
      </CardContent>
    </Card>
  );
}

/** A Conversation or document, opened only on a click that is written to the audit log. */
function LoggedRead({ itemId, read, label }: { itemId: string; read: string; label: string }) {
  const [opened, setOpened] = useState<{ blocks: Block[]; at: Date } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setRefusal(null);
    const result = await openLoggedRead({ data: { itemId, read } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setOpened({ blocks: result.value, at: new Date() });
  }

  if (opened) {
    return (
      <div className="space-y-3">
        <Blocks blocks={opened.blocks} />
        <p className="text-xs text-muted-foreground">{t.opened(formatDate(opened.at))}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void open()}>
        <Eye />
        {t.openRead(label)}
        <span className="text-muted-foreground">{t.logged}</span>
      </Button>
      <p className="text-xs text-muted-foreground">{t.loggedNote}</p>
      <Refusal message={refusal} />
    </div>
  );
}
