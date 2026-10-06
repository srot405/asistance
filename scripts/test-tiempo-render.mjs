import assert from "node:assert/strict";
import { renderizar } from "./render-componente.mjs";
import { TIEMPO_DEMO } from "../lib/tiempo-demo.mjs";
import { armarTiempoSemana, normalizarResumenPersonas } from "../lib/tiempoCalculo.mjs";
import { porcentajeUnDecimal, cumple50, cumple50Pct } from "../lib/tiempoVista.mjs";

const d = TIEMPO_DEMO["2026-09-14"];
const t = armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas, info: { ...d.info, resumen_personas: normalizarResumenPersonas(d.resumenFila) } });
const a = t.semana_agregada;

// M2: la tarjeta de Semana rotula la suma de clases y remite al veredicto semanal (mejor sesion)
const actual = { semana: "2026-09-14", materia: "Todas", nivel: "Detalle", porcentaje_retencion: 80, asistieron: 1, poblacion: 1, porcentaje_nunca: 1, nunca: 1,
  captura_completa: true, cuadre: { roster: 1, medibles: 1, sin_dato: 0, pendientes: 0, sin_clase: 0 }, clases_capturadas: 1, clases_programadas: 1,
  porcentaje_cobertura: 100, aviso: "", periodo_desde: null, periodo_hasta: null, congelada_en: null, roster_reconstruido: false };
const texto = await renderizar("components/ResumenSemanaVisual.tsx", { actual, nuncaPeriodo: 1, sinSabado: false,
  tiempo: { estado: "ok", datos: t }, irATiempo: () => {} });
assert.ok(texto.includes(`${a.n_cumplen} de ${a.n_medibles} medidos cumplen (suma de clases)`), texto);
assert.ok(texto.includes("el veredicto semanal usa la mejor sesión: ver pestaña Tiempo"), "remite a la pestaña Tiempo");

// Bajo 1: 49,6 nunca se ve "50 %"; la comparacion con el umbral sigue usando el valor exacto
assert.equal(porcentajeUnDecimal(49.6), "49,6 %");
assert.equal(porcentajeUnDecimal(49.96), "49,9 %", "se trunca, no se redondea hacia el umbral");
assert.equal(porcentajeUnDecimal(50), "50,0 %");
assert.equal(porcentajeUnDecimal(null), "—");
assert.equal(cumple50(496, 1000), false, "49,6 % no cumple");
assert.equal(cumple50Pct(49.6), false);
assert.equal(cumple50(500, 1000), true);
const agr = { ...a, n_ingresaron: 10, n_medibles: 10, n_cumplen: 4, n_rojo: 6, n_sin_dato: 0, n_pendiente: 0, mediana: 49.6, p10: 20.4, p90: 80.2,
  cobertura: 1, nivel_cobertura: "ok", sin_medicion: false, sin_ingresos: false, muestra_pequena: false, roster: 10 };
const tarjetas = await renderizar("components/TiempoTarjetas.tsx", { a: agr });
assert.match(tarjetas, /Mediana del % de clase\s*49,6 %/);
assert.doesNotMatch(tarjetas, /Mediana del % de clase\s*50 %/);
assert.match(tarjetas, /40,0 %/, "cumple 4/10");
const clase = { ...agr, slot_id: "s", fecha: "2026-09-14", horario_texto: "Lunes", estado_captura: "ok", fin_clase_min: 60, fin_confiable: true, clase_evaluable: true, motivo_no_evaluable: null };
const tabla = await renderizar("components/TiempoTablaClases.tsx", { clases: [clase], dias: [], semana: agr });
assert.match(tabla, /49,6 %/);
assert.match(tabla, /4 \(40,0 %\)/);
assert.doesNotMatch(tabla, /\b50 %/, "la mediana 49,6 no se ve como 50 %");

// Bajo 3: nombre null no rompe el orden ni el CSV (antes: TypeError -> 503)
const { construirCsvTiempo } = await import("../lib/exportarNominal.mjs");
const base = { ciudad: "Cali", franja: "m", franja_tiempo: "m", es_visita: false, fecha: "2026-09-15", pct_tiempo: 60, estado_tiempo: "cumple", cumple_50: true, minutos: 60, motivo_sin_dato: null, definitivo: true };
const csv = construirCsvTiempo([{ ...base, nombre: null }, { ...base, nombre: "Ana" }, { ...base, nombre: undefined, ciudad: null }]);
assert.equal(csv.contenido.trim().split(/\r?\n/).length, 4, "3 filas + cabecera");

// Bajo 4: el cache de cliente se vacia al cerrar sesion o al entrar otro usuario (mismo navegador)
const { readFile } = await import("node:fs/promises");
const ts = (await import("typescript")).default;
const vm = (await import("node:vm")).default;
const src = await readFile(new URL("../lib/useTiempo.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ex = {};
const vista = await import("../lib/tiempoVista.mjs");
vm.runInNewContext(js, { exports: ex, console, require: (n) => n === "react" ? { useCallback() {}, useEffect() {}, useState() {} }
  : n.endsWith("tiempoVista.mjs") ? vista : {} });
ex.guardarCacheTiempo("t|real|2026-09-28|||", { x: 1 });
assert.equal(ex.tamanoCacheTiempo(), 1);
ex.alCambiarSesionTiempo("SIGNED_IN", "u1");
ex.alCambiarSesionTiempo("TOKEN_REFRESHED", "u1");
assert.equal(ex.tamanoCacheTiempo(), 1, "mismo usuario conserva el cache");
ex.alCambiarSesionTiempo("SIGNED_IN", "u2");
assert.equal(ex.tamanoCacheTiempo(), 0, "otro usuario: cache vacio");
ex.guardarCacheTiempo("a", 1);
ex.alCambiarSesionTiempo("SIGNED_OUT", null);
assert.equal(ex.tamanoCacheTiempo(), 0, "cerrar sesion vacia el cache");
console.log("RESUMEN: tiempo_render=ok M2_rotulo=ok un_decimal=ok estado=verde");
