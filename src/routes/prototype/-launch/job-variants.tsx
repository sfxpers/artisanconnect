// PROTOTYPE: two Job pages over the same JobView.
// A, "Contract": like an Upwork contract. Tabs for Overview / Messages / Details; the next step,
//    the two payments, and the activity on Overview; the other party and the money in a sidebar.
// B, "Split": like a Linear issue. One activity feed where messages and events interleave, with the
//    next step pinned on top and a composer underneath; a properties panel on the right.
import type { ReactNode } from "react";
import { Bell, ChevronRight, Hammer } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLIENT, JOB, QUOTES, STAGES, rand, type JobView } from "./data";
import {
  Composer,
  CounterpartCard,
  EventLine,
  JobMeta,
  MessageLine,
  MoneySummary,
  NowCard,
  PaymentSteps,
  StatusBadge,
  initials,
  stream,
} from "./parts";

function AppHeader({ v }: { v: JobView }) {
  const nav =
    v.viewer === "client"
      ? ["Jobs", "Find Artisans", "Account"]
      : ["Home", "Profile", "Payouts", "Account"];
  const me = v.viewer === "client" ? CLIENT.name : "Sipho Dlamini";
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Hammer className="size-5" />
          ArtisanConnect
        </span>
        <nav className="hidden gap-5 text-sm text-muted-foreground sm:flex">
          {nav.map((n, i) => (
            <span key={n} className={i === 0 ? "text-foreground" : ""}>
              {n}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Bell className="size-4 text-muted-foreground" />
          <Avatar size="sm">
            <AvatarFallback>{initials(me)}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

// ---------------- A: Contract ----------------

export function JobContract({ v }: { v: JobView }) {
  const hired = v.with !== null;
  const items = stream(v);
  return (
    <div className="min-h-svh bg-muted/40 pb-28">
      <AppHeader v={v} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {v.viewer === "client" ? "My Jobs" : "Home"} <ChevronRight className="size-3" />{" "}
            {JOB.category}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{JOB.title}</h1>
            <StatusBadge v={v} />
          </div>
          <JobMeta />
        </div>

        <Tabs defaultValue="overview">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="details">Job details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="space-y-6">
                <NowCard v={v} />

                {hired && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Payments</CardTitle>
                      <CardDescription>Held from Hire, released in two parts.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <PaymentSteps v={v} />
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {v.record.map((r, i) => (
                      <EventLine key={i} row={r} />
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {hired && <CounterpartCard v={v} />}
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Money</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MoneySummary v={v} />
                  </CardContent>
                </Card>
                {hired && (
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Quote</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm text-muted-foreground">
                      <p>
                        Starts {QUOTES[0].start}, {QUOTES[0].days} days
                      </p>
                      <p>Warranty: {QUOTES[0].warranty}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="messages" className="pt-4">
            <Card className="mx-auto max-w-3xl">
              <CardContent className="space-y-5">
                {items.map((x, i) =>
                  x.kind === "msg" ? (
                    <MessageLine key={i} m={x.m} viewer={v.viewer} />
                  ) : (
                    <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Separator className="flex-1" />
                      <span>
                        {x.row.title} · {x.row.at}
                      </span>
                      <Separator className="flex-1" />
                    </div>
                  ),
                )}
                <Separator />
                <Composer v={v} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="pt-4">
            <Card className="max-w-3xl">
              <CardContent className="space-y-4">
                <p>{JOB.description}</p>
                <div className="flex gap-2">
                  {Array.from({ length: JOB.photos }).map((_, i) => (
                    <div key={i} className="size-20 rounded-md bg-muted" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---------------- B: Split ----------------

export function JobSplit({ v }: { v: JobView }) {
  const items = stream(v);
  const stageIdx = STAGES.findIndex((s) => s.key === v.currentStage);
  const stopped = v.stoppedAt !== undefined;
  return (
    <div className="min-h-svh pb-28">
      <AppHeader v={v} />
      <div className="mx-auto grid max-w-6xl lg:grid-cols-[1fr_18rem]">
        <main className="min-w-0 space-y-6 px-4 py-6 lg:border-r lg:pr-8">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">{JOB.title}</h1>
            <p className="text-sm text-muted-foreground">{JOB.description}</p>
            <ol className="flex flex-wrap items-center gap-1.5 text-xs">
              {STAGES.map((s, i) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span
                    className={
                      i < stageIdx
                        ? "text-foreground"
                        : i === stageIdx
                          ? stopped
                            ? "font-medium text-destructive"
                            : "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                          : "text-muted-foreground/60"
                    }
                  >
                    {i < stageIdx ? "✓ " : ""}
                    {s.label}
                  </span>
                  {i < STAGES.length - 1 && (
                    <ChevronRight className="size-3 text-muted-foreground/60" />
                  )}
                </li>
              ))}
            </ol>
          </div>

          <NowCard v={v} />

          <section className="space-y-5">
            <h2 className="text-sm font-medium">Activity</h2>
            {v.record
              .filter((r) => !r.inConversation)
              .slice(0, 1)
              .map((r, i) => (
                <EventLine key={`first-${i}`} row={r} />
              ))}
            {items.map((x, i) =>
              x.kind === "msg" ? (
                <MessageLine key={i} m={x.m} viewer={v.viewer} />
              ) : (
                <EventLine key={i} row={x.row} />
              ),
            )}
            <Composer v={v} />
          </section>
        </main>

        <aside className="space-y-6 px-4 py-6 lg:pl-6">
          <Props label="Status">
            <StatusBadge v={v} />
          </Props>
          {v.with && (
            <Props label={v.viewer === "client" ? "Artisan" : "Client"}>
              <span className="inline-flex items-center gap-2">
                <Avatar size="sm">
                  <AvatarFallback>{initials(v.with)}</AvatarFallback>
                </Avatar>
                {v.with}
              </span>
            </Props>
          )}
          <Props label="Category">{JOB.category}</Props>
          <Props label="Suburb">
            {JOB.suburb}, {JOB.region}
          </Props>
          {v.with && (
            <Props label="Start">
              {QUOTES[0].start} · {QUOTES[0].days} days
            </Props>
          )}
          {v.with && <Props label="Warranty">{QUOTES[0].warranty}</Props>}
          <Separator />
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Money</div>
            <MoneySummary v={v} />
          </div>
          {v.money && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Payments</div>
                {v.money
                  .filter((l) => l.label !== "Protection Fee")
                  .map((l) => (
                    <div key={l.label} className="flex items-center justify-between gap-2 text-sm">
                      <span>{l.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{rand(l.amount)}</span>
                        <Badge
                          variant={
                            l.state === "Released"
                              ? "secondary"
                              : l.state.startsWith("Held")
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {l.state}
                        </Badge>
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Props({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
