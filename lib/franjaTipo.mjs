// Día de la semana de una franja/fecha. Se usa solo internamente, para decidir si un día
// es sábado o no (semanaSinSabado, abajo) -- ya NO hay marca visual por clase individual:
// el pedido original de hoy (estrella + color en franjas entre semana sueltas, tenga o no
// sábado esa semana) se retiró más tarde (corrección de Samuel, misma sesión, 2026-09-29):
// confundía con la marca de SEMANA completa de abajo. Cálculo puro, sin I/O, mismo patrón
// que lib/horarioFranja.mjs -- para que scripts/test-franja-tipo.mjs lo corra bajo Node
// sin depender de type-stripping.
export function esFranjaPresencial(fecha) {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0=domingo … 6=sábado
  return dia !== 6;
}

// Marca de SEMANA (no de clase individual) cuyo sábado no tuvo clase regular (corrección
// de Samuel, 2026-09-29): el caso real que importa es "esta semana el sábado no computó",
// como 2026-08-24/2026-09-21 -- ver claude_sessions.md.
export const ICONO_SIN_SABADO = "◆";
export const ETIQUETA_SIN_SABADO = "sin sábado";

// Decide si `fila` (un ResumenHistorico) es una semana "sin sábado", con datos reales,
// nunca por fecha fija. Verificado 2026-09-29 contra Supabase real (--dry-run de
// historico_semanal.py, no solo el fixture demo):
//
// - Solo es fiable a nivel "Detalle": ahí `detalle_dias`/`detalle_clases` listan
//   ÚNICAMENTE los días que de verdad tuvieron clase (backend/etl/historico_semanal.py
//   ::_detalle itera sobre `fechasActivas`, no sobre el calendario completo), así que la
//   AUSENCIA de cualquier fecha de sábado en esa lista es la señal directa de "el sábado
//   no tuvo clase esta semana". `cuadre.sin_clase > 0` confirma que ese hueco de verdad
//   dejó a alguien del roster fuera.
// - Semana en curso (falso positivo real, hallado con la semana 2026-09-28 contra
//   Supabase: roster=720, sin_clase=720, detalle_dias=[] porque todavía no ha ocurrido
//   NINGÚN día, ni siquiera los de entre semana -- no es que el sábado no tenga clase,
//   es que la semana apenas empieza): no se marca mientras el sábado de esa semana
//   (lunes de `fila.semana` + 5 días) no haya terminado todavía en hora COT.
// - Para no confundir "el sábado no tuvo clase esta semana" con "esta materia nunca da
//   clase el sábado" (falso positivo), se exige que OTRA semana de la MISMA materia en
//   `resultados` sí muestre un sábado activo -- así "sábado normal" se aprende de los
//   datos reales de ese mismo curso, nunca de una fecha hardcodeada.
// - Cobertura incompleta por otro motivo (falso positivo, ej. la cuenta de soporte
//   perdió la captura del viernes Y el sábado): se exige que los días entre semana YA
//   capturados en `fila` sean al menos tantos como los de la semana hermana usada como
//   referencia -- si son MENOS, lo más probable es que falte captura en general, no que
//   el sábado específicamente no haya tenido clase.
// - A nivel "Solo semanal"/"Sin dato" no había señal suficiente con solo `detalle_dias`
//   (viene null incluso en semanas con roster reconstruido) -- por eso el backend expone
//   ahora `sabado_excluido` directo (migración 078, `historico_semanal.py::_cobertura()`,
//   2026-09-29): si la fila ya lo trae (boolean, no `undefined`), se usa tal cual y cubre
//   TODOS los niveles, incluido 2026-08-24. El heurístico de abajo queda como respaldo
//   solo mientras la migración 078 no esté aplicada/recargada en producción.
export function semanaSinSabado(fila, resultados = [], ahora = new Date()) {
  if (!fila) return false;
  if (typeof fila.sabado_excluido === "boolean") return fila.sabado_excluido;
  if (fila.nivel !== "Detalle") return false;
  if (!(Number(fila.cuadre?.sin_clase) > 0)) return false;
  const dias = fila.detalle_dias ?? [];
  const entreSemana = dias.filter((dia) => esFranjaPresencial(dia.fecha));
  if (entreSemana.length !== dias.length) return false; // hay una fecha de sábado activa: sí tuvo clase

  const lunes = new Date(`${fila.semana}T00:00:00-05:00`);
  const finDelSabado = new Date(lunes.getTime() + 6 * 86400000); // domingo 00:00 COT: el sábado ya cerró
  if (ahora.getTime() < finDelSabado.getTime()) return false; // semana en curso: el sábado aún no ocurre

  const hermanas = resultados.filter((otra) => otra !== fila && otra.materia === fila.materia && otra.nivel === "Detalle");
  const hermanaConSabado = hermanas.find((otra) => (otra.detalle_dias ?? []).some((dia) => !esFranjaPresencial(dia.fecha)));
  if (!hermanaConSabado) return false; // esta materia nunca muestra un sábado activo: no se puede aprender el patrón
  const entreSemanaHermana = (hermanaConSabado.detalle_dias ?? []).filter((dia) => esFranjaPresencial(dia.fecha)).length;
  return entreSemana.length >= entreSemanaHermana;
}
