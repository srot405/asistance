import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const lecturas = [];
const fixture = { resultados: [{ semana: "2026-09-14", materia: "Backend", nivel: "Detalle",
  poblacion: 726, asistieron: 541, nunca: 185 }], nunca_periodo: 53 };
const source = await readFile(new URL("../app/api/datos/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) =>
    request.headers.get("authorization") === "Bearer fixture-token" ? { email: "test-only" } :
      NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (name.endsWith("/leerHistorico")) return { leerHistorico: async () => { lecturas.push(true); return fixture; },
    aplicarResumenVivo: async (d) => d };
  // Poblacion en vivo (TOC-91, 2026-10-09): sin calculo aqui (null = se conserva el nunca_periodo del ETL).
  if (name.endsWith("/leerPoblacion")) return { leerPoblacion: async () => null };
  throw new Error(`Import no previsto: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });
const denied = await exports.GET(new Request("http://local/api/datos"));
assert.equal(denied.status, 401);
assert.equal(lecturas.length, 0);
const allowed = await exports.GET(new Request("http://local/api/datos", { headers: { Authorization: "Bearer fixture-token" } }));
assert.equal(allowed.status, 200);
assert.equal(allowed.headers.get("cache-control"), "private, no-store");
assert.deepEqual(JSON.parse(await allowed.text()), fixture);
const serialized = JSON.stringify(fixture);
for (const forbidden of ["nombre", "persona_id", "correo", "cedula", "participantes"])
  assert.equal(serialized.includes(`\"${forbidden}\"`), false, `respuesta agregada sin ${forbidden}`);
console.log("RESUMEN: datos=solo_agregados auth=401_sin_token cache=no-store pii=ausente estado=verde");
