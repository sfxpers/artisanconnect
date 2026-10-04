// The Workers runtime imports a .wasm file as a compiled module.
declare module "*.wasm?module" {
  const module: WebAssembly.Module;
  export default module;
}
