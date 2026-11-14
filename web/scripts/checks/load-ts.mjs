/** Load a real module from src/ so a check can run it (D43-a).
 *
 *  Each file is transpiled with the project's own TypeScript, and its
 *  `@/…` imports are followed the same way, so a check runs exactly the code
 *  the app runs — nothing is copied into the check. Type-only imports vanish
 *  in transpiling. Meant for plain logic modules: anything that pulls in
 *  React or Next will not load here, and should not need to.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import { SRC } from "./lib.mjs";

const urls = new Map();

function moduleUrl(relative) {
  if (urls.has(relative)) return urls.get(relative);
  const file = join(SRC, /\.(ts|tsx)$/.test(relative) ? relative : `${relative}.ts`);
  let js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  js = js.replace(/from\s+"@\/([^"]+)"/g, (_, path) => `from "${moduleUrl(path)}"`);
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  urls.set(relative, url);
  return url;
}

export function loadTs(relative) {
  return import(moduleUrl(relative));
}
