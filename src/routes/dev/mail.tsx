import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { getLocalMail } from "@/web/accounts";
import { copy } from "@/web/copy";

/** Locally only: the emails the app would have sent, Email codes included. */
export const Route = createFileRoute("/dev/mail")({
  loader: () => getLocalMail(),
  component: LocalMail,
});

function LocalMail() {
  const mail = Route.useLoaderData();
  return (
    <Page title={copy.devMail.title}>
      {mail.length === 0 && <p className="text-sm text-muted-foreground">{copy.devMail.empty}</p>}
      {mail.map((email, index) => (
        <Card key={index} data-testid="email">
          <CardHeader>
            <CardDescription>{email.to}</CardDescription>
            <CardTitle>{email.subject}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap">{email.text}</pre>
          </CardContent>
        </Card>
      ))}
    </Page>
  );
}
