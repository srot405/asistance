import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { construirCsvNominal, construirCsvPresencia, construirCsvTiempo } from "../lib/exportarNominal.mjs";
import { construirCsvReporte, construirReporteSemana } from "../lib/reporteSemana.mjs";
import { construirBase } from "../lib/detalleCalculo.mjs";
import * as roles from "../lib/rolesCalculo.mjs";

class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init,
    headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const llamadas = [];
const llamadasPresencia = [];
const llamadasTiempo = [];
const filasTiempoFixture = [
  { nombre: "Ana Uno", ciudad: "Cali", franja: "martes", franja_tiempo: "martes", es_visita: false, fecha: "2026-09-15", pct_tiempo: 49.9,
    estado_tiempo: "rojo_tiempo", cumple_50: false, minutos: 59.9, motivo_sin_dato: null, definitivo: true },
  { nombre: "=cmd|x", ciudad: "Cali", franja: "martes", franja_tiempo: "jueves", es_visita: true, fecha: "2026-09-17", pct_tiempo: 50,
    estado_tiempo: "cumple", cumple_50: true, minutos: 60, motivo_sin_dato: null, definitivo: true }];
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
    return token === "Bearer fixture-token" ? { email: "test-only@ejemplo.test", acceso: { modo: "compatibilidad", rol: null, ciudad: null, nominal: "todo" } } : NextResponse.json({ error: "No autorizado" }, { status: 401 }); } };
  if (name.endsWith("/leerDetalleSemana")) return {
    semanaTieneDetalle: async (s) => { if (s === "2026-01-01") throw new Error("red caida: secreto-interno");
      return ["2026-09-14", "2026-09-21", "2026-09-28"].includes(s); },
    // Semanas: 08-31 "Solo semanal"; 10-05 "Detalle" sin roster; 10-12 sin fila de resumen y SIN roster; 10-19 con roster congelado
    // pero SIN resumen (semana en curso); 01-01 simula caida de red.
    nivelSemana: async (s) => { if (s === "2026-01-01") throw new Error("red caida: secreto-interno");
      return { "2026-08-31": "Solo semanal", "2026-09-28": "Detalle", "2026-10-05": "Detalle" }[s] ?? null; },
    leerReporteSemana: async (s) => s === "2026-10-19" ? construirReporteSemana(s,
      construirBase([{ persona_id: "1", nombre: "=cmd|' /C calc'!A0", ciudad: "Cali", slot_id: "x-lunes" }],
        [{ slot_id: "x-lunes", fecha: "2026-10-19", cuenta_zoom: "z" }],
        [{ sesion_id: "s1", slot_id: "x-lunes", fecha: "2026-10-19", entradas_totales: 1, estado_captura: "capturada" }],
        [{ persona_id: "1", sesion_id: "s1" }], [{ persona_id: "1", estado: "SI" }]), null) :
      s === "2026-09-28" ? { semana: s, completa: false, hayRevision: true, nivel: "Detalle", cuadra: true,
      cuadre: { roster: 1, medible: 0, fueraDato: 1, pendiente: 0, sinClase: 0 },
      sinDato: [{ fecha: "2026-10-03", franja: "backend-sábado-08-avanzado", estado: "zoom_limit_pendiente", motivo: "Zoom limit", personas: 1 }],
      filas: [{ nombre: "Ñandú, Ana", ciudad: "Cali", franja: "backend-sábado-08-avanzado", fecha: "2026-10-03", semanal: "ZL", dia: "ZL" }] } : null,
    listarAusentesNominal: async (semana, opts) => { llamadas.push({ semana, opts }); return filasFixture; },
  };
  if (name.endsWith("/leerPresenciaClase")) return {
    listarPresenciaNominal: async (semana, franja) => { llamadasPresencia.push({ semana, franja }); return filasPresenciaFixture; },
  };
  if (name.endsWith("/leerTiempo")) return { listarTiempoNominal: async (semana, filtro) => { llamadasTiempo.push({ semana, filtro }); return filasTiempoFixture; } };
  if (name.endsWith("/reporteSemana.mjs")) return { construirCsvReporte };
  if (name.endsWith("/exportarNominal.mjs")) return { construirCsvNominal, construirCsvPresencia, construirCsvTiempo };
  if (name.endsWith("/rolesCalculo.mjs")) return roles;
  if (name.endsWith("/auditoria")) return { registrarDescarga: async () => true };
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

// Bajo 2: la franja va al filename -> comilla, salto de linea, barra o espacio = 400 y NO se lee nada
const antesPresencia = llamadasPresencia.length;
for (const mala of ['x"y', "x%0D%0Ainjected", "x%0Ay", "a/b", "a%20b", "..%2F..", "x;y"]) {
  const r = await exports.GET(new Request(`http://local/api/exportar-nominal?semana=2026-09-14&vista=presencia&franja=${mala}`, { headers }));
  assert.equal(r.status, 400, `franja ${mala} rechazada`);
  assert.equal(r.headers.get("content-disposition"), null);
}
assert.equal(llamadasPresencia.length, antesPresencia, "una franja invalida no llega al lector");
const conTilde = await exports.GET(new Request(
  `http://local/api/exportar-nominal?semana=2026-09-14&vista=presencia&franja=${encodeURIComponent("backend-sábado-08-uno")}`, { headers }));
assert.equal(conTilde.status, 200, "los ids reales con tilde siguen validos");

const rep = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-28&vista=reporte", { headers }));
assert.equal(rep.status, 200);
assert.equal(rep.headers.get("content-disposition"), 'attachment; filename="asistencia_2026-09-28_reporte_captura_incompleta.csv"');
const repBytes = new Uint8Array(await rep.clone().arrayBuffer());
assert.deepEqual([...repBytes.slice(0, 3)], [0xEF, 0xBB, 0xBF], "BOM UTF-8 en los bytes");
const repTxt = await rep.text();
assert.match(repTxt, /captura incompleta/);
assert.match(repTxt, /"Ñandú, Ana"/);
const repSinRoster = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-10-05&vista=reporte", { headers }));
assert.equal(repSinRoster.status, 404, "semana sin congelar: mensaje claro, no 500");
assert.match((await repSinRoster.json()).error, /roster congelado/);
assert.equal((await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-28&vista=reporte"))).status, 401);

// Reporte basado en roster congelado, no en asist_semana_resumen (3 casos + red caida).
const sinResumen = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-10-19&vista=reporte", { headers }));
assert.equal(sinResumen.status, 200, "roster congelado sin fila de resumen: se sirve el reporte");
const sinResumenTxt = await sinResumen.text();
assert.match(sinResumenTxt, /resumen no generado/);
assert.match(sinResumenTxt, /"'=cmd\|/, "formula neutralizada en el CSV servido");
const sinRosterSinResumen = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-10-12&vista=reporte", { headers }));
assert.equal(sinRosterSinResumen.status, 404);
assert.match((await sinRosterSinResumen.json()).error, /roster congelado/, "ya no es el 400 enganoso de 'nivel distinto de Detalle'");
const soloSemanal = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-08-31&vista=reporte", { headers }));
assert.equal(soloSemanal.status, 400);
assert.match((await soloSemanal.json()).error, /Solo semanal/);
// vista=tiempo (TOC-140): CSV nominal autenticado, una fila por persona-sesion, visita con es_visita=SI.
assert.equal((await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-14&vista=tiempo"))).status, 401, "vista=tiempo exige auth");
assert.equal(llamadasTiempo.length, 0, "sin Bearer no se llama al lector nominal");
const tNoDetalle = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-08-31&vista=tiempo", { headers }));
assert.equal(tNoDetalle.status, 400);
const tiempo = await exports.GET(new Request("http://local/api/exportar-nominal?semana=2026-09-14&vista=tiempo&ciudad=Cali&cuenta=soporte", { headers }));
assert.equal(tiempo.status, 200);
assert.equal(tiempo.headers.get("content-disposition"), 'attachment; filename="asistencia_2026-09-14_tiempo.csv"');
assert.equal(tiempo.headers.get("cache-control"), "private, no-store");
assert.equal(JSON.stringify(llamadasTiempo.at(-1)), JSON.stringify({ semana: "2026-09-14", filtro: { ciudad: "Cali", franja: null, cuenta: "soporte" } }));
const bytes = new Uint8Array(await tiempo.clone().arrayBuffer());
assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM UTF-8 en el archivo");
const tiempoCsv = await tiempo.text();
assert.match(tiempoCsv, /^"nombre","ciudad","franja","franja_tiempo","es_visita","fecha","pct_tiempo","estado_tiempo","cumple_50","minutos","motivo_sin_dato","definitivo"\r\n/);
assert.match(tiempoCsv, /"Ana Uno","Cali","martes","martes","NO","2026-09-15","49.9","rojo_tiempo","NO","59.9","","SI"/);
assert.match(tiempoCsv, /"'=cmd\|x","Cali","martes","jueves","SI","2026-09-17","50","cumple","SI"/, "visita = SI y formula neutralizada");
for (const url of ["vista=reporte", "vista=ausentes", "vista=presencia&franja=x", "vista=tiempo"]) {
  const caida = await exports.GET(new Request(`http://local/api/exportar-nominal?semana=2026-01-01&${url}`, { headers }));
  assert.equal(caida.status, 503, `${url}: red caida -> 503 JSON`);
  assert.deepEqual(await caida.json(), { error: "No disponible" });
}

console.log("RESUMEN: exportar_nominal=200_con_nombre auth=401_sin_token nivel_invalido=400 dia_sin_fecha=400 " +
  "presencia=200_con_nombre estado=verde");
