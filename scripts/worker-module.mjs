// For commands run beside the app, not in it.
import { runnerImport } from "vite";
import { getPlatformProxy } from "wrangler";

export async function withWorkerModule(file, proxyOptions, use) {
  let proxy;
  try {
    proxy = await getPlatformProxy(proxyOptions);
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
