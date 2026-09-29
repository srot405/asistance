// Conversión pura fecha+hora (COT, hora de Colombia, UTC-5 fijo, sin horario de
// verano) -> epoch ms. Espejo del mismo cálculo que ya usa el backend
// (backend/etl/historico_semanal.py y backend/etl/clasificar_semana.py):
// `datetime.combine(fecha, ..., tzinfo=COT) + timedelta(hours=hora)`.
//
// `asist_franjas.hora_inicio`/`hora_fin` son horas enteras del día en COT
// (smallint, ver backend/etl/migraciones/001_esquema.sql), por eso el único
// parámetro variable es la hora completa, sin minutos.
//
// Sin I/O: vive en .mjs para que scripts/test-horario-franja.mjs lo corra bajo
// Node sin type-stripping (mismo patrón que lib/detalleCalculo.mjs).

const COT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5

// `fechaISO`: "YYYY-MM-DD". `horaEntera`: hora del día en COT (0-23, ej. 18 = 18:00).
export function msDesdeFechaHoraCOT(fechaISO, horaEntera) {
  const base = Date.parse(`${fechaISO}T00:00:00Z`);
  if (Number.isNaN(base)) throw new RangeError(`fecha inválida: ${fechaISO}`);
  return base + horaEntera * 60 * 60 * 1000 + COT_OFFSET_MS;
}

// Límites [inicioMs, finMs] de una franja a partir de sus columnas crudas.
// `horaFin` puede venir null/undefined pese a que el esquema la declara
// `not null`: por defensividad se aplica el mismo default de 120 min que
// backend/etl/estado_presencia.py (DURACION_FRANJA_DEFECTO_MIN).
export function limitesFranjaMs(fechaISO, horaInicio, horaFin) {
  const inicioMs = msDesdeFechaHoraCOT(fechaISO, horaInicio);
  const finMs = horaFin == null ? inicioMs + 120 * 60 * 1000 : msDesdeFechaHoraCOT(fechaISO, horaFin);
  return { inicioMs, finMs };
}
