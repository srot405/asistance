import assert from "node:assert/strict";
import { renderizar } from "./render-componente.mjs";
import { agregarPersonasPorOrigen, armarSerieTiempo, armarTiempoSemana } from "../lib/tiempoCalculo.mjs";
import { TIEMPO_DEMO } from "../lib/tiempo-demo.mjs";
import { cargarLector } from "./test-tiempo-paginacion.mjs";

// Regla C (2026-10-14): tiempo POR PERSONA que ingreso, con su mejor clase, separado en «en su horario» y «colados» (suman el total).
// Fixture con la forma de la semana 2026-10-05 (reales: 447 en su horario + 84 colados = 531; 413 cumplen, 118 bajo 50 %).
const fila = (origen, estado, pct, extra = {}) => ({ origen, ciudad: "Cali", franja_propia: "backend-martes-18", cuenta_zoom: "comunicaciones",
  estado_tiempo: estado, mejor_pct: pct, ...extra });
const filas = [];
for (let i = 0; i < 349; i++) filas.push(fila("con_propia", "cumple", 60 + (i % 41)));
for (let i = 0; i < 98; i++) filas.push(fila("con_propia", "rojo_tiempo", 1 + (i % 49)));
for (let i = 0; i < 64; i++) filas.push(fila("solo_visita", "cumple", 55 + (i % 46)));
for (let i = 0; i < 20; i++) filas.push(fila("solo_visita", "rojo_tiempo", i === 0 ? 0.3 : 2 + i));            // una visita de 0,3 %: se conserva

const p = agregarPersonasPorOrigen(filas);
assert.deepEqual([p.todos.n_ingresaron, p.horario.n_ingresaron, p.colados.n_ingresaron], [531, 447, 84], "horario + colados = todos");
assert.equal(p.horario.n_ingresaron + p.colados.n_ingresaron, p.todos.n_ingresaron);
assert.deepEqual([p.todos.n_cumplen, p.todos.n_rojo, p.todos.n_medibles], [413, 118, 531], "412+: 413 cumplen, 118 no superan el 50 % ni con su mejor clase");
assert.equal(p.todos.n_cumplen, p.horario.n_cumplen + p.colados.n_cumplen, "los que cumplen suman exacto");
assert.equal(p.todos.n_rojo, p.horario.n_rojo + p.colados.n_rojo, "los rojos suman exacto");
assert.deepEqual([p.todos.con_pct, p.todos.sin_pct], [531, 0], "cobertura: todos los que ingresaron tienen % de estancia");
assert.ok(p.colados.histograma.bins[0].n >= 1, "la visita de 0,3 % se conserva en el primer tramo del histograma");
assert.equal(p.colados.mediana != null && p.todos.mediana != null, true);
assert.equal(p.todos.histograma.total, 531, "el histograma cubre a todos los medidos");

// filtros: ciudad / clase / cuenta (sobre la clase y ciudad PROPIAS) y suprimir con <5 personas
const mezcla = [...filas, ...[1, 2, 3].map(() => fila("con_propia", "cumple", 80, { ciudad: "Quito", franja_propia: "backend-jueves-10", cuenta_zoom: "jovenescreativos" }))];
assert.equal(agregarPersonasPorOrigen(mezcla, { ciudad: "Quito" }).todos.n_ingresaron, 3);
assert.equal(agregarPersonasPorOrigen(mezcla, { ciudad: "Quito" }).todos.mediana, null, "n<5: no se publica mediana");
assert.equal(agregarPersonasPorOrigen(mezcla, { ciudad: "Quito" }).todos.histograma, null, "n<5: no se publica distribucion");
assert.equal(agregarPersonasPorOrigen(mezcla, { franja: "backend-jueves-10" }).horario.n_ingresaron, 3);
assert.equal(agregarPersonasPorOrigen(mezcla, { cuenta: "comunicaciones" }).todos.n_ingresaron, 531);
assert.equal(agregarPersonasPorOrigen([], {}), null, "sin filas no hay lectura por persona");

// una persona que ingreso sin ningun %: aparece en sin_pct (nunca se esconde) y baja la cobertura
const huecos = agregarPersonasPorOrigen([...filas, fila("solo_visita", "sin_dato_tiempo", null)]);
assert.deepEqual([huecos.todos.n_ingresaron, huecos.todos.con_pct, huecos.todos.sin_pct, huecos.colados.sin_pct], [532, 531, 1, 1]);

// armarTiempoSemana trae la lectura por persona y NO cambia las cifras por clase
const d = TIEMPO_DEMO["2026-09-14"];
const base = { clases: d.clases, personas: d.personas, franjas: d.franjas };
const sin = armarTiempoSemana({ ...base, info: { ...d.info } });
const con = armarTiempoSemana({ ...base, info: { ...d.info, personas_origen: filas } });
assert.equal(sin.personas_por_origen, null, "sin la vista queda como antes");
assert.equal(con.personas_por_origen.todos.n_ingresaron, 531);
assert.deepEqual(con.semana_agregada, sin.semana_agregada, "las cifras por clase no cambian");

// componente: encabezado «531 ingresaron = 447 en su horario + 84 colados», selector y cobertura
const R = (vista, datos = p, filtrado = false) => renderizar("components/TiempoPersonas.tsx", { datos, vista, onCambiar: () => {}, filtrado });
const todos = await R("todos");
assert.ok(todos.includes("531 ingresaron = 447 en su horario + 84 colados"), todos);
assert.ok(todos.includes("Todos los que ingresaron · 531") && todos.includes("En su horario · 447") && todos.includes("Colados · 84"), "selector con conteos");
assert.ok(todos.includes("531 de 531 personas que ingresaron con % de estancia en sala (100 %)"), todos);
assert.ok(todos.includes("menos del 50 % ni con su mejor clase"), "el 50 % como dato secundario, ni con su mejor clase");
assert.ok(!todos.includes("⚠"), "sin alerta cuando todos tienen %");
const hor = await R("horario");
assert.ok(hor.includes("447 de 447 personas que entraron a su clase con % de estancia en sala"), hor);
const col = await R("colados");
assert.ok(col.includes("84 de 84 colados con % de estancia en sala"), col);
const alerta = await R("todos", huecos);
assert.ok(alerta.includes("⚠ 1 sin % de estancia (revisar)") && alerta.includes("531 de 532"), alerta);
assert.ok((await R("todos", p, true)).includes("(con los filtros elegidos)"), "avisa cuando hay filtros");
const vacio = await R("colados", agregarPersonasPorOrigen(filas.filter((f) => f.origen === "con_propia")));
assert.ok(vacio.includes("No hay colados con estos filtros"), vacio);

// egress: la vista por persona solo se lee en la lectura COMPLETA de la pestaña Tiempo, una vez; nunca en la tarjeta ligera de Semana
const personas = d.personas.map((x) => ({ ...x, franja_tiempo: x.slot_id }));
const datos = { asist_tiempo_clase: d.clases, v_asist_tiempo_persona: personas, asist_franjas: d.franjas,
  asist_semanas: [{ congelada_en: null, cerrada_en: null, estado: "abierta", notas: null }], asist_semana_resumen: [d.resumenFila],
  v_asist_tiempo_origen: [], v_asist_tiempo_personas: filas };
const { lector, consultas } = await cargarLector(datos);
const leyo = (tabla) => consultas.filter((c) => c.tabla === tabla && c.rangos.length).length;
lector.vaciarCacheTiempo();
await lector.leerTiempoSemana("2026-09-14", {}, { ligero: true });
assert.equal(leyo("v_asist_tiempo_personas"), 0, "la tarjeta ligera de Semana no lee tiempo por persona");
const completa = await lector.leerTiempoSemana("2026-09-14", {});
assert.equal(leyo("v_asist_tiempo_personas"), 1, "la lectura completa la lee una vez");
assert.equal(completa.personas_por_origen.todos.n_ingresaron, 531);
const antes = consultas.length;
const filtrada = await lector.leerTiempoSemana("2026-09-14", { ciudad: "Cali" });
assert.equal(consultas.length, antes, "cambiar un filtro se resuelve en memoria");
assert.equal(filtrada.personas_por_origen.todos.n_ingresaron, 531);
const { lector: l2 } = await cargarLector({ ...datos, v_asist_tiempo_personas: [] });
l2.vaciarCacheTiempo();
assert.equal((await l2.leerTiempoSemana("2026-09-14", {})).personas_por_origen, null, "sin filas de la vista, la pestaña conserva su lectura por clase");
const { lector: l3 } = await cargarLector(datos, { v_asist_tiempo_personas: { code: "PGRST205", message: "no existe" } });
l3.vaciarCacheTiempo();
assert.equal((await l3.leerTiempoSemana("2026-09-14", {})).personas_por_origen, null, "sin la vista (migracion 094) no se rompe la pestaña");

// Historial (2026-10-14): la serie de tiempo usa la base «todos los que ingresaron» (por persona) cuando la semana la trae
const serie = armarSerieTiempo([
  { semana: "2026-10-05", n_ingresaron: 447, n_medibles: 435, n_cumplen: 339, n_rojo: 96, n_sin_dato: 12, provisional: false, estado_semana: "cerrada",
    p_con_entrada: 531, p_medidos: 531, p_cumplen: 413, p_rojo: 118, p_sin_dato: 0 },
  { semana: "2026-09-28", n_ingresaron: 465, n_medibles: 465, n_cumplen: 366, n_rojo: 99, n_sin_dato: 0, provisional: false, estado_semana: "cerrada" }]);
const s1005 = serie.find((x) => x.semana === "2026-10-05"), s0928 = serie.find((x) => x.semana === "2026-09-28");
assert.deepEqual([s1005.n_ingresaron, s1005.n_medibles, s1005.n_cumplen, s1005.n_rojo, s1005.base, s1005.cobertura], [531, 531, 413, 118, "personas", 1], "la serie usa 531, no 447");
assert.deepEqual([s0928.n_ingresaron, s0928.base], [465, "clases"], "sin el veredicto por persona conserva la lectura por clase");
const filaHist = (semana, cerrada_en) => ({ semana, materia: "Backend", nivel: "Detalle", poblacion: 713, asistieron: 531, nunca: 182, porcentaje_retencion: 74.5, porcentaje_nunca: 25.5,
  clases_programadas: 14, clases_capturadas: 14, porcentaje_cobertura: 100, captura_completa: true, aviso: "", periodo_desde: null, periodo_hasta: null,
  congelada_en: null, roster_reconstruido: false, cerrada_en, cuadre: { roster: 713, medibles: 713, sin_dato: 0, pendientes: 0, sin_clase: 0 } });
const hist = await renderizar("components/TendenciaHistorica.tsx", { resultados: [filaHist("2026-10-05", "2026-10-11T02:00:00Z"), filaHist("2026-10-12", null)] });
assert.equal((hist.match(/Sin cierre · parcial/g) ?? []).length, 1, "solo la semana sin cierre se marca como parcial");
assert.ok(hist.includes("Las semanas sin cierre son parciales y no se comparan"), hist);

// Estadisticas (2026-10-14): tarjeta «Ingresaron» = en su horario + colados (misma definicion que Semana), sin sumar nulos suprimidos
{
  const { readFile } = await import("node:fs/promises");
  const est = await readFile(new URL("../components/Estadisticas.tsx", import.meta.url), "utf8");
  assert.match(est, /data-testid="est-ingresaron"/);
  assert.match(est, /c\.entraron_a_su_clase != null && c\.fueron_a_otra != null \? c\.entraron_a_su_clase \+ c\.fueron_a_otra : null/, "si una parte esta suprimida (<5) no se inventa el total");
  assert.doesNotMatch(est, /Visitas recibidas|No aparecieron<\/span>/, "sin los nombres viejos");
}

console.log("RESUMEN: tiempo_personas=ok suma_exacta=531_447_84 cobertura=531_de_531 filtros=ok supresion_n5=ok egress=solo_pestana_tiempo estado=verde");
