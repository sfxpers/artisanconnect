import { useState } from "react";
import { useRouter } from "@tanstack/react-router";

type Outcome = { ok: true; value?: unknown } | { ok: false; refusal: { message: string } };

/**
 * Runs one action at a time, keeping its refusal to show where the person
 * acted. Once it is done, what follows runs and the page loads again.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  async function run<R extends Outcome>(
    action: () => Promise<R>,
    then?: (value: Extract<R, { ok: true }>["value"]) => unknown,
  ) {
    setBusy(true);
    setRefusal(null);
    const result = await action();
    if (!result.ok) {
      setBusy(false);
      setRefusal(result.refusal.message);
      return false;
    }
    await then?.(result.value);
    await router.invalidate();
    setBusy(false);
    return true;
  }
  return { busy, refusal, setRefusal, run };
}
