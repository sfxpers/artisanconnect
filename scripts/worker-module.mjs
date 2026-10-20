// For commands run beside the app, not in it.
import { runnerImport } from "vite";
import { getPlatformProxy } from "wrangler";

export async function withWorkerModule(file, proxyOptions, use) {
  let proxy;
  try {
    // Local D1 must match `db:migrate:local` / Void's default persist (`.void`),
    // not Wrangler's `.wrangler/state/v3`.
    proxy = await getPlatformProxy({
      persist: { path: ".void" },
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
