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
const props = (extra = {}, datos = t) => ({ actual, nuncaPeriodo: 1, sinSabado: false, tiempo: { estado: "ok", datos }, irATiempo: () => {}, ...extra });
const sp = t.semana_personas;
assert.ok(sp && sp.medidos > 0, "el demo trae veredicto por persona");
// Regla C (2026-10-14): por defecto la tarjeta cuenta a TODOS los que ingresaron, por persona y con su mejor clase
const texto = await renderizar("components/ResumenSemanaVisual.tsx", props());
assert.ok(texto.includes(`${sp.cumplen} de ${sp.medidos} cumplen`), texto);
assert.ok(texto.includes(`${sp.medidos} de ${sp.con_entrada} con tiempo medido`), "misma base que Ingresaron");
assert.ok(texto.includes("una visita corta se conserva con su % bajo"), "la visita corta no se pierde");
assert.ok(texto.includes("Todos los que ingresaron") && texto.includes("En su jornada") && texto.includes("Visitas / colados"), "botones de vista");
{ // accesibilidad: grupo de radios con estado y vista inicial «todos» (el render devuelve solo texto)
  const { readFile } = await import("node:fs/promises");
  const fuente = await readFile(new URL("../components/ResumenSemanaVisual.tsx", import.meta.url), "utf8");
  assert.match(fuente, /role="radiogroup"[\s\S]*role="radio"[\s\S]*aria-checked=\{activa === v\}/, "grupo de radios con aria-checked");
  assert.match(fuente, /vistaInicial = "todos"/, "por defecto cuenta a todos los que ingresaron");
}
// Lectura de su jornada: la de antes (suma de clases) y remite al veredicto semanal
const propia = await renderizar("components/ResumenSemanaVisual.tsx", props({ vistaTiempoInicial: "propia" }));
assert.ok(propia.includes(`${a.n_cumplen} de ${a.n_medibles} medidos cumplen (suma de clases)`), propia);
assert.ok(propia.includes("el veredicto semanal usa la mejor sesión: ver pestaña Tiempo"), "remite a la pestaña Tiempo");
// Visitas / colados: solo entradas a una sala que no es la suya
const vis = await renderizar("components/ResumenSemanaVisual.tsx", props({ vistaTiempoInicial: "visitas" }));
const v = t.visitas;
assert.ok(vis.includes(`${v.cumplen} de ${v.cumplen + v.rojo} visitas cumplen`), vis);
assert.ok(vis.includes("no entran en «En su jornada»"));
// Sin veredicto por persona no hay botones y se muestra solo la jornada (no se inventa una cifra)
const sinPersonas = armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas, info: { ...d.info, resumen_personas: null } });
const textoSin = await renderizar("components/ResumenSemanaVisual.tsx", props({}, sinPersonas));
assert.ok(!textoSin.includes("tiempo-vistas") && textoSin.includes(`${a.n_cumplen} de ${a.n_medibles} medidos cumplen (suma de clases)`), "fallback a la jornada sin botones");

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
