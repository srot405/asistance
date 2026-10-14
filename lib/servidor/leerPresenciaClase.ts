import "server-only";
import { asistioEnSemana, clasificar, tipoIngreso } from "../detalleCalculo.mjs";
import { contarPresencia, estadoPresenciaOficial } from "../presenciaTiempo.mjs";
import type { ConteosPresencia, EstadoPresencia, PresenciaClaseResponse, PresenciaNominal } from "../types";
import { cargarBase, semanaTieneDetalle } from "./leerDetalleSemana";
import { leerTiempoPersonasClase, leerTiempoReporte } from "./leerTiempo";

export { semanaTieneDetalle };

// TOC-146 (D2): la presencia ya no se calcula con eventos crudos de Zoom ni con otro umbral. Se deriva del veredicto oficial de tiempo
// (50 %, guardado por el backend en v_asist_tiempo_persona) cruzado con asist_entradas. Sin tiempo medido -> "sin_dato".
async function clasificarPresenciaFranja(semana: string, slotId: string) {
  if (!(await semanaTieneDetalle(semana))) throw new Error("Esta semana no tiene roster congelado (nivel distinto de Detalle)");
  const base = await cargarBase(semana);
  const franja = base.franjas.get(slotId);
  if (!franja) throw new Error("Franja no encontrada en esta semana");

  const rosterFranja = base.roster.filter((p) => p.slot_id === slotId && clasificar(p, base) === "medible");
  const tiempo = await leerTiempoPersonasClase(semana, slotId);
  const semanal = await leerTiempoReporte(semana);   // veredicto semanal por persona (mejor clase): da su % a los colados
  const detalle = rosterFranja.map((persona) => {
    const entro = asistioEnSemana(base, persona);
    const colado = entro && tipoIngreso(base, persona) === "colados";
    const propio = tiempo.get(persona.persona_id);
    // Un colado no tiene tiempo en SU clase: su % es el de la mejor clase a la que entro (veredicto semanal), nunca «sin dato» por eso.
    const sem = colado ? semanal.personas.get(persona.persona_id) : undefined;
    const t = colado
      ? (sem ? { estado_tiempo: sem.estado_tiempo, pct_tiempo: sem.mejor_pct, cumple_50: sem.cumple_50,
          minutos: sem.minutos_max == null ? null : Number(sem.minutos_max) } : undefined)
      : propio;
    return { persona_id: persona.persona_id, nombre: persona.nombre, ciudad: persona.ciudad,
      // Fase 1.3 (plan veracidad 2026-10-09): "entro" = MISMA regla unica del panel (asistioEnSemana: su clase o, colado,
      // otra de la semana). Asi "Nunca entro" de esta clase == porClase.nunca del calendario == filas del CSV "No ingresaron"
      // con ?franja. 2026-10-14: el colado se reporta como «colado» con el % de su mejor clase.
      estado: estadoPresenciaOficial(entro, propio, colado) as EstadoPresencia,
      minutos: t?.minutos ?? null, tiempo: t };
  });
  const colados = detalle.filter((d) => d.estado === "colado");
  return { franja, conteos: contarPresencia(detalle.map((d) => d.estado)) as ConteosPresencia, medible: rosterFranja.length, detalle,
    colados_con_pct: colados.filter((d) => d.tiempo?.pct_tiempo != null).length,
    colados_bajo_50: colados.filter((d) => d.tiempo?.estado_tiempo === "rojo_tiempo").length };
}

export async function leerPresenciaClase(semana: string, slotId: string): Promise<PresenciaClaseResponse> {
  const { franja, conteos, medible, colados_con_pct, colados_bajo_50 } = await clasificarPresenciaFranja(semana, slotId);
  return { semana, slot_id: slotId, fecha: franja.fecha, horario_texto: franja.horario_texto, medible, conteos, colados_con_pct, colados_bajo_50 };
}

// Nominal (PII): mismo patrón que listarAusentesDesdeBase en leerDetalleSemana.ts
// — el llamador es responsable de que solo salga por un CSV autenticado.
export async function listarPresenciaNominal(semana: string, slotId: string): Promise<PresenciaNominal[]> {
  const { detalle } = await clasificarPresenciaFranja(semana, slotId);
  return detalle.map(({ nombre, ciudad, estado, minutos, tiempo }) => ({ nombre, ciudad, estado, minutos,
    pct_tiempo: tiempo?.pct_tiempo ?? null, estado_tiempo: tiempo?.estado_tiempo ?? null, cumple_50: tiempo?.cumple_50 ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
