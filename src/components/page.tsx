import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { CloudOff, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { copy } from "@/web/copy";

/** A page's main column, with its title, the line under it, and its actions. */
export function Page({
  title,
  lead,
  actions,
  narrow,
  children,
}: {
  title?: string;
  lead?: ReactNode;
  actions?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full space-y-6 px-4 py-6 sm:px-6 sm:py-10",
        narrow ? "max-w-xl" : "max-w-6xl",
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            )}
            {lead && <p className="text-muted-foreground">{lead}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </main>
  );
}

/** A page's main column and its sidebar, which goes under it on a phone. */
export const withSidebar = "grid items-start gap-6 lg:grid-cols-3 lg:*:first:col-span-2";

/** The highlighted card for what the viewer can do now (#107). */
export function NextStepCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="bg-secondary/60 ring-2 ring-primary">
      <CardHeader>
        <CardDescription className="text-xs font-semibold tracking-wide text-primary uppercase">
          {label}
        </CardDescription>
        <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** Signing in, signing up, and getting back in: one card, under the wordmark. */
export function AuthCard({
  label,
  title,
  lead,
  children,
}: {
  label: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-10 sm:py-16">
      <Card className="shadow-md">
        <CardHeader className="gap-2">
          <CardDescription className="text-xs font-semibold tracking-wide text-primary uppercase">
            {label}
          </CardDescription>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {lead && <p className="text-sm text-muted-foreground">{lead}</p>}
        </CardHeader>
        <CardContent className="space-y-5">{children}</CardContent>
      </Card>
    </main>
  );
}

/** Why the last request was refused, shown where the person acted. */
export function Refusal({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
    >
      {message}
    </p>
  );
}

/** A field's validation messages. */
export function FieldErrors({ errors }: { errors: unknown[] }) {
  const messages = errors
    .map((error) =>
      typeof error === "string" ? error : (error as { message?: string } | undefined)?.message,
    )
    .filter(Boolean);
  if (messages.length === 0) return null;
  return <p className="text-sm text-destructive">{messages[0]}</p>;
}

/** What a list shows while it has nothing in it. */
export function EmptyState({
  title,
  icon = <Inbox />,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Empty className="border border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-secondary text-secondary-foreground">
          {icon}
        </EmptyMedia>
        {title && <EmptyTitle>{title}</EmptyTitle>}
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Any page while its data loads. */
export function PageSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10"
      aria-busy="true"
      aria-label={copy.loading}
    >
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className={withSidebar}>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-56 rounded-xl" />
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
      <Empty className="border border-border bg-card py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
            <CloudOff />
          </EmptyMedia>
          <EmptyTitle className="text-lg">{t.title}</EmptyTitle>
          <EmptyDescription>{t.lead}</EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => router.invalidate()}>{t.retry}</Button>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            {t.home}
          </Link>
        </div>
      </Empty>
    </Page>
  );
}
