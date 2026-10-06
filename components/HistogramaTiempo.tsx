import type { HistogramaTiempo as Histograma } from "../lib/tiempoContrato.d.mts";
import { ICONOS, MUESTRA_MINIMA } from "../lib/tiempoVista.mjs";

// % del tiempo de clase (solo medidos, sin nombres). Barras a la izquierda del corte de 50 % = rojo por tiempo
// (trama diagonal); a la derecha = cumple (liso). El 50 % exacto cae en la barra de 50-60 (cumple).
export default function HistogramaTiempo({ histograma }: { histograma: Histograma | null }) {
  if (!histograma) return <p className="nota" data-testid="histograma-suprimido">
    Muestra pequeña (menos de {MUESTRA_MINIMA} personas medidas): no se publica la distribución, solo los conteos.</p>;
  const ancho = 520, alto = 190, izq = 34, base = alto - 34, util = ancho - izq - 8;
  const max = Math.max(1, ...histograma.bins.map((b) => b.n));
  const w = util / histograma.bins.length;
  const x = (pct: number) => izq + (pct / 100) * util;
  return <figure className="hist-tiempo">
    <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" width="100%"
      aria-label={`Distribución del porcentaje del tiempo de clase de ${histograma.total} personas medidas, corte en ${histograma.corte} %`}>
      <defs><pattern id="trama-rojo" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="trama-fondo" /><rect width="3" height="6" className="trama-raya" /></pattern></defs>
      {histograma.bins.map((b, i) => {
        const h = (b.n / max) * (base - 14);
        return <g key={b.desde}>
          <rect x={izq + i * w + 1.5} y={base - h} width={w - 3} height={h} className={b.lado === "rojo" ? "hist-barra-rojo" : "hist-barra-cumple"}
            fill={b.lado === "rojo" ? "url(#trama-rojo)" : undefined} />
          {b.n > 0 && <text x={izq + i * w + w / 2} y={base - h - 3} textAnchor="middle" className="hist-valor">{b.n}</text>}
          <text x={izq + i * w} y={base + 14} textAnchor="middle" className="hist-eje">{b.desde}</text>
        </g>;
      })}
      <text x={izq + util} y={base + 14} textAnchor="middle" className="hist-eje">100</text>
      <line x1={x(histograma.corte)} x2={x(histograma.corte)} y1={6} y2={base} className="hist-corte" />
      <text x={x(histograma.corte) + 4} y={14} className="hist-corte-texto">{histograma.corte} %</text>
      <text x={izq + util / 2} y={alto - 4} textAnchor="middle" className="hist-eje">% del tiempo de su clase</text>
    </svg>
    <figcaption className="nota"><b>{ICONOS.rojo_tiempo}</b> barras a la izquierda de 50 % = rojo por tiempo · barras a la derecha = cumple.</figcaption>
    <table className="sr-only"><caption>Personas por tramo del % del tiempo de clase</caption>
      <thead><tr><th>Tramo</th><th>Lado</th><th>Personas</th></tr></thead>
      <tbody>{histograma.bins.map((b) => <tr key={b.desde}><td>{b.desde} a {b.hasta} %</td>
        <td>{b.lado === "rojo" ? "rojo por tiempo" : "cumple"}</td><td>{b.n}</td></tr>)}</tbody></table>
  </figure>;
}
