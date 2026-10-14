import type { ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ChartColumn,
  FileClock,
  Inbox,
  LogOut,
  MapPin,
  ScrollText,
  ShieldUser,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { initials, ThemeMenu } from "@/components/app-header";
import { Wordmark } from "@/components/wordmark";
import { signOut } from "@/web/accounts";
import type { AdminMe } from "@/web/me";
import { copy } from "@/web/copy";

const t = copy.header.admin;

const NAV = [
  { to: "/admin", label: t.queues, icon: Inbox },
  { to: "/admin/people", label: t.people, icon: UsersRound },
  { to: "/admin/payouts", label: t.payouts, icon: Wallet },
  { to: "/admin/figures", label: t.figures, icon: ChartColumn },
  { to: "/admin/suburbs", label: t.suburbs, icon: MapPin },
  { to: "/admin/rules", label: t.rules, icon: ScrollText },
  { to: "/admin/admins", label: t.admins, icon: ShieldUser },
  { to: "/admin/audit", label: t.audit, icon: FileClock },
] as const;

/** The Admin's pages inside shadcn's dashboard-01 shell: the Sidebar, and a bar over the page. */
export function AdminShell({ admin, children }: { admin: AdminMe; children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const current = NAV.findLast((item) => path === item.to || path.startsWith(`${item.to}/`));
  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" aria-label={t.nav}>
        <SidebarHeader>
          <Link to="/admin" aria-label={copy.appName} className="rounded-md px-2 py-2">
            <Wordmark />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={item === current}
                      render={<Link to={item.to} />}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2 px-2 py-2 text-sm">
              <Avatar size="sm">
                <AvatarFallback>{initials(admin.email)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{admin.email}</span>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={async () => {
                  await signOut();
                  await router.invalidate();
                  await navigate({ to: "/admin/sign-in" });
                }}
              >
                <LogOut />
                <span>{t.signOut}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 lg:px-6">
          <SidebarTrigger className="-ml-1" aria-label={t.toggle} />
          <Separator orientation="vertical" className="mx-2 h-4" />
          <span className="text-sm font-medium">{current?.label ?? t.nav}</span>
          <div className="ml-auto">
            <ThemeMenu />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
