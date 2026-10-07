// Runs a module of the app in Node against a Worker environment's bindings,
// as the Worker would: through Vite, with `*.wasm?module` compiled as the
// Worker build compiles it. For commands run beside the app, not in it.
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
      plugins: [wasmModules()],
    });
    return await use(module, proxy.env);
  } finally {
    await proxy?.dispose();
  }
}

/**
 * Loads `*.wasm?module` as a compiled WebAssembly.Module, as the Worker build
 * does. The domain imports the photo codecs that way, and Vite alone does not
 * know the suffix.
 */
function wasmModules() {
  return {
    name: "wasm-modules",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm?module")) return;
      const file = id.slice(0, -"?module".length);
      return [
        `import { readFileSync } from "node:fs";`,
        `export default new WebAssembly.Module(readFileSync(${JSON.stringify(file)}));`,
      ].join("\n");
    },
  };
}
