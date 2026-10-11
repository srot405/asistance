// Verificacion de SOLO LECTURA (fase 1.1 plan veracidad): para cada semana nivel "Detalle", compara la cifra del ETL
// (asist_semana_resumen) contra calcularDetalleSemana(...).resumen sin filtros (la misma del calendario). Sin PII en la salida.
// Uso: node scripts/test-hero-verificar.mjs [semana]
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as detalle from "../lib/detalleCalculo.mjs";
import { readFileSync } from "node:fs";
import { construirBase, calcularDetalleSemana, clasificar } from "../lib/detalleCalculo.mjs";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sb = createClient(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function tabla(nombre, columnas, semana, orden) {
  const salida = [];
  for (let desde = 0; ; desde += 1000) {
    let q = sb.from(nombre).select(columnas).eq("semana", semana);
    for (const c of orden) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(desde, desde + 999);
    if (error) throw error;
    salida.push(...data);
    if (data.length < 1000) return salida;
  }
}
const { data: filas, error } = await sb.from("asist_semana_resumen").select("semana,nivel,poblacion,asistieron,nunca,porcentaje_retencion,cuadre")
  .eq("nivel", "Detalle").order("semana");
if (error) throw error;
const pedida = process.argv[2];
// Ruta real del hero: leerHistorico.ts::aplicarResumenVivo transpilado, con cargarBase = lectura de solo lectura de arriba.
const cargarBase = async (semana) => {
  const [roster, franjas, sesiones, entradas, celdas] = await Promise.all([
    tabla("asist_roster", "persona_id,nombre,ciudad,slot_id,correo_norm", semana, ["persona_id"]),
    tabla("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto,hora_inicio,hora_fin", semana, ["slot_id"]),
    tabla("asist_sesiones", "sesion_id,slot_id,fecha,entradas_totales,estado_captura", semana, ["sesion_id"]),
    tabla("asist_entradas", "persona_id,sesion_id", semana, ["persona_id", "sesion_id"]),
    tabla("asist_celda_semana", "persona_id,estado", semana, ["persona_id"]),
  ]);
  return construirBase(roster, franjas, sesiones, entradas, celdas);
};
const modHist = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/servidor/leerHistorico.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: modHist, console, Date, Promise, Map, Set,
  require: (n) => n === "server-only" ? {} : n.endsWith("/demo.js") ? { MODO_DEMO: false } : n.endsWith("/historico-demo.mjs") ? {}
    : n.endsWith("/supabase") ? { supabaseServidor: () => sb } : n.endsWith("/detalleCalculo.mjs") ? detalle
    : n.endsWith("/leerDetalleSemana") ? { cargarBase } : (() => { throw new Error(n); })() });
const hero = new Map((await modHist.aplicarResumenVivo(await modHist.leerHistorico())).resultados.map((f) => [f.semana, f]));
for (const f of filas.filter((x) => !pedida || x.semana === pedida)) {
  const [roster, franjas, sesiones, entradas, celdas] = await Promise.all([
    tabla("asist_roster", "persona_id,nombre,ciudad,slot_id,correo_norm", f.semana, ["persona_id"]),
    tabla("asist_franjas", "slot_id,fecha,cuenta_zoom,horario_texto,hora_inicio,hora_fin", f.semana, ["slot_id"]),
    tabla("asist_sesiones", "sesion_id,slot_id,fecha,entradas_totales,estado_captura", f.semana, ["sesion_id"]),
    tabla("asist_entradas", "persona_id,sesion_id", f.semana, ["persona_id", "sesion_id"]),
    tabla("asist_celda_semana", "persona_id,estado", f.semana, ["persona_id"]),
  ]);
  const base = construirBase(roster, franjas, sesiones, entradas, celdas);
  const r = calcularDetalleSemana(f.semana, base).resumen;
  const cuadre = { roster: roster.length, medible: 0, pendiente: 0, sin_dato: 0, sin_clase: 0 };
  for (const p of roster) cuadre[clasificar(p, base)] += 1;
  console.log(`${f.semana} filas(roster=${roster.length} entradas=${entradas.length}) ETL=${f.asistieron}/${f.poblacion} (${f.porcentaje_retencion}) ` +
    `VIVO=${r.asistieron}/${r.poblacion} (${r.porcentaje_retencion}) cuadreETL=${JSON.stringify(f.cuadre)} cuadreVivo=${JSON.stringify(cuadre)}`);
  const h = hero.get(f.semana);
  const igual = h.resumen_fuente === "vivo" && h.asistieron === r.asistieron && h.poblacion === r.poblacion && h.porcentaje_retencion === r.porcentaje_retencion
    && h.cuadre.medibles === cuadre.medible && h.cuadre.pendientes === cuadre.pendiente;
  console.log(`  HERO=${h.asistieron}/${h.poblacion} (${h.porcentaje_retencion}) fuente=${h.resumen_fuente} etl=${h.asistieron_etl}/${h.poblacion_etl} -> ${igual ? "IGUAL al calendario" : "DIFIERE"}`);
  if (!igual) process.exitCode = 1;
}
