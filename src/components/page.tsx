import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { CircleAlert, CloudOff, Inbox } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarketplaceRules } from "@/domain/accounts/rules";
import { formatRands } from "@/domain/money";
import { copy, countdownTo, formatDate } from "@/web/copy";

/** A step back up the pages, above a page's title. */
type Crumb = {
  to: string;
  label: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

/**
 * A page's main column: where the viewer is (the crumbs), the title with one
 * status badge, the line under it, and its actions. 1280 pixels at most.
 */
export function Page({
  title,
  lead,
  crumbs,
  status,
  meta,
  actions,
  narrow,
  children,
}: {
  title?: ReactNode;
  lead?: ReactNode;
  crumbs?: Crumb[];
  status?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full space-y-6 px-4 py-6 sm:px-6 lg:py-8",
        narrow ? "max-w-2xl" : "max-w-7xl",
      )}
    >
      {(crumbs || title || actions) && (
        <header className="space-y-3">
          {crumbs && <Crumbs crumbs={crumbs} current={typeof title === "string" ? title : null} />}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              {title && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="text-2xl font-semibold">{title}</h1>
                  {status}
                </div>
              )}
              {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
              {lead && <p className="max-w-3xl text-muted-foreground">{lead}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        </header>
      )}
      {children}
    </main>
  );
}

function Crumbs({ crumbs, current }: { crumbs: Crumb[]; current: string | null }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb) => (
          <Fragment key={crumb.label}>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={<Link to={crumb.to} params={crumb.params} search={crumb.search} />}
              >
                {crumb.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        {current && (
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-48 truncate">{current}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** A page's main column and its sidebar, which goes under it on a phone. */
export const withSidebar = "grid items-start gap-6 lg:grid-cols-3 lg:*:first:col-span-2";

/**
 * The card for what the viewer can do now (#107): one per page, outlined in
 * the brand. On a phone, once it is scrolled out of view, a bar at the foot
 * names it and brings it back, so the next step stays in reach.
 */
export function NextStepCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const phone = useIsMobile();
  useEffect(() => {
    if (!card.current) return;
    // Only once it has gone above the top: a card still below the fold is on its way.
    const watch = new IntersectionObserver(([entry]) =>
      setAway(!entry!.isIntersecting && entry!.boundingClientRect.top < 0),
    );
    watch.observe(card.current);
    return () => watch.disconnect();
  }, []);
  return (
    <>
      <Card ref={card} className="scroll-mt-20 ring-primary">
        <CardHeader>
          <CardDescription className="text-xs font-medium text-primary">{label}</CardDescription>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
      {phone && away && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">{label}</p>
            <p className="truncate text-sm font-semibold">{title}</p>
          </div>
          <Button onClick={() => card.current?.scrollIntoView({ block: "start" })}>
            {copy.nextStepBack}
          </Button>
        </div>
      )}
    </>
  );
}

/** One line of money: what it is, the amount, and a note under it. */
type MoneyLine = { label: ReactNode; cents: number; note?: ReactNode; total?: boolean };

/** Money as a line breakdown, the total last and ruled off; rands in tabular figures. */
export function MoneyLines({ lines, className }: { lines: MoneyLine[]; className?: string }) {
  return (
    <dl className={cn("space-y-2 text-sm", className)}>
      {lines.map((line, index) => (
        // Each line one term and its amount, as a description list asks; a note is a second value.
        <div
          key={index}
          className={cn(
            "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
            line.total && "border-t pt-2 font-semibold",
          )}
        >
          <dt className={cn(!line.total && "text-muted-foreground")}>{line.label}</dt>
          <dd className="tabular-nums">{formatRands(line.cents)}</dd>
          {line.note && <dd className="w-full text-xs text-muted-foreground">{line.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** A deadline as its date and how long is left. */
export function Deadline({ at, className }: { at: Date | string; className?: string }) {
  return (
    <time dateTime={new Date(at).toISOString()} className={className}>
      {formatDate(at)}{" "}
      {/* The countdown may move on between the server's render and the browser's. */}
      <span className="text-muted-foreground" suppressHydrationWarning>
        ({countdownTo(at)})
      </span>
    </time>
  );
}

/** Signing in and getting back in: one centred card (shadcn login-03), under the header. */
export function AuthCard({
  label,
  title,
  lead,
  footer,
  children,
}: {
  label?: string;
  title: string;
  lead?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 sm:py-16">
      <Card>
        <CardHeader className="text-center">
          {label && (
            <CardDescription className="text-xs font-medium text-primary">{label}</CardDescription>
          )}
          <h1 className="text-2xl font-semibold">{title}</h1>
          {lead && <CardDescription>{lead}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-5">{children}</CardContent>
      </Card>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}

/** A Marketplace rules version, to accept at sign-in or reopening. */
export function RulesCard({ rules }: { rules: MarketplaceRules }) {
  return (
    <div className="space-y-1 rounded-lg border p-4 text-sm">
      <div className="text-xs text-muted-foreground">
        {copy.rules.version(rules.version, formatDate(rules.publishedAt))}
      </div>
      <p>{rules.summary}</p>
      <Link
        to="/rules"
        target="_blank"
        className="font-medium text-primary underline underline-offset-4"
      >
        {copy.signUp.rules.read}
      </Link>
    </div>
  );
}

/** Why the last request was refused, shown where the person acted. */
export function Refusal({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** What a list shows while it has nothing in it, and what to do about it. */
export function EmptyState({
  title,
  icon = <Inbox />,
  action,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        {title && <EmptyTitle>{title}</EmptyTitle>}
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Any page while its data loads. */
export function PageSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8"
      aria-busy="true"
      aria-label={copy.loading}
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className={withSidebar}>
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-56" />
      </div>
    </main>
  );
}

/** Any page whose data did not load: try again, or go home. */
export function PageError() {
  const router = useRouter();
  const t = copy.error;
  return (
    <Page narrow>
      <EmptyState
        icon={<CloudOff />}
        title={t.title}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => router.invalidate()}>{t.retry}</Button>
            <Link to="/" className={buttonVariants({ variant: "outline" })}>
              {t.home}
            </Link>
          </div>
        }
      >
        {t.lead}
      </EmptyState>
    </Page>
  );
}
