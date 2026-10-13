"use client";
import { useId } from "react";
import {
  barrasDia, coladosProvisionales, marcasEje, maximoDia, puntosSemana, SERIES_POR_MODO, techoEje, valorPunto,
  type BarraClase, type ModoGrafica, type PuntoSemana, type SerieGrafica,
} from "../lib/graficasCalendario.mjs";
import type { DetalleSemanaResponse } from "../lib/types";

// Gráficas del calendario (TOC-91, plan 2026-10-12 «Gráficas del calendario»). SVG propio, sin librería (mismo
// criterio que TendenciaGrafico.tsx / HistogramaTiempo.tsx). Solo agregados: nunca nombres. Cifras = las mismas de
// detalle.porDia / detalle.porClase (lib/graficasCalendario.mjs no recalcula nada).
//   - Sin día elegido: líneas, un punto por día de clase. Azul = horario, amarillo = colados, total en «sumados».
//   - Día elegido: una barra por clase. Gris = roster medible, azul = horario, amarillo = colados (encima del azul).
//   - Semana abierta: los colados van con trama/borde punteado («se completan al cerrar la semana»).

const NOMBRE: Record<SerieGrafica, string> = { horario: "Horario correcto", colados: "Colados", ambos: "Total (horario + colados)" };
const ANCHO = 640, ALTO = 230, IZQ = 40, DER = 44, SUP = 16, INF = 40;
const UTIL_X = ANCHO - IZQ - DER, UTIL_Y = ALTO - SUP - INF, BASE = ALTO - INF;
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} %`);

function Eje({ techo, sufijo = "" }: { techo: number; sufijo?: string }) {
  const y = (v: number) => BASE - (v / techo) * UTIL_Y;
  return <g aria-hidden="true">
    {marcasEje(techo).map((m) => <g key={m}>
      <line x1={IZQ} x2={ANCHO - DER + 8} y1={y(m)} y2={y(m)} className="cal-graf-grid" />
      <text x={IZQ - 6} y={y(m) + 3} textAnchor="end" className="cal-graf-eje">{m}{sufijo}</text>
    </g>)}
  </g>;
}

function Leyenda({ series, provisional, conRoster }: { series: SerieGrafica[]; provisional: boolean; conRoster: boolean }) {
  return <div className="cal-graf-leyenda" aria-hidden="true">
    {conRoster && <span><i className="m-roster" />Roster medible</span>}
    {series.map((s) => <span key={s}><i className={`m-${s}${s === "colados" && provisional ? " provisional" : ""}`} />
      {NOMBRE[s]}{s === "colados" && provisional ? " (provisional)" : ""}</span>)}
  </div>;
}

function Lineas({ puntos, modo, provisional, etiquetaDia, tramaId }: {
  puntos: PuntoSemana[]; modo: ModoGrafica; provisional: boolean; etiquetaDia: (f: string) => string; tramaId: string;
}) {
  const series = SERIES_POR_MODO[modo];
  // Eje fijo 0–100 %: cada punto es el % del roster medible de SU día (ver valorPunto).
  const techo = 100;
  const paso = puntos.length > 1 ? UTIL_X / (puntos.length - 1) : 0;
  const x = (i: number) => (puntos.length > 1 ? IZQ + i * paso : IZQ + UTIL_X / 2);
  const y = (v: number) => BASE - (v / techo) * UTIL_Y;
  // Etiqueta directa solo en el último punto de cada serie, separadas si chocan.
  const finales = series.map((s) => {
    const ultimo = [...puntos].reverse().find((p) => valorPunto(p, s) != null);
    const v = ultimo ? valorPunto(ultimo, s) : null;
    return ultimo && v != null ? { s, v, yy: y(v), xx: x(ultimo.indice) } : null;
  }).filter((f): f is { s: SerieGrafica; v: number; yy: number; xx: number } => f !== null).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < finales.length; i++) if (finales[i].yy - finales[i - 1].yy < 11) finales[i].yy = finales[i - 1].yy + 11;

  const resumen = puntos.map((p) => `${etiquetaDia(p.fecha)}: ${p.en_curso ? "en curso" : series.map((s) =>
    `${NOMBRE[s]} ${pct(valorPunto(p, s))} (${p[s] ?? "—"} de ${p.poblacion})`).join(", ")}`).join("; ");
  return <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" className="cal-graf-svg" role="img"
    aria-label={`Ingresos por día de la semana, % del roster medible de cada día. ${resumen}.${provisional ? " Colados provisionales: se completan al cerrar la semana." : ""}`}>
    <Eje techo={techo} sufijo="%" />
    {series.map((s) => {
      const conDato = puntos.filter((p) => valorPunto(p, s) != null);
      const prov = s === "colados" && provisional;
      return <polyline key={s} points={conDato.map((p) => `${x(p.indice)},${y(valorPunto(p, s) as number)}`).join(" ")}
        className={`cal-graf-linea l-${s}${prov ? " provisional" : ""}`} />;
    })}
    {puntos.map((p) => <g key={p.fecha}>
      {series.map((s) => {
        const v = valorPunto(p, s);
        if (v == null) return null;
        return s === "colados"
          ? <rect key={s} x={x(p.indice) - 4.5} y={y(v) - 4.5} width={9} height={9} rx={1.5}
            className={`cal-graf-marca m-colados${provisional ? " provisional" : ""}`} fill={provisional ? `url(#${tramaId})` : undefined} />
          : <circle key={s} cx={x(p.indice)} cy={y(v)} r={s === "ambos" ? 3.5 : 4.5} className={`cal-graf-marca m-${s}`} />;
      })}
      {p.en_curso && <text x={x(p.indice)} y={y(50)} textAnchor="middle" className="cal-graf-eje">en curso</text>}
      <text x={x(p.indice)} y={BASE + 16} textAnchor="middle" className="cal-graf-eje-x">{etiquetaDia(p.fecha)}</text>
      {/* Zona de hover más grande que la marca: tooltip nativo con todas las cifras del día. */}
      <rect x={x(p.indice) - Math.max(paso, 40) / 2} y={SUP} width={Math.max(paso, 40)} height={UTIL_Y + 20} className="cal-graf-hit">
        <title>{`${etiquetaDia(p.fecha)} · roster ${p.poblacion}${p.en_curso ? " · en curso: el % se calcula al cerrar" : ""}\n` +
          series.map((s) => `${NOMBRE[s]}: ${p[s] ?? "—"} (${pct(valorPunto(p, s))})`).join("\n")}</title>
      </rect>
    </g>)}
    {finales.map((f) => <text key={f.s} x={f.xx + 8} y={f.yy + 3} className="cal-graf-valor">{Math.round(f.v)} %</text>)}
  </svg>;
}

function Barras({ barras, modo, provisional, nombreClase, tramaId }: {
  barras: BarraClase[]; modo: ModoGrafica; provisional: boolean; nombreClase: (slot: string) => string; tramaId: string;
}) {
  const techo = techoEje(maximoDia(barras));
  const hueco = UTIL_X / Math.max(1, barras.length);
  const ancho = Math.min(46, hueco * 0.62);
  const y = (v: number) => BASE - (v / techo) * UTIL_Y;
  const resumen = barras.map((b) => `${nombreClase(b.slot_id)}: roster ${b.poblacion}` +
    (modo !== "colados" ? `, horario ${b.horario}` : "") + (modo !== "horario" ? `, colados ${b.colados}` : "")).join("; ");
  return <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" className="cal-graf-svg" role="img"
    aria-label={`Ingresos por clase del día (personas). ${resumen}.${provisional ? " Colados provisionales: se completan al cerrar la semana." : ""}`}>
    <Eje techo={techo} />
    {barras.map((b, i) => {
      const cx = IZQ + hueco * i + hueco / 2, x0 = cx - ancho / 2;
      const [hora, extra] = nombreClase(b.slot_id).split(" · ");
      const tope = Math.max(...b.segmentos.map((s) => s.hasta), 0);
      return <g key={b.slot_id}>
        <rect x={x0} y={y(b.poblacion)} width={ancho} height={BASE - y(b.poblacion)} rx={4} className="cal-graf-roster" />
        {b.segmentos.map((s) => {
          if (s.hasta <= s.desde) return null;
          const prov = s.tipo === "colados" && provisional;
          // 2px de separación entre azul y amarillo apilados (spacer de superficie).
          const alto = BASE - y(s.hasta - s.desde) - (s.desde > 0 ? 2 : 0);
          return <rect key={s.tipo} x={x0 + 3} y={y(s.hasta)} width={ancho - 6} height={Math.max(alto, 1)} rx={2}
            className={`cal-graf-seg s-${s.tipo}${prov ? " provisional" : ""}`} fill={prov ? `url(#${tramaId})` : undefined} />;
        })}
        <text x={cx} y={y(tope) - 4} textAnchor="middle" className="cal-graf-valor">{b.visible}</text>
        <text x={cx} y={BASE + 14} textAnchor="middle" className="cal-graf-eje-x">{hora}</text>
        {extra && <text x={cx} y={BASE + 26} textAnchor="middle" className="cal-graf-eje-x">{extra}</text>}
        <rect x={cx - hueco / 2} y={SUP} width={hueco} height={UTIL_Y + 30} className="cal-graf-hit">
          <title>{`${nombreClase(b.slot_id)} · roster ${b.poblacion}${b.en_curso ? " · en curso" : ""}\n` +
            `Horario correcto: ${b.horario}\nColados: ${b.colados}${provisional ? " (provisional)" : ""}\nTotal: ${b.ambos}`}</title>
        </rect>
      </g>;
    })}
  </svg>;
}

export default function GraficaCalendario({ detalle, fecha, modo, abierta, etiquetaDia, nombreClase }: {
  detalle: DetalleSemanaResponse; fecha: string | null; modo: ModoGrafica; abierta: boolean;
  etiquetaDia: (fecha: string) => string; nombreClase: (slot: string) => string;
}) {
  const tramaId = `trama-colados-${useId().replace(/:/g, "")}`;
  const provisional = coladosProvisionales(modo, abierta);
  const series = SERIES_POR_MODO[modo];
  const puntos = fecha ? [] : puntosSemana(detalle.porDia);
  const barras = fecha ? barrasDia(detalle.porClase, fecha, modo) : [];
  if (fecha ? barras.length === 0 : puntos.length === 0) return null;
  const titulo = fecha ? "Ingresos por clase del día" : "Ingresos por día de la semana";
  const ver = (s: SerieGrafica) => series.includes(s);

  return <figure className="cal-graf" data-modo={modo} data-provisional={provisional ? "1" : undefined}>
    <figcaption className="cal-graf-titulo">{titulo} <small>· {fecha ? "personas · barra gris = roster medible" : "% del roster medible de cada día · un punto por día de clase"}</small></figcaption>
    <Leyenda series={fecha ? series.filter((s) => s !== "ambos") : series} provisional={provisional} conRoster={Boolean(fecha)} />
    <svg width="0" height="0" className="cal-graf-defs" aria-hidden="true" focusable="false">
      <defs><pattern id={tramaId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="cal-graf-trama-fondo" /><rect width="3" height="6" className="cal-graf-trama-raya" /></pattern></defs>
    </svg>
    {fecha
      ? <Barras barras={barras} modo={modo} provisional={provisional} nombreClase={nombreClase} tramaId={tramaId} />
      : <Lineas puntos={puntos} modo={modo} provisional={provisional} etiquetaDia={etiquetaDia} tramaId={tramaId} />}
    {provisional && <p className="nota cal-graf-nota" data-testid="colados-provisionales">
      Los colados se completan al cerrar la semana: quien aún no entra a su clase todavía puede colarse en otra.</p>}
    <details className="cal-graf-datos">
      <summary>Ver los datos del gráfico</summary>
      <table className="class-table">
        <caption className="sr-only">{titulo}, en formato de tabla (sin nombres)</caption>
        <thead><tr><th>{fecha ? "Clase" : "Día"}</th><th>Roster</th>
          {ver("horario") && <th>Horario</th>}{ver("colados") && <th>Colados{provisional ? " (provisional)" : ""}</th>}
          {(modo === "ambos") && <th>Total</th>}</tr></thead>
        <tbody>{fecha
          ? barras.map((b) => <tr key={b.slot_id}><td>{nombreClase(b.slot_id)}</td><td>{b.poblacion}</td>
            {ver("horario") && <td>{b.horario}</td>}{ver("colados") && <td>{b.colados}</td>}{modo === "ambos" && <td>{b.ambos}</td>}</tr>)
          : puntos.map((p) => <tr key={p.fecha}><td>{etiquetaDia(p.fecha)}{p.en_curso ? " (en curso)" : ""}</td><td>{p.poblacion}</td>
            {series.map((s) => <td key={s}>{p[s] ?? "—"} · {p.en_curso ? "en curso" : pct(valorPunto(p, s))}</td>)}</tr>)}</tbody>
      </table>
    </details>
  </figure>;
}
