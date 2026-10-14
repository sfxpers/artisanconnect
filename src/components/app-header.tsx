import { Link } from "@tanstack/react-router";
import { Bell, Menu, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Wordmark } from "@/components/wordmark";
import type { Me } from "@/web/me";
import { copy } from "@/web/copy";

/** A page in the header; `cta` draws it as an outlined button, as a Visitor's Sign up is. */
type NavItem = { to: string; label: string; cta?: boolean };

/** Each party's header, as #111 names it. */
function navFor(me: Me | null): NavItem[] {
  if (!me) {
    const t = copy.header.visitor;
    return [
      { to: "/artisans", label: t.findArtisans },
      { to: "/sign-up", label: t.signUp, cta: true },
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

const navLink =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground";
const navActive = { className: "text-foreground bg-muted" };

/** The one header of a Visitor, a Client, or an Artisan (#107). The Admin's is its sidebar. */
export function AppHeader({ me }: { me: Me | null }) {
  const nav = navFor(me);
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <MobileNav nav={nav} />
        <Link to="/" aria-label={copy.appName} className="mr-4 shrink-0 rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label={copy.header.main} className="ml-auto hidden items-center gap-1 md:flex">
          {nav.map((item) =>
            item.cta ? (
              <Link
                key={item.to}
                to={item.to}
                className={buttonVariants({ variant: "outline", className: "mx-1" })}
              >
                {item.label}
              </Link>
            ) : (
              <Link key={item.to} to={item.to} className={navLink} activeProps={navActive}>
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          {me && (
            <Link
              to="/notices"
              aria-label={copy.header.notices}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              activeProps={{ className: "bg-muted" }}
            >
              <Bell />
            </Link>
          )}
          <ThemeMenu />
          {me && (
            <Link to="/account" aria-label={copy.header.client.account} className="rounded-full">
              <Avatar size="sm">
                <AvatarFallback>{initials(me.publicName)}</AvatarFallback>
              </Avatar>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** The pages, in a sheet from the left on a phone. */
function MobileNav({ nav }: { nav: NavItem[] }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={copy.header.menu} />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>
            <Wordmark />
          </SheetTitle>
        </SheetHeader>
        <nav aria-label={copy.header.menu} className="grid gap-1 px-4">
          {nav.map((item) => (
            <Link key={item.to} to={item.to} className={navLink} activeProps={navActive}>
              {item.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Light, dark, or as the device is. */
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const t = copy.header.theme;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t.label} />}>
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun />
            {t.light}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            {t.dark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            {t.system}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
