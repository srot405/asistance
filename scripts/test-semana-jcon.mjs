import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as j from "../lib/semanaJcon.mjs";
import * as roles from "../lib/rolesCalculo.mjs";
import * as csvSeguro from "../lib/csvSeguro.mjs";
import { DATOS_DEMO_JCON, HOY_DEMO_JCON } from "../lib/semanaJcon-demo.mjs";
import { construirCsv } from "../lib/exportar.mjs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render estatico de SemanaJcon (sin navegador). rolUi/auth/descargas son de cliente: se sustituyen por stubs (permiso nominal ON para
// comprobar que aun asi la PANTALLA no muestra nombres: los nombres solo viajan en el CSV).
const reqNode = createRequire(import.meta.url);
async function renderizar(rutaTsx, props, { html = false } = {}) {
  const src = await readFile(new URL(`../${rutaTsx}`, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  const require = (nm) => {
    if (nm.endsWith("/semanaJcon.mjs")) return j;
    if (nm.endsWith("/rolUi")) return { usePuedeNominal: () => ({ puede: true, rol: { nominal: "todo" } }), textoSinNominal: () => "", aplicarRolDemo: () => {} };
    if (nm.endsWith("/auth") || nm.endsWith("/descargas")) return {};
    return reqNode(nm);
  };
  vm.runInNewContext(js, { exports, require, console, URLSearchParams, Intl, Date, Map, Set });
  const out = renderToStaticMarkup(React.createElement(exports.default, props));
  return html ? out : out.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

// TOC-208 fase 2: JC-ON en la pestana «Semana», SEPARADO de JC. Datos 100 % sinteticos (cedulas 30000000NN / 4000000NN).
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };

async function compilar(ruta, require) {
  const src = await readFile(new URL(ruta, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require, console, Date, Promise, Map, Set, Number, Math, JSON, String, Boolean, Response, URL, Request, setTimeout, clearTimeout }, {});
  return exports;
}

// ---------- 1) Semana tipo «semana»: viernes = V, sabado = S. Casos V/A/N/R/R?/P y colados en ambos sentidos.
const est = (id, horario, estado = "activo", ciudad = "CAL") => ({ id, cohorte_jcon: "2026", cedula: String(4000000000 + id), nombres: "Persona", apellidos: `P${id}`,
  horario, estado, grupo_ciudad: ciudad });
const ESTUDIANTES = [est(1, "manana"), est(2, "manana"), est(3, "manana"), est(4, "manana", "activo", "MED"),
  est(5, "tarde"), est(6, "tarde"), est(7, "tarde", "activo", "MED"), est(8, "tarde", "retirado"), est(9, null)];
const CLASES = [
  { id: 10, cohorte_jcon: "2026", fecha: "2026-11-06", horario: "manana", tema: "Semana 1", tipo: "semana", numero_semana: 1 },
  { id: 11, cohorte_jcon: "2026", fecha: "2026-11-06", horario: "tarde", tema: "Semana 1", tipo: "semana", numero_semana: 1 },
  { id: 12, cohorte_jcon: "2026", fecha: "2026-11-07", horario: "tarde", tema: "Semana 1", tipo: "semana", numero_semana: 1 },
  { id: 13, cohorte_jcon: "2026", fecha: "2026-11-07", horario: "manana", tema: "Semana 1", tipo: "semana", numero_semana: 1 },
  { id: 99, cohorte_jcon: "2025", fecha: "2026-11-06", horario: "manana", tema: "Semana 1", tipo: "semana", numero_semana: 1 },
];
const A = (clase_id, estudiante_id, fuente) => ({ clase_id, estudiante_id, asistio: true, fuente });
const ASIST = [
  A(10, 1, "sheet-zoom"),                 // 1 (V): su sala el viernes
  A(13, 2, "sheet-zoom-visita"),          // 2 (V): solo la sala del sabado (colado V -> S)
  A(10, 4, "sheet-zoom"), A(13, 4, "sheet-zoom-visita"), // 4 (V): su sala y ademas la del otro grupo
  A(12, 5, "sheet-zoom"),                 // 5 (S): su sala
  A(11, 6, "sheet-zoom-visita"),          // 6 (S): solo la sala del viernes (colado S -> V)
  A(11, 8, "sheet-zoom-visita"),          // 8: retirado, no cuenta
  A(99, 3, "sheet-zoom"),                 // otra cohorte: no cuenta
];
const DATOS = { estudiantes: ESTUDIANTES, clases: CLASES, asistencia: ASIST };
const copia = structuredClone(DATOS);
const LUNES = "2026-11-02";
const codigos = (hoy, datos = DATOS) => {
  const b = j.construirBaseJcon(LUNES, datos, hoy);
  return { b, c: Object.fromEntries(b.roster.filas.map((p) => { const k = j.codigosPersona(b, p); return [p.id, [...b.columnas.map((c) => k.porColumna[c.id]), k.semana, k.tipo]]; })) };
};
{
  const { b, c } = codigos("2026-11-09");          // lunes siguiente: semana terminada
  eq(b.columnas.map((x) => [x.fecha, x.grupo, x.ocurrio]), [["2026-11-06", "V", true], ["2026-11-07", "S", true]], "una columna por sesion, con su grupo");
  eq(b.roster.filas.map((p) => p.id), [1, 2, 3, 4, 5, 6, 7], "retirado (8) y sin horario (9) fuera");
  eq(b.roster.retirados, 1); eq(b.roster.sinGrupo, 1);
  eq(c[1], ["V", "-", "SI", "horario"], "V en su sala");
  eq(c[2], ["A", "N", "SI", "colados"], "A el viernes y N el sabado (colado V->S)");
  eq(c[3], ["R", "-", "NO", null], "R definitivo con la semana terminada");
  eq(c[4], ["V", "N", "SI", "horario"], "su sala y colado: V + N");
  eq(c[5], ["-", "V", "SI", "horario"]);
  eq(c[6], ["N", "A", "SI", "colados"], "colado S->V");
  eq(c[7], ["-", "R", "NO", null]);
  eq(b.inconsistencias, { fuente: 0, horario: 0 });
  const r = j.calcularSemanaJcon(b);
  eq(r.columnas.map((x) => x.codigos), [{ V: 2, A: 1, N: 1, R: 1, "R?": 0, P: 0, "-": 2 }, { V: 1, A: 1, N: 2, R: 1, "R?": 0, P: 0, "-": 2 }]);
  eq(r.semanal, { SI: 5, NO: 2, "NO?": 0, P: 0 });
  eq([r.resumen.poblacion, r.resumen.asistieron, r.resumen.horario, r.resumen.colados, r.resumen.nunca], [7, 5, 3, 2, 2]);
  eq(r.porGrupo.map((g) => [g.grupo, g.roster, g.horario, g.colados, g.nunca]), [["V", 4, 2, 1, 1], ["S", 3, 1, 1, 1]]);
  eq([r.columnas[0].inscritas, r.columnas[0].horario, r.columnas[0].colados, r.columnas[0].poblacion], [4, 2, 1, 4], "dia: se cuenta en la clase DE LA PERSONA");
  const plano = JSON.stringify(r);
  for (const pii of ["Persona", "4000000001", "cedula", "nombre", "P1\""]) ok(!plano.includes(pii), `agregado sin PII: ${pii}`);
  eq(r.retirados_excluidos, 1);
  eq(r.ciudades, ["Cali", "Medellín"], "ciudad en nombre (CAL -> Cali)");
  const f = j.calcularSemanaJcon(b, { ciudad: "Medellín" });
  eq([f.roster, f.semanal.SI], [2, 1], "filtro por ciudad con el nombre (MED)");
  eq(j.calcularSemanaJcon(b, { grupo: "S" }).porGrupo.map((g) => g.grupo), ["S"]);
}
{ // semana abierta: R? / NO? (antes del domingo)
  const { c } = codigos("2026-11-08");
  eq(c[3], ["R?", "-", "NO?", null], "domingo: aun R? / NO?");
  eq(c[2][0], "A", "A no depende de que la semana termine");
}
{ // sabado sin datos aun (solo el viernes cargado): P; sesion del sabado sin fila en jcon.clases -> columna sintetica pendiente
  const datos = { ...DATOS, clases: CLASES.filter((k) => k.id === 10 || k.id === 11 || k.id === 99), asistencia: ASIST.filter((a) => a.clase_id === 10 || a.clase_id === 11) };
  const { b, c } = codigos("2026-11-06", datos);
  eq(b.columnas.map((x) => [x.fecha, x.grupo, x.ocurrio]), [["2026-11-06", "V", true], ["2026-11-07", "S", false]], "sabado sintetico pendiente");
  eq(c[1], ["V", "-", "SI", "horario"]);
  eq(c[2], ["R?", "-", "NO?", null], "viernes sin entrar: R? (podria entrar el sabado)");
  eq(c[5], ["-", "P", "P", null], "grupo S: su clase aun no ocurre -> P, no ausencia");
  eq(c[6], ["N", "P", "SI", "colados"], "S que ya se colo el viernes: semana SI aunque su sala siga P");
  const r = j.calcularSemanaJcon(b);
  eq([r.resumen.poblacion, r.resumen.pendientes, r.semanal.P], [5, 2, 2], "pendientes fuera del denominador (como en JC)");
  eq(r.columnas[1].en_curso, true);
  // un dia despues del domingo, con el sabado aun sin datos: sigue P (sin datos cargados), nunca R
  eq(codigos("2026-11-09", datos).c[5], ["-", "P", "P", null]);
}
eq(copia, DATOS, "el calculo no muta las filas de entrada");

// ---------- 2) Bienvenida: B1 martes = V, B2 jueves = S (dos filas por sesion, una por grupo)
{
  const sem = j.listarSemanasJcon(DATOS_DEMO_JCON.clases);
  eq(sem.map((o) => [o.clave, o.etiqueta, o.bienvenida]), [["jcon|2026-11-02", "2026-11-02 · JC-ON · Semana 1", false],
    ["jcon|2026-10-26", "2026-10-26 · JC-ON (Bienvenida)", true]]);
  eq(j.grupoDeSesion({ tipo: "bienvenida", tema: "Bienvenida B1", fecha: "2026-10-27" }), "V");
  eq(j.grupoDeSesion({ tipo: "bienvenida", tema: "Bienvenida B2", fecha: "2026-10-29" }), "S");
  const b = j.construirBaseJcon("2026-10-26", DATOS_DEMO_JCON, HOY_DEMO_JCON);
  const r = j.calcularSemanaJcon(b);
  eq(r.columnas.map((x) => [x.fecha, x.tema, x.grupo]), [["2026-10-27", "Bienvenida B1", "V"], ["2026-10-29", "Bienvenida B2", "S"]]);
  eq(r.porGrupo.map((g) => [g.grupo, g.roster, g.horario, g.colados, g.nunca]), [["V", 6, 3, 2, 1], ["S", 5, 3, 1, 1]], "18+18+2 / 25+6+5 en pequeño");
  eq(r.columnas[0].codigos, { V: 3, A: 2, N: 1, R: 1, "R?": 0, P: 0, "-": 4 }, "B1: el retirado colado no cuenta como N");
  eq(r.columnas[1].codigos, { V: 3, A: 1, N: 3, R: 1, "R?": 0, P: 0, "-": 3 });
  eq(r.semanal, { SI: 9, NO: 2, "NO?": 0, P: 0 });
  eq(r.retirados_excluidos, 1);
  const s1 = j.calcularSemanaJcon(j.construirBaseJcon("2026-11-02", DATOS_DEMO_JCON, HOY_DEMO_JCON));
  eq(s1.semanal, { SI: 4, NO: 0, "NO?": 2, P: 5 }, "semana 1 demo: viernes cargado, sabado P");
}
eq(j.nombreCiudadJcon("CTG"), "Cartagena"); ok(j.mismaCiudadJcon("BAQ", "barranquilla")); ok(!j.mismaCiudadJcon("BAQ", "Cali"));
ok(j.esClaveJcon("jcon|2026-11-02") && !j.esClaveJcon("2026-11-02|Backend")); eq(j.semanaDeClave("jcon|2026-11-02"), "2026-11-02"); eq(j.semanaDeClave("2026-11-02|Backend"), null);
eq(j.hoyCOT(Date.parse("2026-11-07T03:00:00Z")), "2026-11-06", "hoy en hora Colombia");

// ---------- 3) CSV nominal
{
  const b = j.construirBaseJcon(LUNES, DATOS, "2026-11-09");
  const filas = j.filasNominalJcon(b);
  eq(filas[0], ["nombre", "cedula", "ciudad", "grupo", "2026-11-06 Semana 1 (sala Grupo V (viernes))", "2026-11-07 Semana 1 (sala Grupo S (sábado))", "semana"]);
  eq(filas.length, 8);
  eq(filas.find((f) => f[1] === "4000000002"), ["Persona P2", "4000000002", "Cali", "Grupo V (viernes)", "A", "N", "SI"]);
  ok(!filas.some((f) => f[1] === "4000000008"), "retirado fuera del CSV");
  eq(j.filasNominalJcon(b, { ciudad: "Medellín" }).length, 3);
}

// ---------- 4) Lector: solo esquema jcon, cache 60 s, fallo no cacheado
function simular({ falla = false } = {}) {
  const log = [];
  const tablas = { estudiantes: ESTUDIANTES, clases: CLASES.filter((k) => k.cohorte_jcon === "2026"), asistencia: ASIST };
  const desde = (esquema) => (tabla) => {
    log.push(`${esquema ?? "public"}.${tabla}`);
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q,
      range: async (a) => (falla ? { data: null, error: new Error("caida") } : { data: a === 0 ? (tablas[tabla] ?? []) : [], error: null }) };
    return q;
  };
  return { sb: { from: desde(null), schema: (s) => ({ from: desde(s) }) }, log };
}
const requerir = (sim) => (nm) => {
  if (nm === "server-only") return {};
  if (nm.endsWith("/semanaJcon.mjs")) return j;
  if (nm.endsWith("/vivoJcon.mjs")) return { COHORTE_JCON: "2026" };
  if (nm.endsWith("/supabase")) return { supabaseServidor: () => sim.sb };
  throw new Error(`Import no previsto: ${nm}`);
};
{
  const sim = simular();
  const l = await compilar("../lib/servidor/leerSemanaJcon.ts", requerir(sim));
  const T = Date.parse("2026-11-09T15:00:00Z");
  const r = await l.leerSemanaJcon(LUNES, {}, T);
  eq(r.semanal, { SI: 5, NO: 2, "NO?": 0, P: 0 });
  ok(sim.log.every((t) => t.startsWith("jcon.")), "solo lee el esquema jcon, nunca asist_*");
  const lecturas = sim.log.length;
  await l.leerSemanaJcon(LUNES, {}, T + 30_000); await l.listarSemanasJconServidor(T + 59_000);
  eq(sim.log.length, lecturas, "cache de 60 s: sin lecturas nuevas");
  await l.leerSemanaJcon(LUNES, {}, T + 61_000);
  ok(sim.log.length > lecturas, "vencido el cache, vuelve a leer");
  eq(await l.leerSemanaJcon("2026-10-12", {}, T + 62_000), null, "semana sin JC-ON -> null");
  const nom = await l.filasNominalSemanaJcon(LUNES, { ciudad: "Cali" }, T + 62_000);
  eq(nom.length, 1 + 5);
  const simF = simular({ falla: true });
  const lf = await compilar("../lib/servidor/leerSemanaJcon.ts", requerir(simF));
  await assert.rejects(() => lf.leerSemanaJcon(LUNES, {}, T)); n += 1;
  const antes = simF.log.length;
  await assert.rejects(() => lf.leerSemanaJcon(LUNES, {}, T + 1)); n += 1;
  ok(simF.log.length > antes, "un fallo no se cachea");
}

// ---------- 5) Ruta /api/semana-jcon: acceso, agregados sin PII, CSV con permisos
class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const ACCESOS = { admin: roles.resolverAcceso({ modo: "estricto", rol: "admin" }), cali: roles.resolverAcceso({ modo: "estricto", rol: "monitor", ciudad: "Cali" }),
  sinrol: roles.resolverAcceso({ modo: "estricto", rol: "sin_rol" }) };
const descargas = [];
let falloLector = false;
async function ruta() {
  const b = (hoy) => j.construirBaseJcon(LUNES, DATOS, hoy);
  return compilar("../app/api/semana-jcon/route.ts", (nm) => {
    if (nm === "next/server") return { NextResponse };
    if (nm.endsWith("/demo.js")) return { MODO_DEMO: false };
    if (nm.endsWith("/csvSeguro.mjs")) return csvSeguro;
    if (nm.endsWith("/rolesCalculo.mjs")) return roles;
    if (nm.endsWith("/semanaJcon.mjs")) return j;
    if (nm.endsWith("/acceso")) return { exigirAcceso: async (req) => {
      const t = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
      return ACCESOS[t] ? { email: `${t}@tocaunavida.org`, acceso: ACCESOS[t] } : NextResponse.json({ error: "No autorizado" }, { status: 401 }); } };
    if (nm.endsWith("/auditoria")) return { registrarDescarga: async (_a, d) => { descargas.push(d); return true; } };
    if (nm.endsWith("/leerSemanaJcon")) return {
      listarSemanasJconServidor: async () => { if (falloLector) throw new Error("x"); return j.listarSemanasJcon(CLASES); },
      leerSemanaJcon: async (s, f) => { if (falloLector) throw new Error("x"); return s === LUNES ? j.calcularSemanaJcon(b("2026-11-09"), f) : null; },
      filasNominalSemanaJcon: async (s, f) => (s === LUNES ? j.filasNominalJcon(b("2026-11-09"), f) : null) };
    throw new Error(`Import no previsto: ${nm}`);
  });
}
{
  const r = await ruta();
  const get = (q, tok) => r.GET(new Request(`http://local/api/semana-jcon${q}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }));
  eq((await get(`?semana=${LUNES}`)).status, 401, "sin token 401");
  const lista = await get("", "sinrol");
  eq((await lista.json()).semanas.map((o) => o.clave), ["jcon|2026-11-02"]);
  const ag = await get(`?semana=${LUNES}`, "sinrol");
  eq(ag.status, 200, "agregados abiertos a todo el dominio, como en JC");
  eq(ag.headers.get("cache-control"), "private, no-store");
  const txt = await ag.text();
  for (const pii of ["Persona", "4000000001", "\"cedula\"", "\"nombre\""]) ok(!txt.includes(pii), `agregado sin ${pii}`);
  eq((await get("?semana=2026-11-2", "admin")).status, 400);
  eq((await get("?semana=2026-10-12", "admin")).status, 404);
  eq((await get(`?semana=${LUNES}&formato=csv`, "sinrol")).status, 403, "sin rol: sin nominal");
  eq((await get(`?semana=${LUNES}&formato=csv&ciudad=Medellín`, "cali")).status, 403, "monitor pidiendo otra ciudad");
  const cali = await get(`?semana=${LUNES}&formato=csv`, "cali");
  eq(cali.status, 200);
  const filasCali = (await cali.text()).replace(/^﻿/, "").split("\r\n");
  eq(filasCali.length, 1 + 5, "monitor Cali: solo sus 5 personas (grupo_ciudad CAL)");
  ok(filasCali.slice(1).every((f) => f.includes("\"Cali\"")));
  const todo = await get(`?semana=${LUNES}&formato=csv`, "admin");
  eq((await todo.text()).split("\r\n").length, 1 + 7);
  eq(descargas.map((d) => [d.vista, d.ciudad, d.filas]), [["jcon-semana", "Cali", 5], ["jcon-semana", null, 7]], "cada CSV queda en panel_descargas");
  falloLector = true;
  eq((await get(`?semana=${LUNES}`, "admin")).status, 503, "JC-ON caido -> 503 (JC no pasa por aqui)");
  eq((await get("", "admin")).status, 503);
  falloLector = false;
}

// ---------- 6) JC NO cambia: aislamiento de modulos + /api/datos y el CSV de JC identicos con y sin JC-ON
{
  const PROHIBIDO = /semanaJcon|leerSemanaJcon|semana-jcon/;
  const revisar = async (dir) => {
    for (const e of await readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
      const ruta = `${dir}${e.name}${e.isDirectory() ? "/" : ""}`;
      if (e.isDirectory()) { if (e.name !== "semana-jcon") await revisar(ruta); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name) || /semanaJcon|leerSemanaJcon/.test(e.name) || e.name.endsWith(".d.mts")) continue;
      if (["Dashboard.tsx", "SemanaJcon.tsx"].includes(e.name)) continue;
      ok(!PROHIBIDO.test(await readFile(new URL(ruta, import.meta.url), "utf8")), `${ruta} no conoce JC-ON (Semana)`);
    }
  };
  await revisar("../app/api/"); await revisar("../lib/"); await revisar("../components/");
  // Dashboard: la clave JC-ON jamas coincide con una de JC y data.resultados no se toca.
  const dash = await readFile(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
  ok(!/setData\([^)]*[Jj]con/.test(dash) && !/resultados\.(push|concat|splice)/.test(dash), "Dashboard no agrega JC-ON a data.resultados");

  const fixture = { resultados: [{ semana: "2026-11-02", materia: "Backend", nivel: "Detalle", poblacion: 700, asistieron: 500, nunca: 200,
    porcentaje_retencion: 71.43, porcentaje_nunca: 28.57, clases_capturadas: 14, clases_programadas: 14, porcentaje_cobertura: 100 }], nunca_periodo: 40 };
  const datosRuta = await compilar("../app/api/datos/route.ts", (nm) => {
    if (nm === "next/server") return { NextResponse };
    if (nm.endsWith("/demo.js")) return { MODO_DEMO: false };
    if (nm.endsWith("/acceso")) return { exigirAcceso: async () => ({ email: "x", acceso: ACCESOS.admin }) };
    if (nm.endsWith("/leerHistorico")) return { leerHistorico: async () => structuredClone(fixture), aplicarResumenVivo: async (d) => d };
    if (nm.endsWith("/leerPoblacion")) return { leerPoblacion: async () => null };
    throw new Error(`Import no previsto en /api/datos: ${nm}`);
  });
  const pedir = async () => (await datosRuta.GET(new Request("http://local/api/datos", { headers: { Authorization: "Bearer t" } }))).json();
  const csvJc = () => construirCsv(structuredClone(fixture.resultados), "Resumen");
  const sinJcon = [await pedir(), csvJc()];
  // «con JC-ON»: se calcula todo JC-ON (semanas, agregados y nominal) en el mismo proceso y se vuelve a pedir lo de JC.
  const r = await ruta();
  await r.GET(new Request("http://local/api/semana-jcon", { headers: { Authorization: "Bearer admin" } }));
  await r.GET(new Request(`http://local/api/semana-jcon?semana=${LUNES}`, { headers: { Authorization: "Bearer admin" } }));
  await r.GET(new Request(`http://local/api/semana-jcon?semana=${LUNES}&formato=csv`, { headers: { Authorization: "Bearer admin" } }));
  j.calcularSemanaJcon(j.construirBaseJcon("2026-10-26", DATOS_DEMO_JCON, HOY_DEMO_JCON));
  const conJcon = [await pedir(), csvJc()];
  eq(conJcon, sinJcon, "data.resultados y el CSV de JC identicos con y sin JC-ON");
  ok(!JSON.stringify(conJcon).includes("JC-ON") && !JSON.stringify(conJcon).includes("jcon"), "ni una huella de JC-ON en lo de JC");
}

// ---------- 7) Render: mismo diseno (clases de JC), sin tarjetas de datos que JC-ON no tiene, sin PII
{
  const datos = j.calcularSemanaJcon(j.construirBaseJcon("2026-10-26", DATOS_DEMO_JCON, HOY_DEMO_JCON));
  const props = { semana: "2026-10-26", etiqueta: "2026-10-26 · JC-ON (Bienvenida)", modo: "demo", datosIniciales: datos };
  const html = await renderizar("components/SemanaJcon.tsx", props, { html: true });
  const txt = await renderizar("components/SemanaJcon.tsx", props);
  for (const cls of ["historical-hero", "metric-card retained", "metric-card absent", "calendar-panel", "calendar-grid", "seg-grupo", "vivo-programa"])
    ok(html.includes(cls), `usa la clase de JC ${cls}`);
  ok(txt.includes("JC-ON") && txt.includes("(Bienvenida)"));
  for (const no of ["Tiempo en clase", "Zoom limit: la sala", "Base del denominador", "Captura:", "Nunca ingresaron en el período"]) ok(!txt.includes(no), `oculta: ${no}`);
  ok(!txt.includes("Egresada Demo") && !txt.includes("3000000001"), "pantalla sin nombres ni cedulas");
  ok(/data-codigo="R"/.test(html) && /data-codigo="N"/.test(html) && /data-codigo="A"/.test(html), "chips de codigos con color");
  ok(txt.includes("Ingresaron") && txt.includes("9 de 11"), "hero: 9 de 11 medibles ingresaron");
  const abierta = await renderizar("components/SemanaJcon.tsx", { ...props, semana: "2026-11-02", datosIniciales:
    j.calcularSemanaJcon(j.construirBaseJcon("2026-11-02", DATOS_DEMO_JCON, HOY_DEMO_JCON)) });
  ok(abierta.includes("Semana abierta") && abierta.includes("pendiente"), "semana abierta: aviso y sabado pendiente");
}

console.log(`RESUMEN: semana-jcon ${n} verificaciones · codigos V/A/N/R/R?/P/- · Bienvenida · colados ambos sentidos · retirado fuera · SI/NO/NO?/P · ` +
  "lector solo jcon + cache · ruta con permisos · JC identico con y sin JC-ON · render sin PII · estado=verde");
