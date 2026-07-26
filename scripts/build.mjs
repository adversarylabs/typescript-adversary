import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/index.js",
  banner: {
    js: "import { createRequire as __typescriptCreateRequire } from 'node:module'; import { fileURLToPath as __typescriptFileURLToPath } from 'node:url'; import { dirname as __typescriptDirname } from 'node:path'; const require = __typescriptCreateRequire(import.meta.url); const __filename = __typescriptFileURLToPath(import.meta.url); const __dirname = __typescriptDirname(__filename);",
  },
});

await mkdir("schemas", { recursive: true });
await copyFile(
  "node_modules/@adversarylabs/sdk/schemas/adversary.review.v1.schema.json",
  "schemas/adversary.review.v1.schema.json",
);
