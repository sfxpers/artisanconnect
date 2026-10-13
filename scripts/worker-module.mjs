// Runs a module of the app in Node against a Worker environment's bindings,
// as the Worker would: through Vite. For commands run beside the app, not in it.
import { runnerImport } from "vite";
import { getPlatformProxy } from "wrangler";

/**
 * Imports the module and hands it, with the environment's bindings, to `use`;
 * the bindings are released after, whatever happens.
 */
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
