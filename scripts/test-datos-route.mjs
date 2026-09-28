import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

class NextResponse extends Response {
  static json(body, init = {}) {
    return new NextResponse(JSON.stringify(body), { ...init,
      headers: { "Content-Type": "application/json", ...init.headers } });
  }
}
const lecturas = [];
const source = await readFile(new URL("../app/api/datos/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) =>
    request.headers.get("authorization") === "Bearer fixture-token"
      ? { email: "test-only" }
      : NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (name.endsWith("/leerSemana")) return { leerSemana: async (semana, detalle) => {
    lecturas.push({ semana, detalle }); return { semana, participantes: detalle ? [{ nombre: "Nombre ficticio" }] : [{}] };
  } };
  throw new Error(`Import no previsto en prueba: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });
const denied = await exports.GET(new Request("http://local/api/datos?semana=2026-09-14&detalle=1"));
assert.equal(denied.status, 401);
assert.equal(lecturas.length, 0, "sin autorización no se lee el detalle nominal");
const allowed = await exports.GET(new Request("http://local/api/datos?semana=2026-09-14&detalle=1", {
  headers: { Authorization: "Bearer fixture-token" },
}));
assert.equal(allowed.status, 200);
assert.deepEqual(lecturas, [{ semana: "2026-09-14", detalle: true }]);
assert.equal(allowed.headers.get("cache-control"), "private, no-store");
console.log("RESUMEN: datos_nombres=solo_despues_de_bearer cache=no-store estado=verde (guard simulado; sin producción)");
