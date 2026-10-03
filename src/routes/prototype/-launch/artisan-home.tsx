// PROTOTYPE: the Artisan home in the "Contract" look (like Upwork's freelancer home).
// Main: what's waiting on you, then tabs of Job Matches / Invitations / Active Jobs / Notices.
// Sidebar: Profile with the Available for Jobs switch, Regions, and Payouts.
import { useState } from "react";
import { CircleAlert, MapPin, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ARTISAN, HOME, QUOTES, rand } from "./data";
import { AppHeader, ARTISAN_NAV } from "./job-contract";
import { Stars, initials } from "./parts";

const matches = [
  {
    title: "Kitchen mixer tap and blocked drain",
    suburb: "Claremont",
    region: "Southern",
    posted: "2 hours ago",
    quotes: 3,
    text: "Mixer tap drips and the sink drains slowly. Probably the trap. Would like it done this week.",
    site: "Home",
  },
  {
    title: "Geyser valve dripping",
    suburb: "Observatory",
    region: "Table Bay",
    posted: "Yesterday",
    quotes: 1,
    text: "Pressure valve on a 100L geyser drips constantly into the tray. Access via ceiling hatch.",
    site: "Home",
  },
];

const active = [
  {
    title: "Replace burst geyser",
    client: "Thandi M.",
    status: "Fix requested",
    next: "Fix and mark complete, or open a Dispute",
    money: `${rand(4200)} Labour unreleased`,
    urgent: true,
  },
  {
    title: "Burst pipe under the bath",
    client: "Bongani S.",
    status: "Paid",
    next: "Tap “I've started” on Mon 6 Oct",
    money: `${rand(3400)} held`,
    urgent: false,
  },
];

export function ArtisanHome() {
  const [available, setAvailable] = useState(HOME.available);
  const waiting = active.filter((a) => a.urgent);
  return (
    <div className="min-h-svh bg-muted/40 pb-28">
      <AppHeader nav={ARTISAN_NAV} me={ARTISAN.name} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div>
          <p className="text-sm text-muted-foreground">Saturday 4 October</p>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, Sipho</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {waiting.map((w) => (
              <Card key={w.title} className="ring-2 ring-primary/80">
                <CardHeader>
                  <CardDescription>Waiting on you</CardDescription>
                  <CardTitle className="text-lg">{w.title}</CardTitle>
                  <CardAction>
                    <Badge variant="destructive">{w.status}</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {w.client} asked: “Pressure valve still drips into the tray.”
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="lg">Mark complete</Button>
                    <Button size="lg" variant="outline">
                      Open Job
                    </Button>
                    <Button size="lg" variant="destructive">
                      Open a Dispute
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Tabs defaultValue="matches">
              <TabsList variant="line">
                <TabsTrigger value="matches">Job Matches ({matches.length})</TabsTrigger>
                <TabsTrigger value="invitations">Invitations (1)</TabsTrigger>
                <TabsTrigger value="active">Active Jobs ({active.length})</TabsTrigger>
                <TabsTrigger value="notices">Notices</TabsTrigger>
              </TabsList>

              <TabsContent value="matches" className="pt-4">
                <Card className="py-0">
                  <div className="divide-y">
                    {matches.map((m) => (
                      <div key={m.title} className="space-y-2 p-5">
                        <div className="text-xs text-muted-foreground">Offered {m.posted}</div>
                        <div className="text-base font-medium">{m.title}</div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {m.suburb}, {m.region}
                          </span>
                          <span>Plumbing</span>
                          <span>{m.site}</span>
                          <span>{m.quotes} of 5 Quotes</span>
                        </div>
                        <p className="text-sm">{m.text}</p>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm">Write a Quote</Button>
                          <Button size="sm" variant="ghost">
                            Pass
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="invitations" className="pt-4">
                <Card>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Hire Again</Badge>
                      <span className="text-xs text-muted-foreground">
                        from Lerato N., your Client since March
                      </span>
                    </div>
                    <div className="text-base font-medium">Outside tap and garden line</div>
                    <p className="text-sm text-muted-foreground">Only you can see this Job.</p>
                    <Button size="sm">Write a Quote</Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="active" className="pt-4">
                <Card className="py-0">
                  <div className="divide-y">
                    {active.map((a) => (
                      <div key={a.title} className="flex items-center gap-4 p-5">
                        <Avatar>
                          <AvatarFallback>{initials(a.client)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{a.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.client} · {a.next}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={a.urgent ? "destructive" : "outline"}>{a.status}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{a.money}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="notices" className="pt-4">
                <Card>
                  <CardContent className="space-y-3">
                    {HOME.notices.map((n) => (
                      <div key={n.text} className="flex gap-4 text-sm">
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">{n.at}</span>
                        <span>{n.text}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card size="sm">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{initials(ARTISAN.trading)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{ARTISAN.trading}</div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <Stars rating={QUOTES[0].rating} />
                      <span>{QUOTES[0].completed} completed</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTES[0].badges.map((b) => (
                    <Badge key={b} variant="outline">
                      <ShieldCheck />
                      {b}
                    </Badge>
                  ))}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label htmlFor="available">Available for Jobs</Label>
                  <Switch id="available" checked={available} onCheckedChange={setAvailable} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {available
                    ? "You receive Job Matches."
                    : "No Job Matches. Your Profile stays visible."}
                </p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Regions</CardTitle>
                <CardAction>
                  <Button size="xs" variant="ghost">
                    Edit
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {HOME.regions.map((r) => (
                  <Badge key={r} variant="secondary">
                    {r}
                  </Badge>
                ))}
                <span className="w-full text-xs text-muted-foreground">3 of 3 chosen</span>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Payouts</CardTitle>
                <CardDescription>Next daily run: {rand(810)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {HOME.payouts.map((p) => {
                  const rejected = p.state.startsWith("Rejected");
                  return (
                    <div key={p.what} className="space-y-0.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{p.what}</span>
                        <span className="font-medium tabular-nums">{rand(p.paid)}</span>
                      </div>
                      <div
                        className={
                          rejected
                            ? "flex items-center gap-1 text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {rejected && <CircleAlert className="size-3" />}
                        {p.at} · {p.state}
                        {!rejected && ` · fee ${rand(p.fee)}`}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
