// Fase 1.1 plan veracidad (2026-10-09): el hero de la pestaña Semana usa en semanas "Detalle" la MISMA cifra del calendario
// (calcularDetalleSemana(...).resumen sin filtros), calculada en el servidor con cache compartida; el ETL queda como *_etl.
// Sin red ni Supabase: leerHistorico.ts y la ruta se transpilan con dependencias simuladas. Uso: node scripts/test-hero-vivo.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as detalle from "../lib/detalleCalculo.mjs";
import { renderizar } from "./render-componente.mjs";

const compilar = async (ruta) => ts.transpileModule(await readFile(new URL(ruta, import.meta.url), "utf8"), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

// Base sintetica: 4 personas, 3 medibles (2 entraron), 1 pendiente. Sin PII real.
const base = () => detalle.construirBase(
  [{ persona_id: "a", nombre: "x", ciudad: "Cali", slot_id: "s1" }, { persona_id: "b", nombre: "x", ciudad: "Cali", slot_id: "s1" },
   { persona_id: "c", nombre: "x", ciudad: "Cali", slot_id: "s1" }, { persona_id: "d", nombre: "x", ciudad: "Cali", slot_id: "s1" }],
  [{ slot_id: "s1", fecha: "2026-10-06", cuenta_zoom: "z", horario_texto: "Lun" }],
  [{ sesion_id: "q1", slot_id: "s1", fecha: "2026-10-06", entradas_totales: 2 }],
  [{ persona_id: "a", sesion_id: "q1" }, { persona_id: "b", sesion_id: "q1" }],
  [{ persona_id: "a", estado: "SI" }, { persona_id: "b", estado: "SI" }, { persona_id: "c", estado: "NO" }, { persona_id: "d", estado: "P" }]);
const esperado = detalle.calcularDetalleSemana("2026-10-05", base()).resumen;

async function cargarModulo({ demo = false, falla = new Set() } = {}) {
  const llamadas = [];
  const exports = {};
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("/historico-demo.mjs")) return { HISTORICO_DEMO: { resultados: [], nunca_periodo: null } };
    if (name.endsWith("/demo.js")) return { MODO_DEMO: demo };
    if (name.endsWith("/supabase")) return { supabaseServidor: () => { throw new Error("sin red en el test"); } };
    if (name.endsWith("/detalleCalculo.mjs")) return detalle;
    if (name.endsWith("/leerDetalleSemana")) return { cargarBase: async (semana) => {
      llamadas.push(semana); if (falla.has(semana)) throw new Error("fallo simulado"); return base(); } };
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(await compilar("../lib/servidor/leerHistorico.ts"), { exports, require, console: { error() {} }, Date, Promise, Map, Set });
  return { m: exports, llamadas };
}
const fila = (semana, nivel, extra = {}) => ({ semana, materia: "Todas", nivel, poblacion: 3, asistieron: 1, nunca: 2,
  porcentaje_retencion: 33.33, porcentaje_nunca: 66.67, captura_completa: true, clases_capturadas: 1, clases_programadas: 1,
  cuadre: { roster: 4, medibles: 3, sin_dato: 0, pendientes: 1, sin_clase: 0 }, aviso: "", ...extra });
const datos = () => ({ resultados: [fila("2026-08-25", "Solo semanal"), fila("2026-09-28", "Detalle", { cerrada_en: "2026-10-04" }),
  fila("2026-10-05", "Detalle", { cerrada_en: null })], nunca_periodo: 5 });

// 1) Detalle -> cifra del calendario; ETL conservado; Solo semanal intacta; no muta la entrada.
{
  const { m, llamadas } = await cargarModulo();
  const entrada = datos();
  const salida = await m.aplicarResumenVivo(entrada);
  const [solo, cerrada, abierta] = salida.resultados;
  assert.deepEqual(solo, entrada.resultados[0], "Solo semanal sigue con el ETL");
  assert.equal(solo.resumen_fuente, undefined);
  for (const f of [cerrada, abierta]) {
    assert.equal(f.resumen_fuente, "vivo");
    assert.equal(f.asistieron, esperado.asistieron); assert.equal(f.poblacion, esperado.poblacion);
    assert.equal(f.porcentaje_retencion, esperado.porcentaje_retencion); assert.equal(f.nunca, esperado.nunca);
    assert.equal(f.asistieron_etl, 1); assert.equal(f.poblacion_etl, 3); assert.equal(f.porcentaje_retencion_etl, 33.33);
    assert.deepEqual({ ...f.cuadre }, { roster: 4, medibles: 3, sin_dato: 0, pendientes: 1, sin_clase: 0 });
    assert.equal(f.cuadre.roster, f.cuadre.medibles + f.cuadre.sin_dato + f.cuadre.pendientes + f.cuadre.sin_clase, "cuadre exacto");
    assert.ok(f.resumen_calculado_en);
  }
  assert.equal(entrada.resultados[2].asistieron, 1, "no muta la fila original");
  assert.deepEqual([...llamadas].sort(), ["2026-09-28", "2026-10-05"], "solo lee la base de semanas Detalle");
  await m.aplicarResumenVivo(datos());
  assert.equal(llamadas.length, 2, "cache: sin segunda lectura");
  m.vaciarCacheResumenVivo();
  await Promise.all([m.aplicarResumenVivo(datos()), m.aplicarResumenVivo(datos())]);
  assert.equal(llamadas.length, 4, "peticiones simultaneas comparten una sola lectura por semana");
  assert.ok(m.TTL_VIVO_ABIERTA_MS <= 5 * 60_000, "cache corta para semana abierta");
  const pii = JSON.stringify(salida);
  for (const k of ["nombre", "persona_id", "correo", "cedula"]) assert.equal(pii.includes(`"${k}"`), false, `sin ${k}`);
}
// 2) Si el calculo falla -> ETL marcado como tal, nunca una cifra inventada.
{
  const { m } = await cargarModulo({ falla: new Set(["2026-10-05"]) });
  const [, cerrada, abierta] = (await m.aplicarResumenVivo(datos())).resultados;
  assert.equal(cerrada.resumen_fuente, "vivo");
  assert.equal(abierta.resumen_fuente, "etl");
  assert.equal(abierta.asistieron, 1); assert.equal(abierta.poblacion, 3); assert.equal(abierta.asistieron_etl, 1);
}
// 3) MODO_DEMO: no recalcula ni lee nada.
{
  const { m, llamadas } = await cargarModulo({ demo: true });
  const entrada = datos();
  assert.equal(await m.aplicarResumenVivo(entrada), entrada);
  assert.equal(llamadas.length, 0);
}
// 4) Ruta /api/datos: aplica el vivo; si aplicarResumenVivo revienta, responde 200 con el ETL.
class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); }
}
async function ruta(aplicar) {
  const exports = {};
  const require = (name) => {
    if (name === "next/server") return { NextResponse };
    if (name.endsWith("/demo.js")) return { MODO_DEMO: false };
    if (name.endsWith("/acceso")) return { exigirAcceso: async () => ({ email: "test-only" }) };
    if (name.endsWith("/leerHistorico")) return { leerHistorico: async () => datos(), aplicarResumenVivo: aplicar };
    if (name.endsWith("/leerPoblacion")) return { leerPoblacion: async () => null };
    throw new Error(`Import no previsto: ${name}`);
  };
  vm.runInNewContext(await compilar("../app/api/datos/route.ts"), { exports, require, Response, URL, Request, console: { error() {} } });
  const r = await exports.GET(new Request("http://local/api/datos", { headers: { Authorization: "Bearer x" } }));
  return { status: r.status, body: await r.json() };
}
{
  const ok = await ruta(async (d) => ({ ...d, resultados: d.resultados.map((f) => f.nivel === "Detalle"
    ? { ...f, asistieron: 2, asistieron_etl: f.asistieron, resumen_fuente: "vivo" } : f) }));
  assert.equal(ok.status, 200); assert.equal(ok.body.resultados[2].asistieron, 2); assert.equal(ok.body.resultados[2].resumen_fuente, "vivo");
  const caida = await ruta(async () => { throw new Error("boom"); });
  assert.equal(caida.status, 200, "si el vivo falla la ruta no cae"); assert.equal(caida.body.resultados[2].asistieron, 1);
}
// 5) Hero: rotula "calculado en vivo", nota corta si difiere del ETL, y el fallback marcado.
{
  const props = (actual) => ({ actual, nuncaPeriodo: 1, sinSabado: false });
  const vivo = { ...fila("2026-10-05", "Detalle"), asistieron: 174, poblacion: 233, porcentaje_retencion: 74.68, resumen_fuente: "vivo",
    asistieron_etl: 170, poblacion_etl: 230, porcentaje_retencion_etl: 73.91 };
  const t1 = await renderizar("components/ResumenSemanaVisual.tsx", props(vivo));
  assert.match(t1, /174 de 233 personas medibles/); assert.match(t1, /calculado en vivo, igual al calendario/);
  assert.match(t1, /cierre del ETL decía 170 de 230 \(73\.9 %\)/);
  const t2 = await renderizar("components/ResumenSemanaVisual.tsx", props({ ...vivo, asistieron_etl: 174, poblacion_etl: 233 }));
  assert.match(t2, /calculado en vivo, igual al calendario/); assert.doesNotMatch(t2, /cierre del ETL decía/, "sin nota si coincide");
  const t3 = await renderizar("components/ResumenSemanaVisual.tsx", props({ ...fila("2026-10-05", "Detalle"), resumen_fuente: "etl" }));
  assert.match(t3, /no se pudo calcular en vivo/);
  const t4 = await renderizar("components/ResumenSemanaVisual.tsx", props(fila("2026-08-25", "Solo semanal")));
  assert.doesNotMatch(t4, /calculado en vivo, igual|no se pudo calcular/, "Solo semanal sin rotulo de vivo");
}
console.log("RESUMEN: hero=cifra_calendario etl=referencia fallback=etl_marcado cache=compartida demo=intacto estado=verde");
