// Confianza por clase y estado del cuadre (TOC-151): calculo puro, lector (leerConfianza.ts), ruta y chips. Datos 100 % sinteticos.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { DETALLE_DEMO_BASE } from "../lib/detalle-demo.mjs";
import { CHIPS_CONFIANZA, armarConfianza, confianzaDeCaptura, cuadreSinteticoDemo } from "../lib/confianzaClase.mjs";
import * as confianzaLib from "../lib/confianzaClase.mjs";
import { renderizar } from "./render-componente.mjs";

// ---- 1) traduccion de estados: las 4 etiquetas del plan + los estados "aun sin dato" ----
assert.equal(confianzaDeCaptura("capturada"), "capturada");
assert.equal(confianzaDeCaptura("recuperada_csv"), "capturada"); assert.equal(confianzaDeCaptura("recuperada_api"), "capturada");
assert.equal(confianzaDeCaptura("zoom_limit_pendiente"), "zoom_limit");
assert.equal(confianzaDeCaptura("dudosa"), "dudosa"); assert.equal(confianzaDeCaptura("sin_captura"), "sin_captura");
assert.equal(confianzaDeCaptura("por_ocurrir"), "por_ocurrir"); assert.equal(confianzaDeCaptura("en_curso"), "en_curso");
assert.equal(confianzaDeCaptura("sin_clase"), "sin_clase");
assert.equal(confianzaDeCaptura("estado_de_una_migracion_futura"), "dudosa", "desconocido = dudoso, nunca capturado");
assert.equal(confianzaDeCaptura(undefined), "dudosa");
for (const c of Object.values(CHIPS_CONFIANZA)) assert.ok(c.icono && c.texto && c.ayuda.length > 10, "icono + texto + ayuda");

// ---- 2) armado por clase ----
const ses = (slot, estado, fecha = "2099-01-05", id = `${fecha}|${slot}`) => ({ sesion_id: id, slot_id: slot, fecha, estado_captura: estado });
const cu = (slot, estado, extra = {}) => ({ sesion_id: `2099-01-05|${slot}`, slot_id: slot, n_panel: 30, n_api: 30, n_webhook: 30, n_ok: 30,
  n_diferencias: 0, n_informativas: 0, estado, ...extra });
const sesiones = [ses("a", "capturada"), ses("b", "dudosa"), ses("c", "zoom_limit_pendiente"), ses("d", "sin_captura"), ses("e", "por_ocurrir"), ses("f", "recuperada_api")];
const r = armarConfianza({ semana: "2099-01-05", sesiones, cuadre: [cu("a", "ok"), cu("b", "con_diferencias", { n_diferencias: 3, n_informativas: 1 })] });
const por = Object.fromEntries(r.clases.map((c) => [c.slot_id, c]));
assert.deepEqual(r.clases.map((c) => c.confianza), ["capturada", "dudosa", "zoom_limit", "sin_captura", "por_ocurrir", "capturada"]);
assert.equal(por.a.cuadre.estado, "cuadrada"); assert.equal(por.b.cuadre.estado, "con_diferencias"); assert.equal(por.b.cuadre.n_diferencias, 3);
assert.equal(por.c.cuadre.estado, "sin_cuadre", "sin fila en asist_cuadre_clase: todavia sin cuadre");
assert.equal(r.cuadre_disponible, true);
assert.deepEqual(r.resumen, { clases: 6, capturadas: 2, cuadradas: 1, con_diferencias: 1, sin_cuadre: 4 });
assert.equal(r.resumen.cuadradas + r.resumen.con_diferencias + r.resumen.sin_cuadre, r.resumen.clases, "los tres estados de cuadre cuadran con las clases");

// varias sesiones en la misma franja: manda la peor; cualquier diferencia manda en el cuadre; n_api null si falta una fuente
const doble = armarConfianza({ semana: "x", sesiones: [ses("a", "capturada", "2099-01-05", "s1"), ses("a", "sin_captura", "2099-01-05", "s2")],
  cuadre: [cu("a", "ok", { sesion_id: "s1" }), cu("a", "con_diferencias", { sesion_id: "s2", n_diferencias: 2, n_api: null })] });
assert.equal(doble.clases.length, 1); assert.equal(doble.clases[0].confianza, "sin_captura"); assert.equal(doble.clases[0].estado_captura, "sin_captura");
assert.equal(doble.clases[0].cuadre.estado, "con_diferencias"); assert.equal(doble.clases[0].cuadre.n_api, null); assert.equal(doble.clases[0].cuadre.n_panel, 60);

// degradado: 084 sin aplicar (cuadre = null) -> la confianza funciona y el cuadre no se muestra ni se inventa
const sinCuadre = armarConfianza({ semana: "x", sesiones, cuadre: null });
assert.equal(sinCuadre.cuadre_disponible, false); assert.ok(sinCuadre.clases.every((c) => c.cuadre === null));
assert.equal(sinCuadre.clases.length, 6);
// solo agregados: nada de PII en la respuesta
assert.doesNotMatch(JSON.stringify(r), /nombre|persona_id|correo|cedula/);

// ---- 3) demo: las tres variantes de cuadre se ven con datos ----
for (const [semana, base] of Object.entries(DETALLE_DEMO_BASE)) {
  const d = armarConfianza({ semana, sesiones: base.sesiones, cuadre: cuadreSinteticoDemo(base.sesiones) });
  assert.ok(d.clases.length > 0 && d.clases.every((c) => c.confianza in CHIPS_CONFIANZA), semana);
  const capturadas = base.sesiones.filter((s) => s.estado_captura === "capturada").length;
  if (capturadas >= 3) assert.ok(d.resumen.cuadradas > 0 && d.resumen.con_diferencias > 0 && d.resumen.sin_cuadre > 0, `${semana}: demo con las 3 variantes`);
}

// ---- 4) lector: pagina, no pide PII, degrada sin 084 ----
const compilar = async (ruta) => ts.transpileModule(await readFile(new URL(ruta, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function cargarLector(datos, fallos = {}, modoDemo = false) {
  const consultas = [];
  const supabase = { supabaseServidor: () => ({ from: (tabla) => {
    const q = { tabla, columnas: "", filtros: [], rangos: [] };
    consultas.push(q);
    const c = { select: (cols) => { q.columnas = cols; return c; }, eq: (col, v) => { q.filtros.push([col, v]); return c; }, order: () => c,
      range: async (a, b) => { q.rangos.push([a, b]); if (fallos[tabla]) return { data: null, error: fallos[tabla] };
        return { data: (datos[tabla] ?? []).filter((f) => q.filtros.every(([col, v]) => f[col] === v)).slice(a, b + 1), error: null }; } };
    return c; } }) };
  const modulos = {};
  const req = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/demo.js")) return { MODO_DEMO: modoDemo };
    if (name.endsWith("/tiempo-demo.mjs")) return { TIEMPO_DEMO: {}, TIEMPO_DEMO_SERIE: [] };
    if (name.endsWith("/tiempoCalculo.mjs")) return {};
    if (name.endsWith("/rolesCalculo.mjs")) return { mismaCiudad: () => true };
    if (name.endsWith("/confianzaClase.mjs")) return confianzaLib;
    if (name.endsWith("/detalle-demo.mjs")) return { DETALLE_DEMO_BASE };
    if (name.endsWith("/supabase")) return supabase;
    if (name === "./leerTiempo") return modulos.tiempo;
    throw new Error(`Import no previsto: ${name}`);
  };
  const ejecutar = async (ruta) => { const exports = {}; vm.runInNewContext(await compilar(ruta), { exports, require: req, console, Date }); return exports; };
  modulos.tiempo = await ejecutar("../lib/servidor/leerTiempo.ts");
  return { lector: await ejecutar("../lib/servidor/leerConfianza.ts"), consultas };
}
const SEM = "2099-01-05";
const muchas = Array.from({ length: 1500 }, (_, i) => ({ semana: SEM, sesion_id: `s${i}`, slot_id: `slot-${i}`, fecha: SEM, estado_captura: "capturada" }));
{
  const { lector, consultas } = await cargarLector({ asist_sesiones: muchas, asist_cuadre_clase: [{ semana: SEM, ...cu("slot-0", "ok", { sesion_id: "s0" }) }] });
  const r1 = await lector.leerConfianzaSemana(SEM);
  assert.equal(r1.clases.length, 1500, "pagina: 1500 clases, no 1000");
  assert.equal(r1.clases.find((c) => c.slot_id === "slot-0").cuadre.estado, "cuadrada");
  const cols = consultas.map((c) => c.columnas).join(",");
  assert.doesNotMatch(cols, /nombre|persona_id|correo/, "no pide columnas de PII");
  assert.ok(!consultas.some((c) => c.tabla === "asist_cuadre_diferencia"), "la tabla de diferencias (PII) no se lee");
  assert.ok(consultas.every((c) => c.filtros.some(([col, v]) => col === "semana" && v === SEM)));
}
{
  const { lector } = await cargarLector({ asist_sesiones: muchas.slice(0, 3) }, { asist_cuadre_clase: { code: "PGRST205", message: "Could not find the table" } });
  const r2 = await lector.leerConfianzaSemana(SEM);
  assert.equal(r2.cuadre_disponible, false); assert.equal(r2.clases.length, 3);
  const { lector: roto } = await cargarLector({ asist_sesiones: muchas.slice(0, 3) }, { asist_cuadre_clase: { code: "XX000", message: "boom" } });
  await assert.rejects(() => roto.leerConfianzaSemana(SEM), "un error real no se disfraza de 'sin cuadre'");
  const { lector: sinSes } = await cargarLector({}, { asist_sesiones: { code: "XX000", message: "boom" } });
  await assert.rejects(() => sinSes.leerConfianzaSemana(SEM));
}
{
  const { lector, consultas } = await cargarLector({}, {}, true);
  const demo = await lector.leerConfianzaSemana("2026-09-14");
  assert.ok(demo.clases.length > 0 && consultas.length === 0, "el demo no consulta Supabase");
}

// ---- 5) ruta ----
class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
const rutaSrc = await compilar("../app/api/confianza/route.ts");
const rutaExports = {};
vm.runInNewContext(rutaSrc, { exports: rutaExports, Response, URL, Request, console, require: (name) => {
  if (name === "next/server") return { NextResponse };
  if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
  if (name.endsWith("/acceso")) return { exigirAcceso: async (req) => (req.headers.get("authorization") === "Bearer fixture-token" ? { email: "test-only" }
    : NextResponse.json({ error: "No autorizado" }, { status: 401 })) };
  if (name.endsWith("/leerDetalleSemana")) return { semanaTieneDetalle: async (s) => { if (s === "2026-01-01") throw new Error("secreto-interno"); return s === "2026-09-14" || s === "2026-09-28"; } };
  if (name.endsWith("/leerConfianza")) return { leerConfianzaSemana: async (s) => { if (s === "2026-09-28") throw new Error("postgres: secreto xyz"); return r; } };
  throw new Error(`Import no previsto: ${name}`);
} });
const url = (q) => `http://local/api/confianza?${q}`;
const auth = { Authorization: "Bearer fixture-token" };
assert.equal((await rutaExports.GET(new Request(url("semana=2026-09-14")))).status, 401);
assert.equal((await rutaExports.GET(new Request(url("semana=2026-09-14&demo=1")))).status, 401, "demo=1 sin MODO_DEMO exige auth");
assert.equal((await rutaExports.GET(new Request(url("semana=14-09"), { headers: auth }))).status, 400);
assert.equal((await rutaExports.GET(new Request(url("semana=2026-08-31"), { headers: auth }))).status, 400);
const caida = await rutaExports.GET(new Request(url("semana=2026-01-01"), { headers: auth }));
assert.equal(caida.status, 503); assert.equal(JSON.stringify(await caida.json()), JSON.stringify({ error: "No disponible" }));
const falla = await rutaExports.GET(new Request(url("semana=2026-09-28"), { headers: auth }));
assert.equal(falla.status, 503); assert.equal(JSON.stringify(await falla.json()), JSON.stringify({ error: "No disponible" }));
const ok = await rutaExports.GET(new Request(url("semana=2026-09-14"), { headers: auth }));
assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "private, no-store");
assert.equal((await ok.json()).clases.length, 6);

// ---- 6) chips en pantalla: texto + icono, con y sin cuadre; degradado sin lectura ----
const chips = await renderizar("components/ChipConfianza.tsx", { c: por.b });
assert.match(chips, /Dudosa/); assert.match(chips, /Con diferencias \(3 diferencias\)/);
assert.match(await renderizar("components/ChipConfianza.tsx", { c: por.a }), /Capturada[\s\S]*Cuadrada/);
assert.match(await renderizar("components/ChipConfianza.tsx", { c: por.c }), /Zoom limit[\s\S]*Sin cuadre/);
assert.match(await renderizar("components/ChipConfianza.tsx", { c: por.d }), /Sin captura/);
const solo = await renderizar("components/ChipConfianza.tsx", { c: sinCuadre.clases[0] });
assert.match(solo, /Capturada/); assert.doesNotMatch(solo, /Cuadrada|Sin cuadre|Con diferencias/, "sin 084 no se muestra cuadre");
assert.equal((await renderizar("components/ChipConfianza.tsx", { c: undefined })).trim(), "", "sin dato de confianza no se pinta nada");
const agr = { roster: 30, n_ingresaron: 20, n_medibles: 20, n_cumplen: 15, n_rojo: 5, n_sin_dato: 0, n_pendiente: 0, mediana: 70, p10: 30, p90: 95,
  cobertura: 1, nivel_cobertura: "ok", sin_medicion: false, sin_ingresos: false, muestra_pequena: false };
const clase = { ...agr, slot_id: "b", fecha: SEM, horario_texto: "Clase B", estado_captura: "dudosa", fin_clase_min: 90, fin_confiable: true, clase_evaluable: true, motivo_no_evaluable: null };
const conChip = await renderizar("components/TiempoTablaClases.tsx", { clases: [clase], dias: [], semana: agr, confianza: new Map([["b", por.b]]) });
assert.match(conChip, /Clase B[\s\S]*Dudosa[\s\S]*Con diferencias/, "la tabla por clase de Tiempo lleva los chips");
const sinChip = await renderizar("components/TiempoTablaClases.tsx", { clases: [clase], dias: [], semana: agr });
assert.doesNotMatch(sinChip, /Dudosa|Cuadrada|chip-conf/, "sin lectura de confianza la tabla queda como antes");

// las tres pestañas usan el mismo chip y no tocan el servidor
for (const f of ["components/CalendarioSemana.tsx", "components/Presencia.tsx", "components/Tiempo.tsx"]) {
  const src = await readFile(new URL(`../${f}`, import.meta.url), "utf8");
  assert.match(src, /useConfianzaSemana/, `${f} lee la confianza`); assert.doesNotMatch(src, /from "[^"]*(servidor|supabase)/, `${f} no importa el servidor`);
}
assert.match(await readFile(new URL("../components/TiempoTablaClases.tsx", import.meta.url), "utf8"), /ChipConfianza/);

console.log("RESUMEN: tests=confianza estados=7 cuadre=3_variantes degradado_sin_084=ok lector_pagina=1500 sin_pii=ok ruta=401/400/503/200 chips=ok estado=verde");
