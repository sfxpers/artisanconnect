import { defineConfig, lazyPlugins } from "vite-plus";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["**/routeTree.gen.ts", ".agents/**"],
  },
  lint: {
    plugins: ["typescript", "react", "unicorn", "oxc", "import", "vitest", "jsx-a11y"],
    // A correctness finding fails the check; a warning would not.
    categories: {
      correctness: "error",
    },
    ignorePatterns: ["**/routeTree.gen.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      // A promise nobody awaits loses its failure; the domain is async throughout.
      "typescript/no-floating-promises": "error",
      // A voice note a party records has no captions; the Admin reads its transcript.
      "jsx-a11y/media-has-caption": "off",
      // role="status" on a line of text, and role="img" on a row of stars, are the
      // patterns WAI-ARIA gives; <output> and <img> do not mean them.
      "jsx-a11y/prefer-tag-over-role": "off",
    },
    overrides: [
      {
        // A test stubs a fake's method by keeping the original to put back.
        files: ["test/**"],
        rules: {
          "typescript/unbound-method": "off",
        },
      },
      {
        // shadcn's own components and hooks, as it writes them, never forked: an
        // input group's click only focuses its input, which the keyboard reaches
        // by itself; a chart's colour key and the phone check are its own code.
        files: ["src/components/ui/**", "src/hooks/**"],
        rules: {
          "jsx-a11y/label-has-associated-control": "off",
          "jsx-a11y/click-events-have-key-events": "off",
          "jsx-a11y/no-noninteractive-element-interactions": "off",
          "typescript/restrict-template-expressions": "off",
          "react/set-state-in-effect": "off",
        },
      },
      {
        // Every rule lives in the domain module (ADR 0017): pages and components
        // may import only its types and the modules shared with the web app.
        files: ["src/routes/**", "src/components/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: ["@/domain/**", "!@/domain/shared/**", "!@/domain/*/inputs"],
                  allowTypeImports: true,
                  message:
                    "A rule belongs in src/domain; reach it through a server function in src/web.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  run: {
    tasks: {
      "check:tokens": "node scripts/check-tokens.mjs",
    },
  },
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  environments: { ssr: { build: { sourcemap: true } } },
  // Lazy, so `vp check`, `vp lint`, and `vp fmt` read this file without
  // starting the plugins.
  plugins: lazyPlugins(() => [
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // The plugin default is remote. Workers AI has no local simulation.
      remoteBindings: false,
    }),
    tanstackStart(),
    viteReact(),
  ]),
});
