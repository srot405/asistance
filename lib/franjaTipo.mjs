// Distingue franjas entre semana ("presenciales", según Samuel: normalmente menor
// población que el bloque completo del sábado) de las franjas de sábado. Se deriva del
// día de la semana de `fecha` (no del texto de `slot_id`/`horario_texto`, para no
// depender de que "sábado" esté escrito igual en todos lados). Cálculo puro, sin I/O,
// mismo patrón que lib/horarioFranja.mjs -- para que scripts/test-franja-tipo.mjs lo
// corra bajo Node sin depender de type-stripping.
export function esFranjaPresencial(fecha) {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0=domingo … 6=sábado
  return dia !== 6;
}

export const ESTRELLA_PRESENCIAL = "★";
