// Espejo deliberado de backend/etl/estado_presencia.py — mismo umbral, mismo
// criterio de cierre de intervalos. Vive en .mjs -- no en .ts -- a propósito:
// así scripts/test-estado-presencia.mjs (y el test de contrato contra Python,
// scripts/test-estado-presencia-contrato.mjs) lo pueden importar y correr bajo
// Node sin depender de type-stripping (mismo patrón que lib/detalleCalculo.mjs).
//
// Clasifica la presencia de una persona en una sesión YA CERRADA en las mismas
// 3 categorías del reporte en vivo por correo (admin-usable,
// scripts/zoom-asistencia/reporte_15min.py, `_filas_roster_desde_live()`):
// 🟢 Presente · 🟠 Entró y salió · 🔴 Nunca entró. Ese reporte mide un instante
// (saldo joined-left > 0 AHORA); una clase cerrada ya no tiene "ahora", así que
// aquí la misma idea se traduce a cuánto tiempo se quedó cada persona.
//
// Cierre de intervalos: mismo criterio que
// admin-usable/scripts/zoom-asistencia/nodo-calcular-momentos-dorados.js
// (`porcentajeAsistencia()`): fusionar reconexiones solapadas y recortar a
// [inicio_franja, fin_franja]. Una entrada sin salida se cierra al fin de la
// franja; una salida sin entrada previa se ignora.

export const UMBRAL_PRESENTE = 0.70;

// Mismo default documentado para cierre_clase.py del plan F3 (admin-usable,
// plan-asistencia-limpia-cierre-clase-codex-2026-09-24.md) -- ese script no
// existe todavía, solo se reutiliza el mismo criterio.
export const DURACION_FRANJA_DEFECTO_MIN = 120;

export const ESTADO_PRESENTE = "presente";
export const ESTADO_ENTRO_Y_SALIO = "entro_y_salio";
export const ESTADO_NUNCA_ENTRO = "nunca_entro";

const EVENTOS_VALIDOS = new Set(["joined", "left"]);

function fusionarIntervalos(intervalos) {
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
  const fusionados = [];
  for (const [inicio, fin] of ordenados) {
    const ultimo = fusionados[fusionados.length - 1];
    if (ultimo && inicio <= ultimo[1]) {
      if (fin > ultimo[1]) ultimo[1] = fin;
    } else {
      fusionados.push([inicio, fin]);
    }
  }
  return fusionados;
}

// A partir de eventos {evento: "joined"|"left", hora_ms} (sin ordenar, de UNA
// persona en UNA sesión), arma los intervalos [entrada, salida] en ms. Ver
// docstring del módulo para las reglas de cierre.
export function construirIntervalos(eventos, finFranjaMs) {
  const ordenados = [...eventos].sort((a, b) => a.hora_ms - b.hora_ms);
  const intervalos = [];
  let abierto = null;
  for (const evt of ordenados) {
    const tipo = evt.evento;
    const ts = evt.hora_ms;
    if (tipo === "joined") {
      if (abierto === null) abierto = ts;
    } else if (tipo === "left") {
      if (abierto !== null) { intervalos.push([abierto, ts]); abierto = null; }
    } else {
      throw new RangeError(`evento no reconocido: ${JSON.stringify(tipo)}`);
    }
  }
  if (abierto !== null) intervalos.push([abierto, finFranjaMs]);
  return intervalos;
}

// Minutos que la persona estuvo conectada DENTRO de [inicioFranjaMs,
// finFranjaMs]. Nunca negativo.
export function minutosEnSala(eventos, inicioFranjaMs, finFranjaMs) {
  const intervalos = construirIntervalos(eventos, finFranjaMs);
  const recortados = [];
  for (const [inicio, fin] of intervalos) {
    const desde = Math.max(inicio, inicioFranjaMs);
    const hasta = Math.min(fin, finFranjaMs);
    if (hasta > desde) recortados.push([desde, hasta]);
  }
  const fusionados = fusionarIntervalos(recortados);
  const msTotal = fusionados.reduce((acc, [inicio, fin]) => acc + (fin - inicio), 0);
  return msTotal / 60000;
}

function redondear2(valor) {
  return Math.round(valor * 100) / 100;
}

// Clasifica la presencia de una persona en una sesión cerrada. Devuelve
// {estado, minutos, porcentaje}. `porcentaje` es null si la franja no tiene
// duración positiva.
export function clasificarPresencia(eventos, inicioFranjaMs, finFranjaMs) {
  for (const evt of eventos) {
    if (!EVENTOS_VALIDOS.has(evt.evento)) throw new RangeError(`evento no reconocido: ${JSON.stringify(evt.evento)}`);
  }
  const tieneJoined = eventos.some((evt) => evt.evento === "joined");
  if (!tieneJoined) return { estado: ESTADO_NUNCA_ENTRO, minutos: 0, porcentaje: 0 };
  const minutos = minutosEnSala(eventos, inicioFranjaMs, finFranjaMs);
  const duracionMin = (finFranjaMs - inicioFranjaMs) / 60000;
  if (duracionMin <= 0) return { estado: ESTADO_ENTRO_Y_SALIO, minutos: redondear2(minutos), porcentaje: null };
  const ratio = minutos / duracionMin;
  const estado = ratio >= UMBRAL_PRESENTE ? ESTADO_PRESENTE : ESTADO_ENTRO_Y_SALIO;
  return { estado, minutos: redondear2(minutos), porcentaje: redondear2(ratio * 100) };
}

// Resuelve el fin de una franja cuando falta hora_fin: hora_inicio +
// minutos_defecto (120). Helper para quien arma los límites antes de llamar a
// clasificarPresencia -- esa función siempre recibe límites explícitos.
export function duracionFranjaMs(horaInicioMs, horaFinMs, minutosDefecto = DURACION_FRANJA_DEFECTO_MIN) {
  if (horaFinMs != null) return horaFinMs;
  return horaInicioMs + minutosDefecto * 60000;
}

// Aplica clasificarPresencia a varias personas de una misma sesión.
// `eventosPorPersona`: Map o { persona_id: eventos[] }. Devuelve
// {conteos: {presente, entro_y_salio, nunca_entro}, detalle: {persona_id: resultado}}.
export function clasificarGrupo(eventosPorPersona, inicioFranjaMs, finFranjaMs) {
  const detalle = {};
  const conteos = { [ESTADO_PRESENTE]: 0, [ESTADO_ENTRO_Y_SALIO]: 0, [ESTADO_NUNCA_ENTRO]: 0 };
  const entradas = eventosPorPersona instanceof Map ? eventosPorPersona.entries() : Object.entries(eventosPorPersona);
  for (const [personaId, eventos] of entradas) {
    const resultado = clasificarPresencia(eventos, inicioFranjaMs, finFranjaMs);
    detalle[personaId] = resultado;
    conteos[resultado.estado] += 1;
  }
  return { conteos, detalle };
}
