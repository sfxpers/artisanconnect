import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Page, Refusal } from "@/components/page";
import { formatRands } from "@/domain/money";
import { copy } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";
import { getUnpaidTotals, holdPayouts, liftPayoutHold } from "@/web/payouts";

export const Route = createFileRoute("/admin/payouts")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: () => getUnpaidTotals(),
  component: AdminPayouts,
});

const t = copy.admin.payouts;

type Row = Awaited<ReturnType<typeof getUnpaidTotals>>[number];

/** Each Artisan's unpaid total, and holding or freeing their Payouts (#128). */
function AdminPayouts() {
  const rows = Route.useLoaderData();
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {rows.map((row) => (
              <ArtisanRow key={row.artisanId} row={row} />
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

function ArtisanRow({ row }: { row: Row }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setRefusal(null);
    const change = row.held ? liftPayoutHold : holdPayouts;
    const result = await change({ data: { artisanId: row.artisanId } });
    if (!result.ok) setRefusal(result.refusal.message);
    await router.invalidate();
    setBusy(false);
  }

  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.name}</span>
            {row.held && <Badge variant="destructive">{t.held}</Badge>}
          </div>
          <div className="truncate text-xs text-muted-foreground">{row.email}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">{t.unpaid}</div>
          <div className="font-medium tabular-nums">{formatRands(row.unpaidCents)}</div>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle()}>
          {row.held ? t.lift : t.hold}
        </Button>
      </div>
      <Refusal message={refusal} />
    </li>
  );
}
