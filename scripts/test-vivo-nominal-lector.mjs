import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as calculo from "../lib/vivoCalculo.mjs";
import * as nominal from "../lib/vivoNominal.mjs";
import * as zoomPresentes from "../lib/zoomPresentes.mjs";

// Lector de «Lista en vivo» (lib/servidor/leerVivoNominal.ts) con Supabase simulado. TOC-153 paso 2: el registrant_id de
// zoom_live_log (vista v_asist_zoom_live_panel) se cruza con zoom_registrantes POR ID (sin fecha_sesion), solo para los ids vistos en los eventos del dia.
// Datos 100 % sinteticos.
async function compilar(ruta, require) {
  const src = await readFile(new URL(ruta, import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require, console, Date, Promise, Map, Set, Number, Math, JSON, String, Boolean, setTimeout, clearTimeout }, {});
  return exports;
}

const SAB = "2026-10-03";
const COT = (hhmm) => Date.parse(`${SAB}T${hhmm}:00-05:00`);
const tablas = {
  asist_semanas: [{ semana: "2026-09-28" }],
  asist_franjas: [{ slot_id: "s8", dia: "sábado", fecha: SAB, hora_inicio: 8, hora_fin: 10, tipo: "Basico", cuenta_zoom: "comunicaciones", roster_n: 2 }],
  asist_roster: [{ persona_id: "0004001", correo_norm: "roster1@ejemplo.test", nombre: "Persona Demo 01", ciudad: "Cali", slot_id: "s8" }],
  zoom_reuniones_activas: [{ uuid: "u1", host: "comunicaciones", topic: "Backend: APIs y Base de Datos", activo: true }],
  v_asist_zoom_live_panel: [
    { id: 1, evento: "joined", correo: "alias@ejemplo.test", nombre: "Alias", hora_ms: COT("08:01"), uuid: "u1", curso: "Backend: APIs y Base de Datos", registrant_id: "RID-1" },
    { id: 2, evento: "joined", correo: "viejo@ejemplo.test", nombre: "Viejo", hora_ms: COT("08:02"), uuid: "u1", curso: "Backend: APIs y Base de Datos", registrant_id: null },
  ],
  // fecha_sesion de otro dia: el cruce por id no depende de ella
  v_asist_registrantes_panel: [],
  zoom_registrantes: [{ registrant_id: "RID-1", correo_norm: "reg@ejemplo.test", cedula_digitos: "4001", nombre: "Reg", apellido: "Demo", fecha_sesion: "2026-09-19" },
    { registrant_id: "RID-OTRO", correo_norm: "otro@ejemplo.test", cedula_digitos: "4999", nombre: "Otro", apellido: "Demo", fecha_sesion: SAB }],
};
const log = [];
let fallaPorId = false;
const sb = { from: (t) => {
  const q = { filtros: [], cols: "" };
  const api = {
    select: (c) => { q.cols = c; return api; }, eq: (c, v) => (q.filtros.push([c, v]), api), in: (c, v) => (q.filtros.push([c, v]), api),
    gt: (c, v) => (q.filtros.push([c, v]), api), gte: () => api, or: () => api, order: () => api, limit: () => api,
    range: async () => {
      const porId = q.filtros.find((f) => f[0] === "registrant_id");
      log.push({ t, cols: q.cols, ids: porId?.[1] });
      if (porId && fallaPorId) return { data: null, error: { message: "boom" } };
      let rows = tablas[t] ?? [];
      for (const [c, val] of q.filtros) if (rows.length && c in rows[0] && c !== "id") rows = rows.filter((r) => (Array.isArray(val) ? val.includes(r[c]) : r[c] === val));
      const gt = q.filtros.find((f) => f[0] === "id")?.[1];
      if (gt != null) rows = rows.filter((r) => r.id > gt);
      return { data: rows, error: null };
    },
    then: (ok) => ok({ data: (tablas[t] ?? []).slice(0, 1), error: null }),
  };
  return api; } };
const lector = await compilar("../lib/servidor/leerVivoNominal.ts", (n) => {
  if (n === "server-only") return {};
  if (n.endsWith("/vivoCalculo.mjs")) return calculo;
  if (n.endsWith("/vivoNominal.mjs")) return nominal;
  if (n.endsWith("/zoomPresentes.mjs")) return zoomPresentes;
  if (n.endsWith("/zoomEnVivo")) return { presentesZoom: async () => ({ estado: "apagado", salas: null }) };
  if (n.endsWith("/supabase")) return { supabaseServidor: () => sb };
  throw new Error(`Import no previsto: ${n}`);
});

const r = await lector.leerListaVivo(COT("08:10"));
const ps = r.clases[0].personas;
const alias = ps.find((p) => p.correo === "alias@ejemplo.test");
assert.equal(alias.senal, "roster"); assert.equal(alias.como, "registro de Zoom (ID)"); assert.equal(alias.nombre, "Persona Demo 01");
assert.equal(ps.find((p) => p.correo === "viejo@ejemplo.test").como, "correo sin registro ni roster", "registrant_id null: igual que antes");
const evLog = log.find((x) => x.t === "v_asist_zoom_live_panel");
assert.match(evLog.cols, /registrant_id/, "se lee la columna nueva");
const porId = log.filter((x) => x.ids);
assert.equal(porId.length, 1); assert.deepEqual([...porId[0].ids], ["RID-1"], "solo los ids vistos en los eventos del dia");
assert.ok(!/fecha_sesion/.test(JSON.stringify(porId)), "sin filtro por fecha_sesion");

// id nuevo + fallo de la lectura por id: la lista sale igual (con aviso) y el id se reintenta despues
lector.vaciarCacheListaVivo(); log.length = 0; fallaPorId = true;
const r2 = await lector.leerListaVivo(COT("08:11"));
assert.equal(r2.clases[0].personas.find((p) => p.correo === "alias@ejemplo.test").senal, "no_identificado");
assert.match(r2.aviso_general, /registro de Zoom por ID/);
fallaPorId = false;
const r3 = await lector.leerListaVivo(COT("08:12"));
assert.equal(r3.clases[0].personas.find((p) => p.correo === "alias@ejemplo.test").senal, "roster", "reintento tras el fallo");
console.log("test-vivo-nominal-lector: OK");
