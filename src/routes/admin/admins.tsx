import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { useAppForm } from "@/components/form";
import { initials } from "@/components/app-header";
import { useAction } from "@/components/use-action";
import { useConfirm } from "@/components/confirm";
import { Page, Refusal, withSidebar } from "@/components/page";
import { getAdmins, inviteAdmin, removeAdmin } from "@/web/admin";
import { copy, formatDate, pageTitle } from "@/web/copy";
import { onlyForAdmins } from "@/web/guards";

export const Route = createFileRoute("/admin/admins")({
  beforeLoad: ({ context }) => {
    onlyForAdmins(context);
  },
  loader: () => getAdmins(),
  head: () => ({ meta: [{ title: pageTitle(t.title) }] }),
  component: Admins,
});

const t = copy.admin.admins;

type Admin = Awaited<ReturnType<typeof getAdmins>>[number];

/** Every Admin, inviting another by Email, and removing one but never the last (ADR 0015). */
function Admins() {
  const admins = Route.useLoaderData();
  return (
    <Page title={t.title} lead={t.lead}>
      <div className={withSidebar}>
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
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { busy, refusal, run } = useAction();

  async function remove() {
    if (!(await confirm(t.removeLead(admin.email)))) return;
    // Removing yourself signs you out.
    void run(
      () => removeAdmin({ data: { adminId: admin.adminId } }),
      () => admin.you && navigate({ to: "/admin/sign-in" }),
    );
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
        <Button
          variant="outline"
          size="sm"
          disabled={!admin.removable || busy}
          title={admin.removable ? undefined : t.last}
          onClick={() => void remove()}
        >
          {t.remove}
        </Button>
      </div>
      <Refusal message={refusal} />
    </li>
  );
}

function InviteCard({ admins }: { admins: Admin[] }) {
  const [invited, setInvited] = useState<string | null>(null);
  const { refusal, run } = useAction();
  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: ({ value, formApi }) => {
      setInvited(null);
      return run(
        () => inviteAdmin({ data: value }),
        (sent) => {
          setInvited(sent.email);
          formApi.reset();
        },
      );
    },
  });

  return (
    <Card size="sm" className="self-start">
      <CardHeader>
        <CardTitle>{t.invite}</CardTitle>
        <CardDescription>{t.inviteLead}</CardDescription>
      </CardHeader>
      <form.AppForm>
        <form.Form>
          <CardContent className="space-y-3">
            <form.AppField name="email">
              {(field) => <field.TextField label={t.email} type="email" autoComplete="off" />}
            </form.AppField>
            <Refusal message={refusal} />
            {invited && admins.some((admin) => admin.email === invited) && (
              <p className="text-sm text-muted-foreground">{t.invited(invited)}</p>
            )}
          </CardContent>
          <CardFooter className="pt-4">
            <form.Subscribe selector={(state) => !!state.values.email.trim()}>
              {(given) => <form.Submit disabled={!given}>{t.send}</form.Submit>}
            </form.Subscribe>
          </CardFooter>
        </form.Form>
      </form.AppForm>
    </Card>
  );
}
