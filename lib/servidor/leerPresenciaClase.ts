import "server-only";
import { clasificar, entroEnFecha } from "../detalleCalculo.mjs";
import { contarPresencia, estadoPresenciaOficial } from "../presenciaTiempo.mjs";
import type { ConteosPresencia, EstadoPresencia, PresenciaClaseResponse, PresenciaNominal } from "../types";
import { cargarBase, semanaTieneDetalle } from "./leerDetalleSemana";
import { leerTiempoPersonasClase } from "./leerTiempo";

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
  const detalle = rosterFranja.map((persona) => {
    const t = tiempo.get(persona.persona_id);
    return { persona_id: persona.persona_id, nombre: persona.nombre, ciudad: persona.ciudad,
      estado: estadoPresenciaOficial(entroEnFecha(base, persona.persona_id, franja.fecha), t) as EstadoPresencia,
      minutos: t?.minutos ?? null, tiempo: t };
  });
  return { franja, conteos: contarPresencia(detalle.map((d) => d.estado)) as ConteosPresencia, medible: rosterFranja.length, detalle };
}

export async function leerPresenciaClase(semana: string, slotId: string): Promise<PresenciaClaseResponse> {
  const { franja, conteos, medible } = await clasificarPresenciaFranja(semana, slotId);
  return { semana, slot_id: slotId, fecha: franja.fecha, horario_texto: franja.horario_texto, medible, conteos };
}

// Nominal (PII): mismo patrón que listarAusentesDesdeBase en leerDetalleSemana.ts
// — el llamador es responsable de que solo salga por un CSV autenticado.
export async function listarPresenciaNominal(semana: string, slotId: string): Promise<PresenciaNominal[]> {
  const { detalle } = await clasificarPresenciaFranja(semana, slotId);
  return detalle.map(({ nombre, ciudad, estado, minutos, tiempo }) => ({ nombre, ciudad, estado, minutos,
    pct_tiempo: tiempo?.pct_tiempo ?? null, estado_tiempo: tiempo?.estado_tiempo ?? null, cumple_50: tiempo?.cumple_50 ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
