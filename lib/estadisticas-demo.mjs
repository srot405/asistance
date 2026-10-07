// Datos SINTETICOS (nadie real, ni nombres) para la pestana Estadisticas en MODO_DEMO y para los tests. Se arman como lo hace la base:
// primero las filas por ciudad x clase (v_asist_corte, 085) y despues los niveles semana / dia / ciudad / ciudad_dia
// (v_asist_corte_nivel, 087) SUMANDO esas filas ANTES de suprimir; una fila con roster < 5 sale con todas las cifras en null.
// Asi el demo reproduce lo importante: un nivel publicado puede estar completo aunque sus celdas finas esten suprimidas.
import { ORDEN_DIAS } from "./estadisticasCalculo.mjs";

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MATERIA_DEMO = { "2026-09-14": "HTML/CSS", "2026-09-21": "JavaScript", "2026-09-28": "React" };
const CIUDADES = [["Cali", 38], ["Bogotá", 42], ["Medellín", 30], ["Quibdó", 7]];   // Quibdó: pocas personas -> celdas suprimidas
const CLASES = [  // [dia, hora_inicio, hora_fin, cuenta_zoom, tipo]
  ["lunes", 18, 20, "comunicaciones", "virtual"], ["martes", 18, 20, "jovenescreativos", "virtual"],
  ["miercoles", 18, 20, "soporte", "virtual"], ["jueves", 18, 20, "comunicaciones", "virtual"],
  ["sabado", 8, 10, "jovenescreativos", "presencial"], ["sabado", 10, 12, "soporte", "presencial"],
];
const SUMAS = ["roster", "entraron_a_su_clase", "fueron_a_otra", "no_aparecieron", "no_medibles", "visitas_recibidas"];
const lunes = (semana, i) => { const d = new Date(`${semana}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); };

export function construirCortesDemo(semana, abierta = false) {
  const rnd = mulberry32([...semana].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 11));
  const crudas = [];   // sin suprimir: base de los niveles
  CLASES.forEach(([dia, hi, hf, cuenta, tipo], k) => CIUDADES.forEach(([ciudad, base]) => {
    const roster = Math.max(1, Math.round(base / 2 + rnd() * 6 - 3));
    const medible = !(abierta && k > 1) && !(semana === "2026-09-21" && k === 2 && ciudad === "Medellín");   // sin captura -> no medibles
    const sinClase = semana === "2026-09-21" && dia === "sabado";
    const noMed = medible && !sinClase ? 0 : roster;
    const entraron = noMed ? 0 : Math.round(roster * (0.55 + rnd() * 0.35));
    const otra = noMed ? 0 : Math.min(roster - entraron, Math.round(rnd() * 3));
    const estado = abierta && k > 1 ? "por_ocurrir" : sinClase ? "sin_clase" : !medible ? "zoom_limit_pendiente" : "capturada";
    crudas.push({ semana, ciudad, slot_id: `${dia}-${hi}-${k}`, materia: MATERIA_DEMO[semana] ?? "Demo", dia, fecha: lunes(semana, ORDEN_DIAS.indexOf(dia)),
      hora_inicio: hi, hora_fin: hf, cuenta_zoom: cuenta, tipo, sala: null, estado_captura: estado,
      roster, entraron_a_su_clase: entraron, fueron_a_otra: otra, no_aparecieron: noMed ? 0 : roster - entraron - otra, no_medibles: noMed,
      visitas_recibidas: noMed ? 0 : Math.round(rnd() * 4), mediana_pct_tiempo: noMed ? null : Math.round((62 + rnd() * 30) * 10) / 10 });
  }));
  const suprimir = (f, extra) => {
    const sup = f.roster < 5;
    return { ...extra, suprimido: sup, ...Object.fromEntries(SUMAS.map((k) => [k, sup ? null : f[k]])) };
  };
  const clases = crudas.map((f) => suprimir(f, { semana, ciudad: f.ciudad, slot_id: f.slot_id, materia: f.materia, dia: f.dia, fecha: f.fecha,
    hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, cuenta_zoom: f.cuenta_zoom, tipo: f.tipo, sala: f.sala, estado_captura: f.estado_captura }))
    .map((c, i) => ({ ...c, mediana_pct_tiempo: c.suprimido ? null : crudas[i].mediana_pct_tiempo }));
  const agrupar = (filtro) => {
    const acc = Object.fromEntries(SUMAS.map((k) => [k, 0]));
    for (const f of crudas.filter(filtro)) for (const k of SUMAS) acc[k] += f[k];
    return acc;
  };
  const niveles = [suprimir(agrupar(() => true), { semana, nivel: "semana", ciudad: null, dia: null, materia: MATERIA_DEMO[semana] ?? "Demo" })];
  for (const dia of new Set(CLASES.map((c) => c[0]))) niveles.push(suprimir(agrupar((f) => f.dia === dia), { semana, nivel: "dia", ciudad: null, dia, materia: MATERIA_DEMO[semana] }));
  for (const [ciudad] of CIUDADES) {
    niveles.push(suprimir(agrupar((f) => f.ciudad === ciudad), { semana, nivel: "ciudad", ciudad, dia: null, materia: MATERIA_DEMO[semana] }));
    for (const dia of new Set(CLASES.map((c) => c[0])))
      niveles.push(suprimir(agrupar((f) => f.ciudad === ciudad && f.dia === dia), { semana, nivel: "ciudad_dia", ciudad, dia, materia: MATERIA_DEMO[semana] }));
  }
  return { niveles, clases };
}

const SEMANAS = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
// La serie de tendencia trae SOLO el nivel 'ciudad' de todas las semanas (como la ruta real).
export const ESTADISTICAS_DEMO = Object.fromEntries(SEMANAS.map((s) => [s, construirCortesDemo(s, s === "2026-09-28")]));
export const SERIE_DEMO = SEMANAS.flatMap((s) => ESTADISTICAS_DEMO[s].niveles.filter((n) => n.nivel === "ciudad"));
