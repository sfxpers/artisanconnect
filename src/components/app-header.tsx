import { Link } from "@tanstack/react-router";
import { Bell, Hammer } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Me } from "@/web/me";
import { copy } from "@/web/copy";

type NavItem = { to: string; label: string };

function navFor(me: Me | null): NavItem[] {
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

/** The header in the Contract look (#107): Visitor, Client, or Artisan. */
export function AppHeader({ me }: { me: Me | null }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6">
        <Link to="/" className="inline-flex shrink-0 items-center gap-2 font-semibold">
          <Hammer className="size-5" />
          <span className="hidden sm:inline">{copy.appName}</span>
        </Link>
        <nav className="flex min-w-0 gap-4 overflow-x-auto text-sm sm:gap-5" aria-label="Main">
          {navFor(me).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
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
