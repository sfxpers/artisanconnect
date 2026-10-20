// For commands run beside the app, not in it.
import { runnerImport } from "vite";
import { getPlatformProxy } from "wrangler";

export async function withWorkerModule(file, proxyOptions, use) {
  let proxy;
  try {
    // `--persist-to .void` stores under `.void/v3` (same as Void's Vite plugin).
    // getPlatformProxy's path is the full Miniflare root (default is
    // `.wrangler/state/v3`), so use `.void/v3` — not bare `.void`.
    proxy = await getPlatformProxy({
      persist: { path: ".void/v3" },
      ...proxyOptions,
    });
    const { module } = await runnerImport(file, {
      configFile: false,
      logLevel: "error",
      resolve: { tsconfigPaths: true },
    });
    return await use(module, proxy.env);
  } finally {
    await proxy?.dispose();
  }
}
