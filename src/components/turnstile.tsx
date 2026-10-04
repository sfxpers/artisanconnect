import { useCallback, useEffect, useRef, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";

type TurnstileApi = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoading: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    script.onerror = () => reject(new Error("Turnstile did not load"));
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Cloudflare Turnstile, which guards sign-up, sign-in, and code requests. A
 * token passes once, so call `reset` after every request that used it.
 */
export function useTurnstile() {
  const { turnstileSiteKey } = useRouteContext({ from: "__root__" });
  const [token, setToken] = useState<string | undefined>();
  const [round, setRound] = useState(0);
  const reset = useCallback(() => {
    setToken(undefined);
    setRound((n) => n + 1);
  }, []);
  // A new round mounts a new widget, which earns a new token.
  const widget = <TurnstileWidget key={round} siteKey={turnstileSiteKey} onToken={setToken} />;
  return { token, widget, reset };
}

function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | undefined) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widgetId: string | undefined;
    let gone = false;
    void loadTurnstile().then((turnstile) => {
      if (gone || !element.current) return;
      widgetId = turnstile.render(element.current, {
        sitekey: siteKey,
        callback: (value: string) => onToken(value),
        "expired-callback": () => onToken(undefined),
        "error-callback": () => onToken(undefined),
      });
    });
    return () => {
      gone = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, onToken]);
  return <div ref={element} className="min-h-[65px]" />;
}
