// Cobertura de captura por clase (fase 1.6 del plan de veracidad 2026-10-09). Pura y sin I/O, sin PII.
//
// FUENTE UNICA: el estado de cada clase es el `estado_captura` de asist_sesiones, el mismo que usa el ETL y el resto del panel
// (chips de confianza de Estadisticas / calendario). Aqui NO se recalcula «capturada» desde el log crudo zoom_live_log:
// antes se reatribuian reuniones a franjas por heuristica de hora y salia una tercera definicion de «capturada».
// Las personas tambien vienen del ETL (personas_roster / personas_visita de asist_sesiones), no de contar correos del webhook.
//
// franjas:  asist_franjas de la semana [{slot_id, fecha, tipo, cuenta_zoom, horario_texto, hora_inicio, hora_fin, roster_n, captura_automatica}]
// sesiones: asist_sesiones de la semana [{slot_id, fecha, estado_captura, personas_roster, personas_visita}]
import { confianzaDeCaptura } from "./confianzaClase.mjs";

// Estados de la pestana (traduccion 1:1 de confianzaDeCaptura + «sin_sesion» si el ETL aun no creo la sesion de esa clase).
export const ETIQUETAS_COBERTURA = Object.freeze({
  capturada: "Capturada", en_curso: "En curso", pendiente: "Por dictar", sin_clase: "Sin clase",
  zoom_limit: "Zoom limit", dudosa: "Dudosa", sin_captura: "Sin captura", sin_sesion: "Sin sesión en el ETL",
});
// Clase CSS existente (globals.css) que pinta cada estado: el texto, no el color, es la pista principal.
export const CSS_COBERTURA = Object.freeze({
  capturada: "capturada", en_curso: "en_curso", pendiente: "pendiente", sin_clase: "pendiente", sin_sesion: "pendiente",
  zoom_limit: "sin_captura", dudosa: "sin_captura", sin_captura: "sin_captura",
});
const DE_CONFIANZA = { capturada: "capturada", en_curso: "en_curso", por_ocurrir: "pendiente", sin_clase: "sin_clase",
  zoom_limit: "zoom_limit", dudosa: "dudosa", sin_captura: "sin_captura" };
// Si una franja tuviera varias sesiones, manda la peor (mismo orden que lib/confianzaClase.mjs).
const PRIORIDAD = ["sin_captura", "zoom_limit", "dudosa", "en_curso", "pendiente", "sin_clase", "capturada"];
const SIN_CONFIABLE = new Set(["sin_captura", "zoom_limit", "dudosa"]);
const n0 = (v) => Number(v ?? 0) || 0;

export function estadoCobertura(sesionesDeFranja) {
  if (!sesionesDeFranja.length) return "sin_sesion";
  const estados = sesionesDeFranja.map((s) => DE_CONFIANZA[confianzaDeCaptura(s.estado_captura)] ?? "dudosa");
  return PRIORIDAD.find((e) => estados.includes(e)) ?? "dudosa";
}

export function calcularCobertura(franjas, sesiones) {
  const porSlot = new Map(franjas.map((f) => [f.slot_id, []]));
  let sinClase = 0;
  for (const s of sesiones) {
    const lista = porSlot.get(s.slot_id);
    if (lista) lista.push(s); else sinClase += 1;
  }
  const clases = franjas.map((f) => {
    const ses = porSlot.get(f.slot_id);
    const estado = estadoCobertura(ses);
    return {
      slot_id: f.slot_id, fecha: f.fecha, horario_texto: f.horario_texto, tipo: f.tipo, cuenta_zoom: f.cuenta_zoom,
      hora_inicio: f.hora_inicio, roster_n: f.roster_n, captura_automatica: f.captura_automatica, estado,
      estado_captura: ses.map((s) => s.estado_captura).filter(Boolean).join(", ") || null,
      // Personas del ETL: solo con dato (capturada / en curso); en los demas estados no hay cifra que mostrar.
      personas_roster: estado === "capturada" || estado === "en_curso" ? ses.reduce((a, s) => a + n0(s.personas_roster), 0) : null,
      personas_visita: estado === "capturada" || estado === "en_curso" ? ses.reduce((a, s) => a + n0(s.personas_visita), 0) : null,
      sesiones: ses.length,
    };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || n0(a.hora_inicio) - n0(b.hora_inicio) || a.slot_id.localeCompare(b.slot_id));
  const cuenta = (pred) => clases.filter(pred).length;
  return {
    clases,
    resumen: {
      programadas: clases.length,
      dictadas: cuenta((c) => c.estado !== "pendiente" && c.estado !== "sin_clase" && c.estado !== "sin_sesion"),
      capturadas: cuenta((c) => c.estado === "capturada"),
      en_curso: cuenta((c) => c.estado === "en_curso"),
      faltan: cuenta((c) => SIN_CONFIABLE.has(c.estado)),
      pendientes: cuenta((c) => c.estado === "pendiente"),
      sin_sesion: cuenta((c) => c.estado === "sin_sesion"),
    },
    sesiones_sin_clase: sinClase,
  };
}
