import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { construirCsv } from "../lib/exportar.mjs";

class NextResponse extends Response {
  static json(body, init = {}) {
    return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  }
}
const calls = [];
const sample = {
  por_franja: [{ fecha: "2026-09-15", slot_id: "demo-1", roster: 3, entro: 2, aOtra: 1, falto: 0 }],
  franjas_con_clase: [{ slot_id: "demo-1" }, { slot_id: "demo-2" }],
  participantes: [{ nombre: "Prueba", franja: "demo-1", estado_semana: "SI", estado_por_franja: { "demo-1": "V", "demo-2": "A" } }],
};
const source = await readFile(new URL("../app/api/exportar/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) => {
    const token = request.headers.get("authorization"); calls.push(token);
    return token === "Bearer fixture-token" ? { email: "test-only" } : NextResponse.json({ error: "No autorizado" }, { status: 401 });
  } };
  if (name.endsWith("/leerSemana")) return { leerSemana: async () => sample };
  if (name.endsWith("/exportar.mjs")) return { construirCsv };
  throw new Error(`Import no previsto en prueba: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });
const GET = exports.GET;
const denied = await GET(new Request("http://local/api/exportar?semana=2026-09-14&vista=Resumen"));
assert.equal(denied.status, 401);
for (const [vista, header, filename] of [
  ["Resumen", '"fecha","franja","roster","entro","a_otra","falto"', "asistencia_2026-09-14_resumen.csv"],
  ["Asistencia por horario", '"nombre","franja","estado_semanal","demo-1","demo-2"', "asistencia_2026-09-14_asistencia_por_horario.csv"],
]) {
  const response = await GET(new Request(`http://local/api/exportar?semana=2026-09-14&vista=${encodeURIComponent(vista)}`, { headers: { Authorization: "Bearer fixture-token" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="${filename}"`);
  assert.ok((await response.text()).startsWith(header));
}
assert.equal(calls.length, 3);
assert.equal(calls[0], null);
assert.ok(calls.slice(1).every((token) => token === "Bearer fixture-token"));
console.log("RESUMEN: ruta_export=401_sin_token,2_vistas_con_bearer,headers_correctos,cache_no_store estado=verde (guard Supabase simulado; sin acceso a producción)");
