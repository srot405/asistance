// Estados de la celda SEMANAL (§4.6 del plan). Son un conjunto distinto al del
// día a día: aquí no hay "entró a otra sala", porque la semana solo responde
// "¿asistió a algo?".
//
// Por qué existe este archivo (2026-09-21): la vista semanal imprimía el código
// crudo en texto plano, así que `ZL` —"no pudimos medir su franja"— se leía
// igual que `NO` —"no asistió"—. Eso es acusar de ausente a alguien que nunca
// medimos, y en las 4 semanas históricas hay sesiones enteras sin captura.
//
// El icono acompaña al color a propósito: la información no puede depender solo
// del color (misma regla que la leyenda del día a día).
export type EstadoSemana = "SI" | "NO" | "NO?" | "ZL" | "P" | "-";

export const ESTADOS_SEMANA: Record<
  EstadoSemana,
  { icono: string; color: string; texto: string }
> = {
  SI: { icono: "✓", color: "#2E9E5B", texto: "Entró a alguna sesión de la semana" },
  NO: { icono: "✕", color: "#D64545", texto: "No entró a ninguna, semana cerrada" },
  "NO?": { icono: "✕?", color: "#D64545", texto: "No entró a ninguna, semana aún abierta" },
  ZL: { icono: "◼", color: "#2B4A6F", texto: "Sin dato: su franja no se pudo medir" },
  P: { icono: "⧗", color: "#8294a3", texto: "Su franja aún no ocurre" },
  "-": { icono: "·", color: "transparent", texto: "Sin clase propia" },
};

export function estadoSemana(codigo: string | undefined) {
  return ESTADOS_SEMANA[(codigo ?? "-") as EstadoSemana] ?? ESTADOS_SEMANA["-"];
}
