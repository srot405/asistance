import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { construirCsv } from "../lib/exportar.mjs";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const calls = [];
const sample = { resultados: [{ semana: "2026-09-14", materia: "Backend", nivel: "Detalle",
  poblacion: 726, asistieron: 541, nunca: 185, porcentaje_retencion: 74.52,
  porcentaje_nunca: 25.48, clases_capturadas: 14, clases_programadas: 14,
  porcentaje_cobertura: 100 }] };
const source = await readFile(new URL("../app/api/exportar/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) => { const token = request.headers.get("authorization"); calls.push(token);
    return token === "Bearer fixture-token" ? { email: "test-only" } : NextResponse.json({ error: "No autorizado" }, { status: 401 }); } };
  if (name.endsWith("/leerHistorico")) return { leerHistorico: async () => sample, aplicarResumenVivo: async (d) => d };
  if (name.endsWith("/exportar.mjs")) return { construirCsv };
  throw new Error(`Import no previsto: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });
const denied = await exports.GET(new Request("http://local/api/exportar?semana=2026-09-14&vista=Resumen"));
assert.equal(denied.status, 401);
const headers = { Authorization: "Bearer fixture-token" };
const allowed = await exports.GET(new Request("http://local/api/exportar?semana=2026-09-14&materia=Backend&vista=Resumen", { headers }));
assert.equal(allowed.status, 200);
assert.equal(allowed.headers.get("content-disposition"), 'attachment; filename="asistencia_2026-09-14_resumen.csv"');
assert.doesNotMatch(await allowed.text(), /nombre|correo|cedula|persona/i);
const nominal = await exports.GET(new Request("http://local/api/exportar?semana=2026-09-14&vista=Asistencia%20por%20horario", { headers }));
assert.equal(nominal.status, 400);
assert.deepEqual(calls, [null, "Bearer fixture-token", "Bearer fixture-token"]);
console.log("RESUMEN: ruta_export=401_sin_token agregado=200 nominal=400 pii=ausente estado=verde");
