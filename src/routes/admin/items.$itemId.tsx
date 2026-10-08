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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Blocks, QueueCounts } from "@/components/admin";
import { Page, Refusal } from "@/components/page";
import { formatRands } from "@/domain/money";
import { splitOf, type Block, type DecisionField, type ItemRow } from "@/domain/queues";
import { cn } from "@/lib/utils";
import { decideQueueItem, decideQueueRow, getQueueItem, openLoggedRead } from "@/web/admin";
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
          {item.decided ? (
            <DecidedCard decided={item.decided} />
          ) : (
            !item.rows && <DecisionCard item={item} />
          )}
          {item.rows && <RowsCard itemId={item.id} rows={item.rows} highlighted={!item.decided} />}
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
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const option = item.decisions.find((decision) => decision.key === chosen);

  function choose(key: string) {
    setChosen(key);
    const decision = item.decisions.find((each) => each.key === key);
    setFields(
      Object.fromEntries((decision?.fields ?? []).map((field) => [field.key, field.value])),
    );
  }

  async function record() {
    if (!option) return;
    setBusy(true);
    setRefusal(null);
    const wholes = option.fields.flatMap((field) =>
      field.type === "split" ? [[splitOf(field.key), String(field.totalCents)]] : [],
    );
    const result = await decideQueueItem({
      data: {
        itemId: item.id,
        decision: option.key,
        reason,
        fields: { ...fields, ...Object.fromEntries(wholes) },
      },
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
                onClick={() => choose(decision.key)}
              >
                {decision.label}
              </Button>
            ))}
          </div>
        )}
        {option?.fields.map((field) => (
          <DecisionFieldInput
            key={field.key}
            id={field.key}
            field={field}
            value={fields[field.key] ?? ""}
            onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
        {option && option.reason !== "none" && (
          <div className="space-y-1.5">
            <Label htmlFor="reason">
              {option.reason === "required"
                ? (option.reasonLabel ?? t.reason)
                : t.optional(option.reasonLabel ?? t.reason)}
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
            disabled={
              busy ||
              !option ||
              (option.reason === "required" && !reason.trim()) ||
              option.fields.some((field) => field.required && !fields[field.key]?.trim())
            }
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
            <span className="text-muted-foreground">{decided.reasonLabel ?? t.reason}: </span>
            <span className="whitespace-pre-line">{decided.reason}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {decided.by ? t.by(decided.by, formatDate(decided.at)) : formatDate(decided.at)}.{" "}
          {t.final}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * An item decided a row at a time, such as a Verification: each row with what
 * was sent, the automatic reading, its documents on a logged click, and the
 * decisions allowed on it now.
 */
function RowsCard({
  itemId,
  rows,
  highlighted,
}: {
  itemId: string;
  rows: ItemRow[];
  highlighted: boolean;
}) {
  return (
    <Card className={cn(highlighted && "ring-2 ring-primary/80")}>
      <CardHeader>
        <CardDescription>{t.decision}</CardDescription>
        <CardTitle className="text-lg">{highlighted ? t.eachRow : t.rowsNow}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{t.noRows}</p>}
        {rows.map((row) => (
          <RowDecision key={row.id} itemId={itemId} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}

function RowDecision({ itemId, row }: { itemId: string; row: ItemRow }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const option = row.decisions.find((decision) => decision.key === chosen);

  function choose(key: string) {
    setChosen(key);
    setRefusal(null);
    const decision = row.decisions.find((each) => each.key === key);
    setFields(
      Object.fromEntries((decision?.fields ?? []).map((field) => [field.key, field.value])),
    );
  }

  async function record() {
    if (!option) return;
    setBusy(true);
    setRefusal(null);
    const result = await decideQueueRow({
      data: { itemId, rowId: row.id, decision: option.key, reason, fields },
    });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setChosen(null);
    setReason("");
    await router.invalidate();
  }

  const missing =
    !option ||
    (option.reason === "required" && !reason.trim()) ||
    option.fields.some((field) => field.required && !fields[field.key]?.trim());

  return (
    <div className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{row.title}</h3>
        <Badge variant={row.state === "Waiting" ? "default" : "secondary"}>{row.state}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {row.blocks.map((block, index) => (
          <Blocks key={index} blocks={[block]} />
        ))}
      </div>
      {row.reads.map((read) => (
        <LoggedRead
          key={read.key}
          itemId={itemId}
          rowId={row.id}
          read={read.key}
          label={read.label}
        />
      ))}
      {row.decisions.length > 0 && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-2">
            {row.decisions.map((decision) => (
              <Button
                key={decision.key}
                size="sm"
                variant={decision.key === chosen ? "default" : "outline"}
                aria-pressed={decision.key === chosen}
                onClick={() => choose(decision.key)}
              >
                {decision.label}
              </Button>
            ))}
          </div>
          {option?.fields.map((field) => (
            <DecisionFieldInput
              key={field.key}
              id={`${row.id}-${field.key}`}
              field={field}
              value={fields[field.key] ?? ""}
              onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
          {option && option.reason !== "none" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${row.id}-reason`}>
                {option.reason === "required"
                  ? (option.reasonLabel ?? t.reason)
                  : t.optional(option.reasonLabel ?? t.reason)}
              </Label>
              <Textarea
                id={`${row.id}-reason`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}
          {option && (
            <p className="text-xs text-muted-foreground">
              {t.told(option.told)} {t.final}
            </p>
          )}
          <Refusal message={refusal} />
          {option && (
            <Button size="sm" disabled={busy || missing} onClick={() => void record()}>
              {t.record}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A value a decision is recorded with: a text, a day, or a split of a held
 * amount between Release and Refund on a slider, its value the cents released.
 */
function DecisionFieldInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: DecisionField;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = field.required ? field.label : t.optional(field.label);
  if (field.type === "split") {
    const total = field.totalCents ?? 0;
    const released = Math.min(total, Math.max(0, Number(value) || 0));
    return (
      <div className="space-y-2">
        <div className="flex justify-between gap-3 text-sm">
          <Label htmlFor={id}>
            {label}: {formatRands(released)}
          </Label>
          <span className="text-muted-foreground">
            {field.restLabel ?? t.splitRefunded}: {formatRands(total - released)}
          </span>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={total}
          step={total % 100 === 0 ? 100 : 1}
          value={released}
          onChange={(event) => onChange(event.target.value)}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          {t.splitOf(formatRands(total), field.wholeLabel)}
        </p>
      </div>
    );
  }
  if (field.type === "choice") {
    return (
      <div className="space-y-1.5">
        <Label id={id}>{label}</Label>
        <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
          {field.options?.map((option) => (
            <Button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              variant={value === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={field.type === "day" ? "date" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** A Conversation or document, opened only on a click that is written to the audit log. */
function LoggedRead({
  itemId,
  rowId,
  read,
  label,
}: {
  itemId: string;
  rowId?: string;
  read: string;
  label: string;
}) {
  const [opened, setOpened] = useState<{ blocks: Block[]; at: Date } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setRefusal(null);
    const result = await openLoggedRead({ data: { itemId, read, rowId } });
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
