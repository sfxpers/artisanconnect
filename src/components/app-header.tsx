import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Bell, Hammer } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOut } from "@/web/accounts";
import type { AdminMe, Me } from "@/web/me";
import { copy } from "@/web/copy";

type NavItem = { to: string; label: string };

function navFor(me: Me | null, admin: AdminMe | null): NavItem[] {
  if (admin) {
    const t = copy.header.admin;
    return [
      { to: "/admin", label: t.queues },
      { to: "/admin/people", label: t.people },
      { to: "/admin/payouts", label: t.payouts },
      { to: "/admin/admins", label: t.admins },
      { to: "/admin/audit", label: t.audit },
    ];
  }
  if (!me) {
    const t = copy.header.visitor;
    return [
      { to: "/artisans", label: t.findArtisans },
      { to: "/sign-up", label: t.signUp },
      { to: "/sign-in", label: t.signIn },
    ];
  }
  if (me.kind === "client") {
    const t = copy.header.client;
    return [
      { to: "/jobs", label: t.jobs },
      { to: "/artisans", label: t.findArtisans },
      { to: "/account", label: t.account },
    ];
  }
  const t = copy.header.artisan;
  return [
    { to: "/home", label: t.home },
    { to: "/profile", label: t.profile },
    { to: "/payouts", label: t.payouts },
    { to: "/account", label: t.account },
  ];
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The header in the Contract look (#107): Visitor, Client, Artisan, or Admin. */
export function AppHeader({ me, admin }: { me: Me | null; admin: AdminMe | null }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6">
        <Link to="/" className="inline-flex shrink-0 items-center gap-2 font-semibold">
          <Hammer className="size-5" />
          <span className="hidden sm:inline">{copy.appName}</span>
        </Link>
        <nav className="flex min-w-0 gap-4 overflow-x-auto text-sm sm:gap-5" aria-label="Main">
          {navFor(me, admin).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/admin" }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {admin && <AdminCorner admin={admin} />}
        {me && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Link to="/notices" aria-label={copy.header.notices} className="text-muted-foreground">
              <Bell className="size-4" />
            </Link>
            <Link to="/account" aria-label={copy.header.client.account}>
              <Avatar size="sm">
                <AvatarFallback>{initials(me.publicName)}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function AdminCorner({ admin }: { admin: AdminMe }) {
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3">
      <Avatar size="sm" aria-label={admin.email} title={admin.email}>
        <AvatarFallback>{initials(admin.email)}</AvatarFallback>
      </Avatar>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await signOut();
          await router.invalidate();
          await navigate({ to: "/admin/sign-in" });
        }}
      >
        {copy.header.admin.signOut}
      </Button>
    </div>
  );
}
