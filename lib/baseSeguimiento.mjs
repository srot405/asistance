// Texto de la base del denominador semanal (TOC-136, 2026-10-06): el denominador es el total REAL de
// Seguimiento al congelar la semana (asist_roster), no el roster estimado del Horario Maestro.
// Puro, sin I/O. congeladaEn: ISO de asist_semanas.congelada_en (se muestra DD/MM en hora de Colombia).
export function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit" })
    .formatToParts(d);
  const get = (t) => partes.find((p) => p.type === t)?.value ?? "";
  return `${get("day").padStart(2, "0")}/${get("month").padStart(2, "0")}`;
}

export function textoBaseSeguimiento(n, congeladaEn, { reconstruida = false } = {}) {
  if (n == null) return "";
  const fecha = fechaCorta(congeladaEn);
  const verbo = reconstruida ? "reconstruido" : "congelado";
  return `Seguimiento: ${n} estudiantes${fecha ? ` (${verbo} el ${fecha})` : ""}`;
}
