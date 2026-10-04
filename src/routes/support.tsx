import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Page, Refusal } from "@/components/page";
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_TOPIC_NAMES,
  SUPPORT_TOPICS,
  type SupportTopic,
} from "@/domain/support/topics";
import { cn } from "@/lib/utils";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMySupport, sendSupport } from "@/web/support";

export const Route = createFileRoute("/support")({
  // Any Account, a Suspended one included, may write to the Admin.
  beforeLoad: ({ context }) => {
    onlyFor("account", context);
  },
  loader: () => getMySupport(),
  component: Support,
});

const t = copy.support;

/** Writes to the Admin under a fixed topic; the answer comes by email. */
function Support() {
  const requests = Route.useLoaderData();
  return (
    <Page title={t.title} narrow>
      <p className="text-sm text-muted-foreground">{t.lead}</p>
      <SupportForm />
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t.yours}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.none}</p>
          ) : (
            <ul className="divide-y">
              {requests.map((request) => (
                <li key={request.requestId} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{SUPPORT_TOPIC_NAMES[request.topic]}</span>
                    {request.answeredAt ? (
                      <Badge variant="secondary">
                        {t.answered(formatDate(request.answeredAt))}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t.waiting}</Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">
                    {request.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.sentAt(formatDate(request.sentAt))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

function SupportForm() {
  const router = useRouter();
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!topic) return;
    setBusy(true);
    setRefusal(null);
    setSent(false);
    const result = await sendSupport({ data: { topic, message } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setTopic(null);
    setMessage("");
    setSent(true);
    await router.invalidate();
  }

  return (
    <Card>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t.topic}</legend>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_TOPICS.map((key) => (
                <label
                  key={key}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-sm hover:border-primary has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    topic === key && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="topic"
                    value={key}
                    className="sr-only"
                    checked={topic === key}
                    onChange={() => setTopic(key)}
                  />
                  {SUPPORT_TOPIC_NAMES[key]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="message">{t.message}</Label>
            <Textarea
              id="message"
              rows={6}
              maxLength={SUPPORT_MESSAGE_MAX}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <Refusal message={refusal} />
          {sent && <p className="text-sm text-muted-foreground">{t.sent}</p>}
          <Button type="submit" disabled={busy || !topic || !message.trim()}>
            {t.send}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
