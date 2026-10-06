import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Renderiza un componente .tsx a HTML estatico (sin navegador). Los imports a ../lib/*.mjs se resuelven con import() real.
const req = createRequire(import.meta.url);
export async function renderizar(rutaTsx, props) {
  const url = new URL(`../${rutaTsx}`, import.meta.url);
  const src = await readFile(url, "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mods = {};
  for (const m of js.matchAll(/require\("([^"]+\.mjs)"\)/g)) mods[m[1]] = await import(new URL(m[1], url).href);
  const exports = {};
  const require = (n) => mods[n] ?? (n.startsWith(".") ? {} : req(n));
  vm.runInNewContext(js, { exports, require, console });
  const html = renderToStaticMarkup(React.createElement(exports.default, props));
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&ldquo;|&rdquo;/g, "\"").replace(/\s+/g, " ").replace(/ ([·,.:])/g, " $1");
}
