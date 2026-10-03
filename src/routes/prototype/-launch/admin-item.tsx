// PROTOTYPE: an Admin item in the "Contract" look, drawn for a Dispute and a Verification.
// Same shape as the Job page: breadcrumb and title, a "Decision" card on top with only the allowed
// decisions and who is told, the evidence below, the parties and money in a sidebar.
// A Conversation or identity document opens on a logged click.
import { useState, type ReactNode } from "react";
import { ChevronRight, CircleAlert, CircleCheck, Eye, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DISPUTE, QUEUES, VERIFICATION, rand, type AdminItemKey } from "./data";
import { AppHeader } from "./job-contract";
import { initials } from "./parts";

const ADMIN_NAV = ["Queues", "People", "Admins", "Reports", "Audit log"];

function Shell({
  queue,
  title,
  badge,
  children,
  side,
}: {
  queue: string;
  title: string;
  badge: ReactNode;
  children: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-muted/40 pb-28">
      <AppHeader nav={ADMIN_NAV} me="Admin One" admin />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Queues <ChevronRight className="size-3" /> {queue}
            <span className="ml-auto hidden gap-3 md:flex">
              {QUEUES.filter((q) => q.count > 0).map((q) => (
                <span key={q.key}>
                  {q.key} <b className="text-foreground">{q.count}</b>
                </span>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badge}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">{children}</div>
          <div className="space-y-6">{side}</div>
        </div>
      </div>
    </div>
  );
}

function LoggedOpen({ label }: { label: string }) {
  const [opened, setOpened] = useState(false);
  return opened ? (
    <div className="space-y-1">
      <div className="grid h-40 place-items-center rounded-md border bg-muted text-xs text-muted-foreground">
        {label}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Opened by you at 10:14. Written to the Audit log.
      </p>
    </div>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setOpened(true)}>
      <Eye />
      Open {label}
      <span className="text-muted-foreground">(logged)</span>
    </Button>
  );
}

function Party({ role, name, line }: { role: string; name: string; line: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{role}</div>
        <div className="truncate font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{line}</div>
      </div>
    </div>
  );
}

// ---------------- Dispute ----------------

function DisputeItem() {
  const [release, setRelease] = useState(1000);
  return (
    <Shell
      queue="Disputes"
      title={`${rand(DISPUTE.held)} of Labour in Dispute`}
      badge={<Badge variant="destructive">Open</Badge>}
      side={
        <>
          <Card size="sm">
            <CardContent className="space-y-4">
              <Party role="Client" name={DISPUTE.client} line="Opened the Dispute" />
              <Separator />
              <Party
                role="Artisan"
                name={DISPUTE.artisan}
                line={`${DISPUTE.artisanRecord.completed} completed`}
              />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Money</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Line label="Materials (released)" value={rand(DISPUTE.materialsReleased)} />
              <Line label="Labour, not disputed" value={rand(DISPUTE.labour - DISPUTE.held)} />
              <Line label="Labour, held" value={rand(DISPUTE.held)} strong />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Artisan record</CardTitle>
              <CardDescription>Only Admins see this.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Line label="Cancellations" value={String(DISPUTE.artisanRecord.cancellations)} />
              <Line
                label="Cancelled by Clients before start"
                value={String(DISPUTE.artisanRecord.cancelledByClientsBeforeStart)}
              />
              <Line
                label="Disputes decided against"
                value={String(DISPUTE.artisanRecord.disputesLost)}
              />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {DISPUTE.timeline.map((t) => (
                <div key={t} className="flex gap-2">
                  <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  {t}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      }
    >
      <Card className="ring-2 ring-primary/80">
        <CardHeader>
          <CardDescription>Decision</CardDescription>
          <CardTitle className="text-lg">Split the held {rand(DISPUTE.held)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Slider
            value={[release]}
            min={0}
            max={DISPUTE.held}
            step={50}
            onValueChange={(v) => setRelease(Array.isArray(v) ? v[0] : v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Release to the Artisan</div>
              <div className="text-lg font-semibold tabular-nums">{rand(release)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Refund to the Client</div>
              <div className="text-lg font-semibold tabular-nums">
                {rand(DISPUTE.held - release)}
              </div>
            </div>
          </div>
          <Textarea placeholder="Reason, sent to both" />
          <p className="text-xs text-muted-foreground">
            Told: both. The decision is final and cannot be reopened. A Refund goes on the Artisan
            record.
          </p>
        </CardContent>
        <CardFooter>
          <Button size="lg">Record decision</Button>
        </CardFooter>
      </Card>

      <Tabs defaultValue="evidence">
        <TabsList variant="line">
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
          <TabsTrigger value="job">Job and Quote</TabsTrigger>
        </TabsList>
        <TabsContent value="evidence" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Client's reason</CardTitle>
              <CardDescription>{DISPUTE.opened}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{DISPUTE.clientReason}</p>
              <Thumbs n={DISPUTE.clientPhotos} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Artisan's Completion</CardTitle>
              <CardDescription>Tue 30 Sep 16:45</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{DISPUTE.completionNote}</p>
              <Thumbs n={DISPUTE.completionPhotos} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="conversation" className="pt-4">
          <Card>
            <CardContent>
              <LoggedOpen label="the Conversation" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="job" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>{DISPUTE.job}</CardTitle>
              <CardDescription>{DISPUTE.suburb}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="text-xs text-muted-foreground">Hired Quote scope</div>
              <p>{DISPUTE.quoteScope}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

// ---------------- Verification ----------------

function VerificationItem() {
  const [decisions, setDecisions] = useState<Record<string, "accept" | "reject" | undefined>>({});
  const groups = ["Once", "Plumbing", "Optional"] as const;
  const decided = Object.values(decisions).filter(Boolean).length;
  return (
    <Shell
      queue="Verification"
      title={VERIFICATION.artisan}
      badge={<Badge>New Artisan</Badge>}
      side={
        <>
          <Card size="sm">
            <CardContent className="space-y-3">
              <Party
                role="Artisan"
                name={VERIFICATION.artisan}
                line={`Submitted ${VERIFICATION.submitted}`}
              />
              <div className="flex flex-wrap gap-1.5">
                {VERIFICATION.categories.map((c) => (
                  <Badge key={c} variant="secondary">
                    {c}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Signals</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              None for this Account.
            </CardContent>
          </Card>
        </>
      }
    >
      <Card className="ring-2 ring-primary/80">
        <CardHeader>
          <CardDescription>Decision</CardDescription>
          <CardTitle className="text-lg">
            Accept or reject each check ({decided} of {VERIFICATION.checks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Accepted checks show on the Profile as Verification Badges. Told: the Artisan, per check.
          A recorded decision cannot be reopened.
        </CardContent>
        <CardFooter>
          <Button size="lg" disabled={decided < VERIFICATION.checks.length}>
            Record decisions
          </Button>
        </CardFooter>
      </Card>

      {groups.map((g) => (
        <Card key={g}>
          <CardHeader>
            <CardTitle>
              {g === "Once" ? "Once" : g === "Optional" ? "Optional badges" : `Per category: ${g}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {VERIFICATION.checks
              .filter((c) => c.group === g)
              .map((c) => {
                const d = decisions[c.name];
                return (
                  <div key={c.name} className="space-y-3 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{c.name}</div>
                        <div
                          className={
                            c.autoOk
                              ? "flex items-center gap-1 text-xs text-muted-foreground"
                              : "flex items-center gap-1 text-xs text-destructive"
                          }
                        >
                          {c.autoOk ? (
                            <CircleCheck className="size-3.5" />
                          ) : (
                            <CircleAlert className="size-3.5" />
                          )}
                          {c.auto}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={d === "accept" ? "default" : "outline"}
                          onClick={() => setDecisions({ ...decisions, [c.name]: "accept" })}
                        >
                          <ShieldCheck />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant={d === "reject" ? "destructive" : "outline"}
                          onClick={() => setDecisions({ ...decisions, [c.name]: "reject" })}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                    {d === "reject" && <Textarea placeholder="Reason, sent to the Artisan" />}
                    <LoggedOpen label={c.document} />
                  </div>
                );
              })}
          </CardContent>
        </Card>
      ))}
    </Shell>
  );
}

// ---------------- shared ----------------

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between font-semibold" : "flex justify-between"}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Thumbs({ n }: { n: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="size-20 rounded-md bg-muted" />
      ))}
    </div>
  );
}

export function AdminItem({ item }: { item: AdminItemKey }) {
  return item === "dispute" ? <DisputeItem /> : <VerificationItem />;
}
