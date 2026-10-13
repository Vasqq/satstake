// The film draws ink with the app's own code: this turns app/src/design/ink.ts into a browser module, unchanged.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../app/package.json", import.meta.url));
const ts = require("typescript");
const src = readFileSync(new URL("../../app/src/design/ink.ts", import.meta.url), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
writeFileSync(new URL("../src/ink.gen.js", import.meta.url), "// Generated from app/src/design/ink.ts by tools/build-ink.mjs. Do not edit.\n" + out);
console.log("ink.gen.js written");
