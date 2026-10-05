import "server-only";
import { clasificar, entroEnFecha } from "../detalleCalculo.mjs";
import { clasificarPresencia } from "../estadoPresencia.mjs";
import { eventosDemoParaPersona } from "../eventosPresenciaDemo.mjs";
import { limitesFranjaMs } from "../horarioFranja.mjs";
import { MODO_DEMO } from "../demo.js";
import type { ConteosPresencia, EstadoPresencia, PresenciaClaseResponse, PresenciaNominal } from "../types";
import { cargarBase, semanaTieneDetalle } from "./leerDetalleSemana";
import { supabaseServidor } from "./supabase";

export { semanaTieneDetalle };

// Ventana adicional alrededor de la franja para tolerar quien entra un poco
// antes o se queda pasado el cierre nominal, sin salirse tanto como para
// mezclar la clase siguiente en la misma cuenta Zoom. No es una franja de
// identidad (eso ya lo resolvió asist_entradas): solo delimita qué eventos
// crudos de zoom_live_log se consideran "de esta clase".
const MARGEN_ANTES_MIN = 20;
const MARGEN_DESPUES_MIN = 30;

type EventoCrudo = { evento: "joined" | "left"; hora_ms: number };

const normEmail = (valor: string | null | undefined) => (valor ?? "").trim().toLowerCase();

// zoom_live_log no tiene slot_id/sesion_id (ver docstring de
// backend/etl/estado_presencia.py): se filtra por ventana de tiempo y se
// agrupa por correo normalizado. Como el llamador solo pide eventos para
// personas que YA se sabe que entraron a ESTA franja (asist_entradas), el
// correo alcanza para atribuir el evento sin necesitar resolver sala/cuenta.
async function eventosRealesPorCorreo(inicioMs: number, finMs: number): Promise<Map<string, EventoCrudo[]>> {
  const desde = inicioMs - MARGEN_ANTES_MIN * 60000;
  const hasta = finMs + MARGEN_DESPUES_MIN * 60000;
  const { data, error } = await supabaseServidor().from("zoom_live_log")
    .select("correo,evento,hora_ms")
    .in("evento", ["joined", "left"])
    .gte("hora_ms", desde)
    .lt("hora_ms", hasta);
  if (error) throw error;
  const porCorreo = new Map<string, EventoCrudo[]>();
  for (const fila of (data ?? []) as { correo: string | null; evento: "joined" | "left"; hora_ms: number }[]) {
    const correo = normEmail(fila.correo);
    if (!correo) continue;
    const lista = porCorreo.get(correo) ?? [];
    lista.push({ evento: fila.evento, hora_ms: fila.hora_ms });
    porCorreo.set(correo, lista);
  }
  return porCorreo;
}

async function clasificarPresenciaFranja(semana: string, slotId: string) {
  if (!(await semanaTieneDetalle(semana))) throw new Error("Esta semana no tiene roster congelado (nivel distinto de Detalle)");
  const base = await cargarBase(semana);
  const franja = base.franjas.get(slotId);
  if (!franja) throw new Error("Franja no encontrada en esta semana");
  const { inicioMs, finMs } = limitesFranjaMs(franja.fecha, franja.hora_inicio ?? 0, franja.hora_fin ?? null);

  const rosterFranja = base.roster.filter((p) => p.slot_id === slotId && clasificar(p, base) === "medible");
  const eventosPorCorreo = MODO_DEMO ? null : await eventosRealesPorCorreo(inicioMs, finMs);

  const conteos: ConteosPresencia = { presente: 0, entro_y_salio: 0, nunca_entro: 0 };
  let sinEvidencia = 0;
  const detalle: Array<{ nombre: string; ciudad: string; estado: EstadoPresencia; minutos: number | null }> = [];

  for (const persona of rosterFranja) {
    if (!entroEnFecha(base, persona.persona_id, franja.fecha)) {
      conteos.nunca_entro += 1;
      detalle.push({ nombre: persona.nombre, ciudad: persona.ciudad, estado: "nunca_entro", minutos: 0 });
      continue;
    }
    const eventos = MODO_DEMO
      ? eventosDemoParaPersona(persona.persona_id, inicioMs, finMs)
      : eventosPorCorreo?.get(normEmail(persona.correo_norm));
    if (!eventos || eventos.length === 0) {
      // Entró (lo dice asist_entradas) pero no hay evento crudo localizable:
      // conservador, se cuenta como "entró y salió" sin inventar minutos.
      sinEvidencia += 1;
      conteos.entro_y_salio += 1;
      detalle.push({ nombre: persona.nombre, ciudad: persona.ciudad, estado: "entro_y_salio", minutos: null });
      continue;
    }
    const resultado = clasificarPresencia(eventos, inicioMs, finMs);
    conteos[resultado.estado as EstadoPresencia] += 1;
    detalle.push({ nombre: persona.nombre, ciudad: persona.ciudad, estado: resultado.estado as EstadoPresencia,
      minutos: resultado.minutos });
  }

  return { franja, conteos, medible: rosterFranja.length, sinEvidencia, detalle };
}

export async function leerPresenciaClase(semana: string, slotId: string): Promise<PresenciaClaseResponse> {
  const { franja, conteos, medible, sinEvidencia } = await clasificarPresenciaFranja(semana, slotId);
  return {
    semana, slot_id: slotId, fecha: franja.fecha, horario_texto: franja.horario_texto,
    medible, conteos, sin_evidencia: sinEvidencia,
  };
}

// Nominal (PII): mismo patrón que listarAusentesDesdeBase en leerDetalleSemana.ts
// — el llamador es responsable de que solo salga por un CSV autenticado.
export async function listarPresenciaNominal(semana: string, slotId: string): Promise<PresenciaNominal[]> {
  const { detalle } = await clasificarPresenciaFranja(semana, slotId);
  return detalle.map(({ nombre, ciudad, estado, minutos }) => ({ nombre, ciudad, estado, minutos }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
