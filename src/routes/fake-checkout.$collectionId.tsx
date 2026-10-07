import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/page";
import { formatRands } from "@/domain/money";
import { copy } from "@/web/copy";
import { completeFakeCheckout, getFakeCheckout } from "@/web/fake-checkout";

const t = copy.fakeCheckout;

/**
 * The fake payment adapter's checkout, in local and staging (#126): where
 * the Client is sent to pay, standing in for the provider's page.
 */
export const Route = createFileRoute("/fake-checkout/$collectionId")({
  loader: ({ params }) => getFakeCheckout({ data: { collectionId: params.collectionId } }),
  component: FakeCheckout,
});

function FakeCheckout() {
  const checkout = Route.useLoaderData();
  const { collectionId } = Route.useParams();
  const [busy, setBusy] = useState(false);

  async function complete(outcome: "succeed" | "fail") {
    setBusy(true);
    const { returnUrl } = await completeFakeCheckout({ data: { collectionId, outcome } });
    window.location.assign(returnUrl);
  }

  return (
    <Page narrow>
      <Card>
        <CardHeader>
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{t.amount}</span>
            <span className="text-2xl font-semibold">{formatRands(checkout.amountCents)}</span>
          </div>
          {checkout.state === "pending" ? (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void complete("succeed")}>
                {t.pay}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void complete("fail")}>
                {t.fail}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">{t.closed}</p>
              <Button variant="outline" disabled={busy} onClick={() => void complete("fail")}>
                {t.back}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
