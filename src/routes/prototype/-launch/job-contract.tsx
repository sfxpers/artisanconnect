// PROTOTYPE: the Job page, picked style "Contract" (like an Upwork contract). Tabs for Overview /
// Messages / Details; the next step, the two payments, and the activity on Overview; the other
// party and the money in a sidebar. The Artisan home and the Admin item reuse this look.
import { Bell, ChevronRight, Hammer } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ARTISAN, CLIENT, JOB, QUOTES, type JobView } from "./data";
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

export function AppHeader({ nav, me, admin }: { nav: string[]; me: string; admin?: boolean }) {
  return (
    <header
      className={admin ? "border-b bg-primary text-primary-foreground" : "border-b bg-background"}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Hammer className="size-5" />
          ArtisanConnect{admin && <span className="font-normal opacity-70">Admin</span>}
        </span>
        <nav className="hidden gap-5 text-sm sm:flex">
          {nav.map((n, i) => (
            <span key={n} className={i === 0 ? "" : "opacity-60"}>
              {n}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Bell className="size-4 opacity-60" />
          <Avatar size="sm">
            <AvatarFallback className="text-foreground">{initials(me)}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

export const CLIENT_NAV = ["Jobs", "Find Artisans", "Account"];
export const ARTISAN_NAV = ["Home", "Profile", "Payouts", "Account"];

// ---------------- A: Contract ----------------

export function JobContract({ v }: { v: JobView }) {
  const hired = v.with !== null;
  const items = stream(v);
  return (
    <div className="min-h-svh bg-muted/40 pb-28">
      <AppHeader
        nav={v.viewer === "client" ? CLIENT_NAV : ARTISAN_NAV}
        me={v.viewer === "client" ? CLIENT.name : ARTISAN.name}
      />
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
