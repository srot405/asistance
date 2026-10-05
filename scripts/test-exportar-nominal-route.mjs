import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { construirCsvNominal, construirCsvPresencia } from "../lib/exportarNominal.mjs";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const llamadas = [];
const llamadasPresencia = [];
const filasFixture = [{ nombre: "Beto Dos", ciudad: "Bogotá", slot_id: "martes", fecha: "2026-09-15" }];
const filasPresenciaFixture = [{ nombre: "Ana Uno", ciudad: "Cali", estado: "presente", minutos: 118 }];
const source = await readFile(new URL("../app/api/exportar-nominal/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const exports = {};
const require = (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (request) => { const token = request.headers.get("authorization");
    return token === "Bearer fixture-token" ? { email: "test-only" } : NextResponse.json({ error: "No autorizado" }, { status: 401 }); } };
  if (name.endsWith("/leerDetalleSemana")) return {
    semanaTieneDetalle: async (s) => ["2026-09-14", "2026-09-21"].includes(s),
    listarAusentesNominal: async (semana, opts) => { llamadas.push({ semana, opts }); return filasFixture; },
  };
  if (name.endsWith("/leerPresenciaClase")) return {
    listarPresenciaNominal: async (semana, franja) => { llamadasPresencia.push({ semana, franja }); return filasPresenciaFixture; },
  };
  if (name.endsWith("/exportarNominal.mjs")) return { construirCsvNominal, construirCsvPresencia };
  throw new Error(`Import no previsto: ${name}`);
};
vm.runInNewContext(compiled, { exports, require, Response, URL, Request, console });

const denied = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-14"));
assert.equal(denied.status, 401);
assert.equal(llamadas.length, 0);

const headers = { Authorization: "Bearer fixture-token" };
const noDetalle = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-08-31", { headers }));
assert.equal(noDetalle.status, 400, "Solo semanal/Sin dato no tiene roster nominal que exportar");

const sinFecha = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-14&alcance=dia", { headers }));
assert.equal(sinFecha.status, 400);

const semana = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-14", { headers }));
assert.equal(semana.status, 200);
assert.equal(semana.headers.get("content-disposition"), 'attachment; filename="asistencia_2026-09-14_no_ingresaron_semana.csv"');
assert.match(await semana.text(), /Beto Dos/, "el CSV nominal SÍ lleva nombre a propósito (pedido de Samuel 2026-09-29)");

const dia = await exports.GET(new Request(
  "http://local/api/exportar-nominal?semana=2026-09-14&alcance=dia&fecha=2026-09-15&ciudad=Bogot%C3%A1", { headers }));
assert.equal(dia.status, 200);
assert.equal(dia.headers.get("content-disposition"), 'attachment; filename="asistencia_2026-09-14_no_ingresaron_dia.csv"');
assert.equal(llamadas.at(-1).opts.fecha, "2026-09-15");
assert.equal(llamadas.at(-1).opts.ciudad, "Bogotá");

// vista=presencia (TOC-91): mismo CSV nominal, reusado con la clasificación de presencia.
const sinFranja = await exports.GET(new Request(
  "http://local/api/exportar-nominal?semana=2026-09-14&vista=presencia", { headers }));
assert.equal(sinFranja.status, 400, "vista=presencia exige franja");

const presencia = await exports.GET(new Request(
  "http://local/api/exportar-nominal?semana=2026-09-14&vista=presencia&franja=backend-martes-18", { headers }));
assert.equal(presencia.status, 200);
assert.equal(presencia.headers.get("content-disposition"),
  'attachment; filename="asistencia_2026-09-14_backend-martes-18_presencia_clase.csv"');
assert.match(await presencia.text(), /Ana Uno/, "CSV de presencia también lleva nombre, detrás de exigirAcceso");
assert.equal(llamadasPresencia.at(-1).franja, "backend-martes-18");

console.log("RESUMEN: exportar_nominal=200_con_nombre auth=401_sin_token nivel_invalido=400 dia_sin_fecha=400 " +
  "presencia=200_con_nombre estado=verde");
