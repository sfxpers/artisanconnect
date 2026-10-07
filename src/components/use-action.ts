import { useState } from "react";
import { useRouter } from "@tanstack/react-router";

type Result = { ok: true } | { ok: false; refusal: { message: string } };

/**
 * Runs one action at a time, keeping its refusal to show where the person
 * acted. Once it is done, what follows runs and the page loads again.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  async function run(action: () => Promise<Result>, then?: () => void | Promise<void>) {
    setBusy(true);
    setRefusal(null);
    const result = await action();
    if (!result.ok) {
      setBusy(false);
      setRefusal(result.refusal.message);
      return false;
    }
    await then?.();
    await router.invalidate();
    setBusy(false);
    return true;
  }
  return { busy, refusal, setRefusal, run };
}
