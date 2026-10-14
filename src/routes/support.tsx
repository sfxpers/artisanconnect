import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/components/form";
import { Page, Refusal } from "@/components/page";
import { useAction } from "@/components/use-action";
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_TOPIC_NAMES,
  SUPPORT_TOPICS,
  type SupportTopic,
} from "@/domain/support/topics";
import { copy, formatDate, pageTitle } from "@/web/copy";
import { onlyFor } from "@/web/guards";
import { getMySupport, sendSupport } from "@/web/support";

export const Route = createFileRoute("/support")({
  // Any Account, a Suspended one included, may write to the Admin.
  beforeLoad: ({ context }) => {
    onlyFor("account", context);
  },
  loader: () => getMySupport(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: Support,
});

const t = copy.support;

/** Writes to the Admin under a fixed topic; the answer comes by email. */
function Support() {
  const requests = Route.useLoaderData();
  return (
    <Page title={t.title} lead={t.lead} narrow>
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
  const [sent, setSent] = useState(false);
  const { refusal, run } = useAction();
  const form = useAppForm({
    defaultValues: { topic: "" as SupportTopic | "", message: "" },
    onSubmit: ({ value, formApi }) => {
      setSent(false);
      return run(
        () => sendSupport({ data: { ...value, topic: value.topic as SupportTopic } }),
        () => {
          formApi.reset();
          setSent(true);
        },
      );
    },
  });

  return (
    <Card>
      <CardContent>
        <form.AppForm>
          <form.Form className="space-y-4">
            <form.AppField name="topic">
              {(field) => (
                <field.ChoiceField
                  label={t.topic}
                  options={SUPPORT_TOPICS.map((value) => ({
                    value,
                    label: SUPPORT_TOPIC_NAMES[value],
                  }))}
                />
              )}
            </form.AppField>
            <form.AppField name="message">
              {(field) => (
                <field.TextareaField label={t.message} rows={6} maxLength={SUPPORT_MESSAGE_MAX} />
              )}
            </form.AppField>
            <Refusal message={refusal} />
            {sent && <p className="text-sm text-muted-foreground">{t.sent}</p>}
            <form.Subscribe
              selector={(state) => !!state.values.topic && !!state.values.message.trim()}
            >
              {(ready) => <form.Submit disabled={!ready}>{t.send}</form.Submit>}
            </form.Subscribe>
          </form.Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
