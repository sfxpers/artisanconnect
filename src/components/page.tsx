import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Page({
  title,
  narrow,
  children,
}: {
  title?: string;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={cn("mx-auto space-y-6 px-4 py-6", narrow ? "max-w-lg" : "max-w-6xl")}>
      {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
      {children}
    </main>
  );
}

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
    <Card className="ring-2 ring-primary/80">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** Why the last request was refused, shown where the person acted. */
export function Refusal({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
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
