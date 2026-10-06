// Reporte CSV nominal completo de una semana (TOC-91, 2026-10-05): sirve aunque la
// captura este incompleta (ZL, P, NO?). Puro, sin I/O. NO reclasifica: usa
// clasificar() de detalleCalculo.mjs y el estado ya guardado en asist_celda_semana.
// Nunca convierte ZL/P/sin dato en "NO". Cuadre: roster = medible + fueraDato +
// pendiente + sinClase (sinClase suele ser 0).
import { clasificar, entroEnFecha } from "./detalleCalculo.mjs";
import { textoBaseSeguimiento } from "./baseSeguimiento.mjs";
import { LEYENDA_VISITAS, textoCumple50 } from "./tiempoVista.mjs";

export const BOM = "\uFEFF";
import { line } from "./csvSeguro.mjs";

export const LEYENDA = "SI=ingreso | NO=no ingreso (captura completa) | NO?=sin ingreso, por revisar (semana en revision) | " +
  "ZL=Zoom limit, sin dato (NO es ausencia) | P=clase aun no ocurre (pendiente) | sin clase=sin franja o sin clase ocurrida | SC=dia declarado sin clase (fuera del denominador, no es ausencia) | sin dato=sin estado guardado | " +
  "TIEMPO: cumple_50=SI si estuvo al menos el 50 % del tiempo de su clase (exactamente 50 % cumple); estado_tiempo rojo_tiempo=menos del 50 % del tiempo de su clase, " +
  "sin_dato_tiempo=no se pudo medir (NO es falta ni rojo), no_ingreso=no entro a ninguna clase, no_calculado=sin calculo de tiempo todavia; pct_tiempo/minutos solo con tiempo medido " +
  "(nunca 0 por no medido); " + LEYENDA_VISITAS;

const MOTIVOS = {
  zoom_limit_pendiente: "Zoom limit: la sala no pudo capturarse, sin dato (no es ausencia)",
  por_ocurrir: "La clase aun no ocurre",
  en_curso: "Clase en curso, captura parcial",
  sin_captura: "Sin captura de Zoom",
  sin_clase: "Dia declarado sin clase (fuera del denominador, no es ausencia)",
  sin_sesion: "No existe sesion registrada para la franja",
};

// clasificar() manda a "sin_clase" a quien tiene franja pero ninguna sesion con entradas ese
// dia (p.ej. un dia entero en ZL). Para el reporte eso esconderia ZL/P: si la celda guardada
// dice ZL o P y la persona tiene franja, se respeta la celda (fuera de dato / pendiente).
function categoria(persona, base) {
  const clase = clasificar(persona, base);
  if (clase !== "sin_clase" || !persona.slot_id) return clase;
  const celda = base.celdaPorPersona.get(persona.persona_id);
  if (celda === "ZL") return "sin_dato";
  if (celda === "P") return "pendiente";
  return clase;
}

function estadoSemana(persona, base) {
  if (categoria(persona, base) === "sin_clase") return "sin clase";
  return base.celdaPorPersona.get(persona.persona_id) ?? "sin dato";
}

// Varias sesiones en un mismo slot (reinicios de sala, sala duplicada): gana de forma explicita
// la capturada CON entradas (hay dato real medible); si ninguna lo es, gana la peor, en este orden:
// zoom_limit_pendiente > sin_captura > en_curso > por_ocurrir > capturada (sin entradas).
// Cuando hay mas de una se declara en el reporte ("sesiones multiples"), nunca en silencio.
const PEOR = ["zoom_limit_pendiente", "sin_captura", "en_curso", "por_ocurrir", "capturada"];
const rango = (e) => { const i = PEOR.indexOf(e); return i < 0 ? PEOR.length : i; };
function elegirSesionPorSlot(sesiones) {
  const porSlot = new Map();
  for (const s of sesiones) porSlot.set(s.slot_id, [...(porSlot.get(s.slot_id) ?? []), s]);
  const elegida = new Map();
  const multiples = [];
  for (const [slot, lista] of porSlot) {
    const util = lista.find((s) => s.estado_captura === "capturada" && (s.entradas_totales ?? 1) > 0);
    elegida.set(slot, util ?? [...lista].sort((a, b) => rango(a.estado_captura) - rango(b.estado_captura))[0]);
    if (lista.length > 1) multiples.push({ franja: slot, estados: [...new Set(lista.map((s) => s.estado_captura ?? "sin_sesion"))].sort() });
  }
  return { elegida, multiples };
}

// Compara el conteo recalculado desde el roster contra asist_semana_resumen. No bloquea: solo declara.
function compararConResumen(calc, resumen) {
  if (!resumen) return { estado: "SIN_RESUMEN", detalle: [] };
  const rc = resumen.cuadre ?? {};
  const pares = [["poblacion", resumen.poblacion, calc.medible], ["asistieron", resumen.asistieron, calc.asistieron],
    ["nunca", resumen.nunca, calc.nunca], ["roster", rc.roster, calc.roster], ["medibles", rc.medibles, calc.medible],
    // El reporte separa ZL (fuera_dato) de sin_clase (ver categoria()); el ETL puede contar ambos como sin_clase
    // (p.ej. sabado excluido). Se compara el total de NO medibles, no el reparto interno.
    ["no_medibles", [rc.sin_dato, rc.sin_clase, rc.pendientes].every((v) => typeof v === "number") ? rc.sin_dato + rc.sin_clase + rc.pendientes : undefined,
      calc.fueraDato + calc.sinClase + calc.pendiente]];
  const comparables = pares.filter(([, esperado]) => typeof esperado === "number");
  if (comparables.length === 0) return { estado: "SIN_COMPARAR", detalle: [] };
  const detalle = comparables.filter(([, e, a]) => e !== a).map(([k, e, a]) => `${k}: resumen=${e} reporte=${a}`);
  return { estado: detalle.length ? "DISCREPA" : "OK", detalle };
}

// tiempos (TOC-140) = { disponible, personas: Map<persona_id, veredicto semanal (MEJOR sesion)>, resumen } o null.
export function construirReporteSemana(semana, base, resumen = null, congelacion = null, tiempos = null) {
  const { elegida: sesionPorSlot, multiples } = elegirSesionPorSlot(base.sesiones ?? []);
  const franjas = [...base.franjas.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id));
  const cuadre = { roster: base.roster.length, medible: 0, fueraDato: 0, pendiente: 0, sinClase: 0 };
  let asistieron = 0;
  let nunca = 0;
  const filas = [];
  const afectadas = new Map();
  for (const p of base.roster) {
    const clase = categoria(p, base);
    if (clase === "medible") {
      cuadre.medible++;
      if (base.celdaPorPersona.get(p.persona_id) === "SI") asistieron++; else nunca++;
    }
    else if (clase === "pendiente") cuadre.pendiente++;
    else if (clase === "sin_dato") cuadre.fueraDato++;
    else cuadre.sinClase++;
    const franja = p.slot_id ? base.franjas.get(p.slot_id) : undefined;
    const fecha = franja?.fecha ?? "";
    const semanal = estadoSemana(p, base);
    let dia = semanal;
    if (fecha && entroEnFecha(base, p.persona_id, fecha)) dia = "SI";
    else if (semanal === "SI") dia = "SI (otra franja)";
    filas.push({ persona_id: p.persona_id, nombre: p.nombre, ciudad: p.ciudad, franja: p.slot_id ?? "", fecha, semanal, dia });
    if (p.slot_id) afectadas.set(p.slot_id, (afectadas.get(p.slot_id) ?? 0) + 1);
  }
  const sinDato = [];
  for (const f of franjas) {
    const ses = sesionPorSlot.get(f.slot_id);
    const estado = ses?.estado_captura ?? "sin_sesion";
    if (estado === "capturada" || estado === "sin_clase") continue;
    const mult = multiples.some((m) => m.franja === f.slot_id) ? "; sesiones multiples en la franja" : "";
    sinDato.push({ fecha: f.fecha, franja: f.slot_id, estado, motivo: (MOTIVOS[estado] ?? `Estado de captura: ${estado}`) + mult,
      personas: afectadas.get(f.slot_id) ?? 0 });
  }
  const hayRevision = filas.some((f) => f.semanal === "NO?");
  const completa = sinDato.length === 0 && resumen?.captura_completa !== false && !hayRevision;
  const cuadra = cuadre.roster === cuadre.medible + cuadre.fueraDato + cuadre.pendiente + cuadre.sinClase;
  filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.franja.localeCompare(b.franja));
  const comparacion = compararConResumen({ ...cuadre, asistieron, nunca }, resumen);
  const baseTexto = textoBaseSeguimiento(cuadre.roster, congelacion?.congelada_en, { reconstruida: !!congelacion?.reconstruida });
  return { semana, tiempos, completa, hayRevision, baseTexto, cuadre, cuadra, comparacion, multiples, sinResumen: !resumen, sinDato, filas,
    nivel: resumen?.nivel ?? "Detalle" };
}

function textoCuadre(r) {
  if (!r.cuadra) return "cuadre=DESCUADRADO";
  const { estado, detalle } = r.comparacion ?? { estado: "SIN_COMPARAR", detalle: [] };
  if (estado === "DISCREPA") return `cuadre=DISCREPA(${detalle.join(" | ")})`;
  return estado === "OK" ? "cuadre=OK" : "cuadre=sin_comparar";
}

export const COLUMNAS_TIEMPO_REPORTE = ["pct_tiempo", "estado_tiempo", "cumple_50", "minutos", "motivo_sin_dato", "sesiones_consideradas", "definitivo"];
const VACIO_TIEMPO = COLUMNAS_TIEMPO_REPORTE.map(() => "");

// Veredicto SEMANAL de una persona (MEJOR sesion; pct_tiempo = mejor_pct, minutos = minutos_max; no es suma).
function columnasTiempoPersona(tiempos, personaId) {
  const v = tiempos?.disponible ? tiempos.personas.get(personaId) : null;
  if (!v) return ["", "no_calculado", "", "", "", "", ""];
  const medido = v.estado_tiempo === "cumple" || v.estado_tiempo === "rojo_tiempo";
  const estado = v.estado_tiempo === "ausente" ? "no_ingreso" : v.estado_tiempo === "sin_clase" ? "no_calculado" : v.estado_tiempo;
  const motivo = v.estado_tiempo === "sin_clase" ? "sesion_sin_clase" : (v.motivo ?? "");
  return [medido ? (v.mejor_pct ?? "") : "", estado, medido ? textoCumple50(v.cumple_50) : "", medido ? (v.minutos_max ?? "") : "", motivo,
    v.sesiones_consideradas ?? "", v.definitivo === true ? "SI" : v.definitivo === false ? "NO" : ""];
}

function textoTiempoResumen(tiempos) {
  const r = tiempos?.disponible ? tiempos.resumen : null;
  if (!r) return "tiempo=no calculado";
  const cumpl = r.con_entrada > 0 ? `${r.medidos} de ${r.con_entrada} con tiempo medido` : "0 de 0 con tiempo medido";
  return `tiempo: ${cumpl}; cumplen_50=${r.cumplen}; rojo_tiempo=${r.rojo}; sin_dato_tiempo=${r.sin_dato}; umbral=${r.umbral_pct || 50}%_del_tiempo_de_clase`;
}

export function construirCsvReporte(r) {
  const header = ["tipo_fila", "semana", "nombre", "ciudad", "franja", "fecha", "estado_semana", "estado_dia", "detalle", ...COLUMNAS_TIEMPO_REPORTE];
  const c = r.cuadre;
  const estadoCaptura = r.completa ? "captura completa" : "captura incompleta";
  const filas = [line(header),
    line(["RESUMEN", r.semana, "", "", "", "", "", "", `${estadoCaptura}; ${r.baseTexto ? `${r.baseTexto}; ` : ""}roster=${c.roster}; medible=${c.medible}; ` +
      `fuera_dato=${c.fueraDato}; pendiente=${c.pendiente}; sin_clase=${c.sinClase}; ${textoCuadre(r)}` +
      `${r.sinResumen ? "; resumen no generado" : ""}${r.hayRevision ? "; semana en revision (NO? por confirmar)" : ""}` +
      `${r.multiples?.length ? `; sesiones multiples=${r.multiples.map((m) => `${m.franja}(${m.estados.join("+")})`).join(" | ")}` : ""}` +
      `; ${textoTiempoResumen(r.tiempos)}`, ...VACIO_TIEMPO]),
    line(["LEYENDA", r.semana, "", "", "", "", "", "", LEYENDA, ...VACIO_TIEMPO]),
    ...r.sinDato.map((s) => line(["FRANJA_SIN_DATO", r.semana, "", "", s.franja, s.fecha, "", "",
      `${s.motivo}; personas_afectadas=${s.personas}`, ...VACIO_TIEMPO])),
    ...r.filas.map((f) => line(["PERSONA", r.semana, f.nombre, f.ciudad, f.franja, f.fecha, f.semanal, f.dia, "",
      ...columnasTiempoPersona(r.tiempos, f.persona_id)])),
  ];
  return { contenido: BOM + filas.join("\r\n") + "\r\n", archivo: r.completa ? "reporte_completo" : "reporte_captura_incompleta" };
}
