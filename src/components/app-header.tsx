import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
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
      { to: "/admin/figures", label: t.figures },
      { to: "/admin/suburbs", label: t.suburbs },
      { to: "/admin/rules", label: t.rules },
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
  const nav = (
    <nav className="flex min-w-0 gap-1 overflow-x-auto p-1 text-sm" aria-label="Main">
      {navFor(me, admin).map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/admin" }}
          className="shrink-0 rounded-full px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          activeProps={{ className: "bg-secondary text-secondary-foreground" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label={copy.appName} className="shrink-0 rounded-lg">
          <Wordmark />
        </Link>
        <div className="hidden min-w-0 md:block">{nav}</div>
        {admin && <AdminCorner admin={admin} />}
        {me && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              to="/notices"
              aria-label={copy.header.notices}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            >
              <Bell />
            </Link>
            <Link to="/account" aria-label={copy.header.client.account} className="rounded-full">
              <Avatar>
                <AvatarFallback className="bg-accent font-medium text-accent-foreground">
                  {initials(me.publicName)}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        )}
      </div>
      <div className="border-t px-2 py-0.5 md:hidden">{nav}</div>
    </header>
  );
}

function AdminCorner({ admin }: { admin: AdminMe }) {
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3">
      <Avatar aria-label={admin.email} title={admin.email}>
        <AvatarFallback className="bg-accent font-medium text-accent-foreground">
          {initials(admin.email)}
        </AvatarFallback>
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
