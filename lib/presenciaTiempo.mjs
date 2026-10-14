// Estado de PRESENCIA de una persona en una clase derivado del criterio OFICIAL de tiempo (TOC-146, decision D2).
// Sin I/O. No recalcula ninguna regla: el 50 % lo aplico el backend (cumple_50 / estado_tiempo en v_asist_tiempo_persona);
// aqui solo se traduce ese veredicto guardado a las palabras de la pestana Presencia. El 70 % del reporte en vivo ya no se usa.
import { ESTADO_TIEMPO } from "./tiempoVista.mjs";

export const PRESENCIA = Object.freeze({ PRESENTE: "presente", PARCIAL: "parcial", NUNCA_ENTRO: "nunca_entro", SIN_DATO: "sin_dato", COLADO: "colado" });

// entro: segun asist_entradas, con la regla unica del panel (asistioEnSemana: entro a su clase o a otra de la semana). tiempo: fila de v_asist_tiempo_persona de SU clase (o undefined).
// Quien entro pero no tiene tiempo medido NUNCA cae en Parcial ni en Nunca entro: queda "sin_dato".
// 2026-10-14: un COLADO (entro solo a otra clase de la semana) tiene su % de estancia en esa otra clase: no es «sin dato». Se reporta
// aparte («Entro a otra clase») con el % de su mejor clase (veredicto semanal), para que ninguna persona que ingreso quede sin su %.
export function estadoPresenciaOficial(entro, tiempo, esColado = false) {
  if (!entro) return PRESENCIA.NUNCA_ENTRO;
  if (esColado) return PRESENCIA.COLADO;
  if (tiempo?.estado_tiempo === ESTADO_TIEMPO.CUMPLE) return PRESENCIA.PRESENTE;
  if (tiempo?.estado_tiempo === ESTADO_TIEMPO.ROJO) return PRESENCIA.PARCIAL;
  return PRESENCIA.SIN_DATO;
}

export function contarPresencia(estados) {
  const c = { presente: 0, parcial: 0, nunca_entro: 0, sin_dato: 0, colado: 0 };
  for (const e of estados) c[e] += 1;
  return c;
}
