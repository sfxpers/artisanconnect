import type { ReactNode } from "react";
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Page } from "@/components/page";
import { signOut } from "@/web/accounts";
import { copy, formatDate } from "@/web/copy";
import { onlyFor } from "@/web/guards";

export const Route = createFileRoute("/account")({
  beforeLoad: ({ context }) => ({ me: onlyFor("account", context.me) }),
  component: Account,
});

const t = copy.account;

/** Settings rows. Changing them comes with Account self-service (#141). */
function Account() {
  const { me } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <Page title={t.title} narrow>
      <Card className="py-0">
        <dl className="divide-y">
          <SettingsRow label={t.kind}>{copy.signUp.kind.chosen[me.kind]}</SettingsRow>
          <SettingsRow label={t.name}>{me.name}</SettingsRow>
          <SettingsRow label={t.tradingName}>{me.tradingName ?? t.none}</SettingsRow>
          <SettingsRow label={t.email}>{me.email}</SettingsRow>
          <SettingsRow label={t.rules}>
            <Link to="/rules" className="underline">
              {t.accepted(me.rules.version, formatDate(me.rules.acceptedAt))}
            </Link>
          </SettingsRow>
        </dl>
      </Card>
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          await router.invalidate();
          await navigate({ to: "/" });
        }}
      >
        {t.signOut}
      </Button>
    </Page>
  );
}

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
