import { puntosTendencia, tramosTendencia, type PuntoTendencia } from "../lib/tendenciaGrafico.mjs";
import type { ResumenHistorico } from "../lib/types";

const ALTO = 200;
const MARGEN_SUP = 14;
const MARGEN_INF = 46;
const MARGEN_IZQ = 34;
const PASO_X = 74; // px por semana: bajo eso el eje se vuelve ilegible, así que se scrollea (ver .trend-chart-scroll)
const ALTO_UTIL = ALTO - MARGEN_SUP - MARGEN_INF;

const y = (valor: number) => MARGEN_SUP + ALTO_UTIL * (1 - valor / 100);
const porcentaje = (valor: number | null) => (valor == null ? "—" : `${valor.toFixed(1)} %`);

// Marcador de un punto graficable: la FORMA dice el nivel (Detalle=círculo,
// Solo semanal=cuadrado) para no depender solo del color; un anillo
// punteado adicional marca "mínimo" (captura incompleta: el % real es igual
// o mayor al mostrado, nunca un valor exacto).
function Marcador({ cx, cyValor, nivel, esMinimo, color }: {
  cx: number; cyValor: number; nivel: PuntoTendencia["nivel"]; esMinimo: boolean; color: string;
}) {
  const cy = y(cyValor);
  return <g>
    {esMinimo && <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={color} strokeWidth={1.4}
      strokeDasharray="2.5 2.5" opacity={0.8} />}
    {nivel === "Detalle"
      ? <circle cx={cx} cy={cy} r={4.2} fill={color} stroke="var(--card)" strokeWidth={1.2} />
      : <rect x={cx - 3.6} y={cy - 3.6} width={7.2} height={7.2} fill={color} stroke="var(--card)" strokeWidth={1.2} />}
  </g>;
}

// Gráfico de líneas de la evolución del % de retención (TOC-91, pedido de
// Samuel 2026-09-29): SVG/CSS propio, sin librería de gráficos — el proyecto
// ya usa el mismo criterio para el calendario (CalendarioSemana.tsx) y aquí el
// volumen de datos (unas pocas decenas de semanas como mucho) no justifica el
// peso de una dependencia nueva. Va ADEMÁS de las barras de texto de abajo,
// no en su reemplazo.
export default function TendenciaGrafico({ resultados }: { resultados: ResumenHistorico[] }) {
  const puntos = puntosTendencia(resultados);
  const tramos = tramosTendencia(puntos);
  const ancho = MARGEN_IZQ + Math.max(1, puntos.length - 1) * PASO_X + 24;

  return <div className="trend-chart">
    <div className="trend-chart-scroll">
      <svg className="trend-chart-svg" viewBox={`0 0 ${ancho} ${ALTO}`} width={ancho} height={ALTO}
        role="img" aria-labelledby="trend-chart-titulo" aria-describedby="trend-chart-tabla">
        <title id="trend-chart-titulo">Evolución semanal del porcentaje de ingreso y no ingreso</title>
        {[0, 25, 50, 75, 100].map((linea) => <g key={linea}>
          <line x1={MARGEN_IZQ} x2={ancho - 12} y1={y(linea)} y2={y(linea)} className="trend-chart-grid" />
          <text x={MARGEN_IZQ - 8} y={y(linea) + 3} className="trend-chart-eje-y" textAnchor="end">{linea}%</text>
        </g>)}

        {tramos.map((tramo, i) => {
          const puntosIn = tramo.map((p) => `${MARGEN_IZQ + p.indice * PASO_X},${y(p.valor as number)}`).join(" ");
          const puntosOut = tramo.map((p) => `${MARGEN_IZQ + p.indice * PASO_X},${y(100 - (p.valor as number))}`).join(" ");
          return <g key={i}>
            <polyline points={puntosOut} className="trend-chart-linea-out" />
            <polyline points={puntosIn} className="trend-chart-linea-in" />
          </g>;
        })}

        {puntos.map((punto) => {
          const cx = MARGEN_IZQ + punto.indice * PASO_X;
          if (!punto.graficable) return <g key={punto.semana + punto.materia}>
            <text x={cx} y={y(50)} textAnchor="middle" className="trend-chart-sin-dato" aria-hidden="true">✕</text>
            <text x={cx} y={ALTO - MARGEN_INF + 16} textAnchor="middle" className="trend-chart-eje-x">{punto.semana}</text>
          </g>;
          return <g key={punto.semana + punto.materia}>
            <title>{`${punto.semana} · ${punto.materia} · ${punto.nivel}${punto.esMinimo ? " · mínimo" : ""} · ` +
              `${porcentaje(punto.valor)} ingresaron`}</title>
            <Marcador cx={cx} cyValor={punto.valor as number} nivel={punto.nivel} esMinimo={punto.esMinimo}
              color="var(--green)" />
            <Marcador cx={cx} cyValor={100 - (punto.valor as number)} nivel={punto.nivel} esMinimo={punto.esMinimo}
              color="var(--orange)" />
            <text x={cx} y={ALTO - MARGEN_INF + 16} textAnchor="middle" className="trend-chart-eje-x">{punto.semana}</text>
          </g>;
        })}
      </svg>
    </div>

    <div className="trend-chart-legend" aria-hidden="true">
      <span><i className="in" />Ingresaron</span>
      <span><i className="out" />No ingresaron</span>
      <span><span className="trend-chart-muestra-detalle" />Detalle</span>
      <span><span className="trend-chart-muestra-semanal" />Solo semanal</span>
      <span><span className="trend-chart-muestra-minimo" />mínimo (anillo)</span>
      <span className="trend-chart-sin-dato-leyenda">✕ Sin dato (no se dibuja como 0%)</span>
    </div>

    <table className="sr-only" id="trend-chart-tabla">
      <caption>Evolución semanal del porcentaje de ingreso, en formato de tabla</caption>
      <thead><tr><th>Semana</th><th>Materia</th><th>Nivel</th><th>% ingresaron</th><th>Mínimo</th></tr></thead>
      <tbody>{puntos.map((p) => <tr key={p.semana + p.materia}>
        <td>{p.semana}</td><td>{p.materia}</td><td>{p.nivel}</td>
        <td>{p.graficable ? porcentaje(p.valor) : "Sin dato"}</td><td>{p.esMinimo ? "Sí" : "No"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
