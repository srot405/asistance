import type { Code } from "../lib/types";
const items: Array<[Code, string, string, string]> = [
  ["V", "✓", "#2E9E5B", "Entró en su franja"],
  ["A", "↻", "#F2C230", "Recuperó en otra clase"],
  ["N", "↗", "#F08A24", "Visitó otra sala"],
  ["R?", "✕?", "#D64545", "No entró, provisional"],
  ["R", "✕", "#D64545", "No entró, semana cerrada"],
  ["ZL", "◼", "#2B4A6F", "Sin dato confiable"],
  ["P", "⧗", "#8294a3", "Sesión pendiente"],
  ["-", "·", "transparent", "Sin clase propia"],
];
export default function Leyenda() {
  return (
    <div className="legend" aria-label="Leyenda de estados">
      {items.map(([code, icon, color, rule]) => (
        <span className="legend-item" key={code}>
          <i className="dot" style={{ background: color }} />
          {icon} <b>{code}</b> {rule}
        </span>
      ))}
    </div>
  );
}
