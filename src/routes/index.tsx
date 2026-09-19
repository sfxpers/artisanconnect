import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const getGreeting = createServerFn({ method: "GET" }).handler(() => {
  return {
    appName: env.APP_NAME,
    runtime: navigator.userAgent,
  };
});

const ping = createServerFn({ method: "POST" }).handler(() => {
  return { ok: true as const, at: new Date().toISOString() };
});

export const Route = createFileRoute("/")({
  loader: () => getGreeting(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  const [pong, setPong] = useState<string | null>(null);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{data.appName}</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">{data.runtime}</p>
      <Button
        onClick={() => {
          void ping().then((result) => {
            setPong(`${result.ok ? "ok" : "error"} @ ${result.at}`);
          });
        }}
      >
        Ping server
      </Button>
      {pong ? <p className="font-mono text-xs text-muted-foreground">{pong}</p> : null}
    </main>
  );
}
