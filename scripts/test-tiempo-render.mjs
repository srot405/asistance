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
const sp = t.semana_personas;
assert.ok(sp && sp.medidos > 0, "el demo trae veredicto por persona");
import { normalizarOrigen } from "../lib/tiempoCalculo.mjs";
// Regla C (2026-10-14): selector de poblacion (todos / en su horario / colados) que gobierna las 3 tarjetas, y la tarjeta de
// tiempo es de COBERTURA del % de estancia por persona. Datos de la semana 2026-09-28 (reales): 525 ingresaron = 465 en su
// horario + 60 colados; 525 de 525 con % de estancia; 113 no superan el 50 % ni con su mejor clase (99 + 14).
const origen = normalizarOrigen([
  { origen: "con_propia", personas: 465, cumplen: 366, rojo: 99, sin_dato: 0, pendientes: 0, con_pct: 465, sin_pct: 0 },
  { origen: "solo_visita", personas: 60, cumplen: 46, rojo: 14, sin_dato: 0, pendientes: 0, con_pct: 60, sin_pct: 0 }]);
assert.deepEqual([origen.total.personas, origen.total.cumplen, origen.total.rojo, origen.total.con_pct, origen.total.sin_pct], [525, 412, 113, 525, 0], "suma exacta de origenes");
assert.equal(normalizarOrigen([]), null, "sin filas no hay origen");
const tO = armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas, info: { ...d.info, resumen_personas: normalizarResumenPersonas(d.resumenFila), origen_personas: origen } });
const real = { ...actual, asistieron: 525, poblacion: 720, nunca: 195, porcentaje_retencion: 72.9, porcentaje_nunca: 27.1, ingresaron_horario: 465, ingresaron_colados: 60, cerrada_en: "2026-10-11T02:00:00Z" };
const props = (extra = {}, datos = tO, act = real) => ({ actual: act, nuncaPeriodo: 1, sinSabado: false, tiempo: { estado: "ok", datos }, irATiempo: () => {}, ...extra });
const R = (extra, datos, act) => renderizar("components/ResumenSemanaVisual.tsx", props(extra, datos, act));

// 1) Todos (por defecto): Ingresaron 525 de 720, No ingresaron 195 y COBERTURA 525 de 525 con el 50 % como dato secundario
const todos = await R();
assert.ok(todos.includes("Todos los que ingresaron · 525") && todos.includes("En su horario · 465") && todos.includes("Colados · 60"), "selector con conteos");
assert.ok(todos.includes("525 de 720 personas medibles") && todos.includes("195 personas"), todos);
assert.ok(todos.includes("100 %") && todos.includes("525 de 525 personas que ingresaron con % de estancia en sala"), "cobertura 525 de 525");
assert.ok(todos.includes("113 no superan el 50 % de estancia ni con su mejor clase") && todos.includes("412 sí lo superan"), "el 50 % queda como dato secundario");
assert.ok(!todos.includes("⚠"), "sin alerta cuando todos tienen %");
// 2) En su horario: 465 de 720; no ingresaron a su clase = 195 + 60; cobertura 465 de 465
const hor = await R({ poblacionInicial: "horario" });
assert.ok(hor.includes("465 de 720 personas medibles entraron a su propia clase") && hor.includes("255 personas no entraron a su clase: 195 no entraron a ninguna clase y 60 entraron solo como colados"), hor);
assert.ok(hor.includes("465 de 465 personas que entraron a su clase con % de estancia en sala") && hor.includes("99 no superan el 50 %") && hor.includes("366 sí lo superan"), hor);
// 3) Colados: 100 % (todos ingresaron), «No aplica», cobertura 60 de 60 y el 50 % recalcado
const col = await R({ poblacionInicial: "colados" });
assert.ok(col.includes("60 de 60 colados") && col.includes("100 %") && col.includes("por definición todos ingresaron"), col);
assert.ok(col.includes("No aplica") && col.includes("un colado, por definición, sí ingresó"), col);
assert.ok(col.includes("60 de 60 colados con % de estancia en sala") && col.includes("14 no superan el 50 % de estancia ni con su mejor clase") && col.includes("46 sí lo superan"), col);
// 4) Una persona que ingreso y NO tiene %: la tarjeta avisa (nunca se esconde) y la cobertura baja
const origenFalla = normalizarOrigen([
  { origen: "con_propia", personas: 465, cumplen: 366, rojo: 98, sin_dato: 1, pendientes: 0, con_pct: 464, sin_pct: 1 },
  { origen: "solo_visita", personas: 60, cumplen: 46, rojo: 14, sin_dato: 0, pendientes: 0, con_pct: 60, sin_pct: 0 }]);
const tF = armarTiempoSemana({ clases: d.clases, personas: d.personas, franjas: d.franjas, info: { ...d.info, resumen_personas: normalizarResumenPersonas(d.resumenFila), origen_personas: origenFalla } });
const falla = await R({}, tF);
assert.ok(falla.includes("524 de 525") && falla.includes("⚠ 1 sin % de estancia (revisar)"), falla);
// 5) Ingresaron (vivo) 531 pero el tiempo solo cubre 525: en semana CERRADA es una alerta (⚠ 6 sin % de estancia); en semana ABIERTA, «por calcular»
const desfase = await R({}, tO, { ...real, asistieron: 531 });
assert.ok(desfase.includes("⚠ 6 sin % de estancia (revisar)"), desfase);
const desfaseAbierta = await R({}, { ...tO, provisional: true }, { ...real, asistieron: 531, cerrada_en: null });
assert.ok(desfaseAbierta.includes("6 por calcular (el tiempo se actualiza cada ~15 min)") && !desfaseAbierta.includes("⚠ 6"), desfaseAbierta);
// 6) Sin la cifra en vivo (ETL de respaldo) no hay selector y todo se ve como antes
const etl = await R({}, tO, { ...actual });
assert.ok(!etl.includes("Todos los que ingresaron ·"), "sin selector sin cifra en vivo");
// 7) Sin la vista de origen: cae al veredicto semanal por persona y, para colados, lo dice sin inventar cifras
const sinVista = await R({}, t);
assert.ok(sinVista.includes(`${sp.medidos} de ${sp.con_entrada} personas que ingresaron con tiempo medido`), sinVista);
const sinVistaCol = await R({ poblacionInicial: "colados" }, t);
assert.ok(sinVistaCol.includes("falta la vista de origen"), sinVistaCol);
// 8) Lectura de antes (jornada) conserva el N de M del backend cuando no hay origen
const jornada = await R({ poblacionInicial: "horario" }, t);
assert.ok(jornada.includes(`${a.n_medibles} de ${a.n_ingresaron} con tiempo medido`), jornada);
// 9) Semana abierta (2026-10-14): aviso y «Aún no ingresaron»; semana cerrada: «No ingresaron»
const abierta = await R({}, { ...tO, provisional: true }, { ...real, cerrada_en: null });
assert.ok(abierta.includes("Semana abierta") && abierta.includes("Aún no ingresaron"), abierta);
const cerrada = await R({}, tO, { ...real, cerrada_en: "2026-10-11T02:00:00Z" });
assert.ok(!cerrada.includes("Semana abierta") && cerrada.includes("No ingresaron") && !cerrada.includes("Aún no ingresaron"), "cerrada sin aviso");
// 10) «En su horario»: el titulo de la segunda tarjeta es «No entraron a su clase» (no «No ingresaron», que incluiria a colados)
const hor2 = await R({ poblacionInicial: "horario" }, tO, { ...real, cerrada_en: "2026-10-11T02:00:00Z" });
assert.ok(hor2.includes("No entraron a su clase") && !hor2.includes("No ingresaron a su clase"), hor2);
// 11) Hueco: en semana cerrada, ingresaron (en vivo) sin % en la base = alerta; en abierta = «por calcular»
const hueco = await R({}, tO, { ...real, asistieron: 527, cerrada_en: "2026-10-11T02:00:00Z" });      // origen dice 525 con %, vivo 527
assert.ok(hueco.includes("⚠ 2 sin % de estancia (revisar)"), hueco);
const porCalcular = await R({}, { ...tO, provisional: true }, { ...real, asistieron: 527, cerrada_en: null });
assert.ok(porCalcular.includes("2 por calcular") && !porCalcular.includes("⚠"), porCalcular);
{ // accesibilidad
  const { readFile } = await import("node:fs/promises");
  const fuente = await readFile(new URL("../components/ResumenSemanaVisual.tsx", import.meta.url), "utf8");
  assert.match(fuente, /role="radiogroup"[\s\S]*role="radio"[\s\S]*aria-checked=\{valor === p\}/, "grupo de radios con aria-checked");
  assert.match(fuente, /poblacionInicial \?\? "todos"/, "por defecto: todos los que ingresaron");
}

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
const tablaHtml = await renderizar("components/TiempoTablaClases.tsx", { clases: [clase], dias: [], semana: agr }, { html: true });
assert.match(tablaHtml, /<td>49,6 %<\/td>/, "mediana truncada en la celda");
assert.doesNotMatch(tablaHtml, /<td>50(?:,0)? %<\/td>/, "la mediana 49,6 no se ve como 50 %");
assert.match(tabla, /Histórico/, "el 50 % de la cabecera es un indicador técnico histórico");

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
