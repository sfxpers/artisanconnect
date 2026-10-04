import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { initials } from "@/components/app-header";
import { Page, Refusal } from "@/components/page";
import { getAdmins, inviteAdmin, removeAdmin } from "@/web/admin";
import { copy, formatDate } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/admins")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: () => getAdmins(),
  component: Admins,
});

const t = copy.admin.admins;

type Admin = Awaited<ReturnType<typeof getAdmins>>[number];

/** Every Admin, inviting another by Email, and removing one but never the last (ADR 0015). */
function Admins() {
  const admins = Route.useLoaderData();
  return (
    <Page title={t.title}>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.lead}</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="py-0">
          <ul className="divide-y">
            {admins.map((admin) => (
              <AdminRow key={admin.adminId} admin={admin} />
            ))}
          </ul>
        </Card>
        <InviteCard admins={admins} />
      </div>
    </Page>
  );
}

function AdminRow({ admin }: { admin: Admin }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setRefusal(null);
    const result = await removeAdmin({ data: { adminId: admin.adminId } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    await router.invalidate();
    // Removing yourself signs you out.
    if (admin.you) await navigate({ to: "/admin/sign-in" });
  }

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar>
          <AvatarFallback>{initials(admin.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{admin.email}</span>
            {admin.you && <Badge variant="secondary">{t.you}</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {admin.invitedBy
              ? t.invitedBy(admin.invitedBy, formatDate(admin.invitedAt))
              : t.setUp(formatDate(admin.invitedAt))}
          </div>
        </div>
        {!confirming && (
          <Button
            variant="outline"
            size="sm"
            disabled={!admin.removable}
            title={admin.removable ? undefined : t.last}
            onClick={() => setConfirming(true)}
          >
            {t.remove}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm">{t.removeLead(admin.email)}</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
              {t.confirm}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
      <Refusal message={refusal} />
    </li>
  );
}

function InviteCard({ admins }: { admins: Admin[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setRefusal(null);
    setInvited(null);
    const result = await inviteAdmin({ data: { email } });
    setBusy(false);
    if (!result.ok) return setRefusal(result.refusal.message);
    setInvited(result.value.email);
    setEmail("");
    await router.invalidate();
  }

  return (
    <Card size="sm" className="self-start">
      <CardHeader>
        <CardTitle>{t.invite}</CardTitle>
        <CardDescription>{t.inviteLead}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void invite();
        }}
      >
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t.email}</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Refusal message={refusal} />
          {invited && admins.some((admin) => admin.email === invited) && (
            <p className="text-sm text-muted-foreground">{t.invited(invited)}</p>
          )}
        </CardContent>
        <CardFooter className="pt-4">
          <Button type="submit" disabled={busy || !email.trim()}>
            {t.send}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
