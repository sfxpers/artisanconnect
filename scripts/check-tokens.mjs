// The design's one hard rule a check can hold (docs/review/111.md §11): every
// colour, radius, and size is a token in src/styles.css, so pages, components,
// and the web layer use no colour or arbitrary value of their own. shadcn's
// own files in src/components/ui stay as shadcn writes them, and are left out.
//   node scripts/check-tokens.mjs        (part of `nub run lint`)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "src/routes", "src/components", "src/web"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.startsWith("src/components/ui/"))
  // The photo shrinker fills a canvas white under a transparent photo: image processing, not style.
  .filter((file) => file !== "src/web/shrink-photo.ts");

const rules = [
  { name: "an oklch() colour", pattern: /oklch\(/ },
  // A hex colour has a letter, or six digits; "#111" alone is an issue number.
  { name: "a hex colour", pattern: /#(?=[0-9a-f]{0,5}[a-f])[0-9a-f]{3}\b|#[0-9a-f]{6}\b/i },
  { name: "an arbitrary value", pattern: /\b[a-z][a-z0-9-]*-\[[^\]\s]+\]/ },
];

const found = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const rule of rules) {
        if (rule.pattern.test(line))
          found.push(`${file}:${index + 1}: ${rule.name}: ${line.trim()}`);
      }
    });
}
if (found.length > 0) {
  console.error(`Use a token from src/styles.css instead:\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`Tokens only: ${files.length} files, no colour or arbitrary value of their own.`);
