import "server-only";
import { asistioEnSemana, clasificar, tipoIngreso } from "../detalleCalculo.mjs";
import { contarPresencia, estadoPresenciaOficial } from "../presenciaTiempo.mjs";
import type { ConteosPresencia, EstadoPresencia, PresenciaClaseResponse, PresenciaNominal } from "../types";
import { cargarBase, semanaConPersonas, semanaTieneDetalle } from "./leerDetalleSemana";
import { leerTiempoPersonasClase, leerTiempoReporte } from "./leerTiempo";
import { colorPermanencia, ingresoClase, resumirPermanencia, textoIngreso } from "../permanencia.mjs";

export { semanaConPersonas, semanaTieneDetalle };

// TOC-152: ingreso independiente del tiempo. Categorías TOC-146 conservadas solo por compatibilidad.
async function clasificarPresenciaFranja(semana: string, slotId: string) {
  const gate = await semanaConPersonas(semana);
  if (!gate.ok) throw new Error("Esta semana no tiene detalle por persona");
  const reconstruida = gate.reconstruida;
  const base = await cargarBase(semana);
  const franja = base.franjas.get(slotId);
  if (!franja) throw new Error("Franja no encontrada en esta semana");

  const rosterFranja = base.roster.filter((p) => p.slot_id === slotId);
  const tiempo = await leerTiempoPersonasClase(semana, slotId);
  const semanal = await leerTiempoReporte(semana);   // veredicto semanal por persona (mejor clase): da su % a los colados
  const detalle = rosterFranja.map((persona) => {
    const entro = asistioEnSemana(base, persona);
    if (reconstruida) {
      // Semana reconstruida: la clase de cada persona es la asignacion ACTUAL, asi que no se separa «su clase» / «colado». Cada persona
      // se muestra con su estado SEMANAL (mejor clase): ingreso con su %, o no ingreso (esto ultimo es semanal y si vale).
      const sem = semanal.personas.get(persona.persona_id);
      const ts = sem ? { estado_tiempo: sem.estado_tiempo, pct_tiempo: sem.mejor_pct, cumple_50: sem.cumple_50,
        minutos: sem.minutos_max == null ? null : Number(sem.minutos_max) } : undefined;
      const ingreso = entro || Boolean(sem) ? true : base.celdaPorPersona.get(persona.persona_id) === "NO" ? false : null;
      return { persona_id: persona.persona_id, nombre: persona.nombre, ciudad: persona.ciudad,
        ingreso, pct: ts?.pct_tiempo ?? null,
        estado: estadoPresenciaOficial(entro, ts, false) as EstadoPresencia, minutos: ts?.minutos ?? null, tiempo: ts };
    }
    const colado = entro && tipoIngreso(base, persona) === "colados";
    const propio = tiempo.get(persona.persona_id);
    // Una entrada de 0.5 s puede truncarse a 0 %: la existencia del ingreso manda.
    // Un colado conserva el ingreso semanal, pero NO marca Sí en la clase que no visitó.
    const entroClase = Boolean(base.entradaSlotPorPersona.get(persona.persona_id)?.has(slotId));
    const capturada = base.sesiones.some((s) => s.slot_id === slotId &&
      ["capturada", "recuperada_api", "recuperada_csv"].includes(s.estado_captura ?? ""));
    const ingreso = ingresoClase(entroClase, Boolean(propio), capturada);
    // Un colado no tiene tiempo en SU clase: su % es el de la mejor clase a la que entro (veredicto semanal), nunca «sin dato» por eso.
    const sem = colado ? semanal.personas.get(persona.persona_id) : undefined;
    const t = colado
      ? (sem ? { estado_tiempo: sem.estado_tiempo, pct_tiempo: sem.mejor_pct, cumple_50: sem.cumple_50,
          minutos: sem.minutos_max == null ? null : Number(sem.minutos_max) } : undefined)
      : propio;
    return { persona_id: persona.persona_id, nombre: persona.nombre, ciudad: persona.ciudad,
      ingreso, pct: propio?.pct_tiempo ?? null,
      // Fase 1.3 (plan veracidad 2026-10-09): "entro" = MISMA regla unica del panel (asistioEnSemana: su clase o, colado,
      // otra de la semana). Asi "Nunca entro" de esta clase == porClase.nunca del calendario == filas del CSV "No ingresaron"
      // con ?franja. 2026-10-14: el colado se reporta como «colado» con el % de su mejor clase.
      estado: estadoPresenciaOficial(entro, propio, colado) as EstadoPresencia,
      minutos: t?.minutos ?? null, tiempo: t };
  });
  const colados = detalle.filter((d) => d.estado === "colado");
  return { franja, reconstruida, ...resumirPermanencia(detalle),
    conteos: contarPresencia(detalle.map((d) => d.estado)) as ConteosPresencia, medible: rosterFranja.length, detalle,
    colados_con_pct: colados.filter((d) => d.tiempo?.pct_tiempo != null).length,
    colados_bajo_50: colados.filter((d) => d.tiempo?.estado_tiempo === "rojo_tiempo").length };
}

export async function leerPresenciaClase(semana: string, slotId: string): Promise<PresenciaClaseResponse> {
  const { franja, conteos, medible, colados_con_pct, colados_bajo_50, reconstruida, ingreso, permanencia } = await clasificarPresenciaFranja(semana, slotId);
  return { semana, slot_id: slotId, fecha: franja.fecha, horario_texto: franja.horario_texto, medible, conteos, colados_con_pct, colados_bajo_50, reconstruida, ingreso, permanencia };
}

// Lista de clases de la semana para el selector de Presencia en semanas SIN detalle por dia (reconstruidas): misma base, solo franjas.
export async function listarFranjasPresencia(semana: string) {
  const gate = await semanaConPersonas(semana);
  if (!gate.ok) throw new Error("Esta semana no tiene detalle por persona");
  const base = await cargarBase(semana);
  return [...base.franjas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.slot_id.localeCompare(b.slot_id))
    .map((f) => ({ slot_id: f.slot_id, fecha: f.fecha, cuenta_zoom: f.cuenta_zoom, horario_texto: f.horario_texto }));
}

// Nominal (PII): mismo patrón que listarAusentesDesdeBase en leerDetalleSemana.ts
// — el llamador es responsable de que solo salga por un CSV autenticado.
export async function listarPresenciaNominal(semana: string, slotId: string): Promise<PresenciaNominal[]> {
  const { detalle } = await clasificarPresenciaFranja(semana, slotId);
  return detalle.map(({ nombre, ciudad, estado, minutos, tiempo, ingreso, pct }) => ({ nombre, ciudad, estado, minutos,
    ingreso: textoIngreso(ingreso), color_permanencia: ingreso === true ? colorPermanencia(pct) : "sin_dato",
    pct_tiempo: tiempo?.pct_tiempo ?? null, estado_tiempo: tiempo?.estado_tiempo ?? null, cumple_50: tiempo?.cumple_50 ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
