import { colorPermanencia } from "../lib/permanencia.mjs";
import { porcentajeUnDecimal } from "../lib/tiempoVista.mjs";
export const ESTILO = {
  rojo: { color: "#991b1b", background: "#fee2e2" },
  amarillo: { color: "#713f12", background: "#fef08a" },
  verde: { color: "#14532d", background: "#dcfce7" },
  sin_dato: { color: "#374151", background: "#f3f4f6" },
};
export default function Permanencia({ pct }: { pct: number | null | undefined }) {
  const color = colorPermanencia(pct);
  return <span style={{ ...ESTILO[color], padding: "0.2rem 0.4rem", borderRadius: "0.25rem" }}>
    {color === "sin_dato" ? "Sin dato" : `${porcentajeUnDecimal(pct ?? null)} · ${color}`}
  </span>;
}
