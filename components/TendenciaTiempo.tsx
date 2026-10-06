"use client";
import { puntosTendenciaTiempo } from "../lib/tendenciaTiempo.mjs";
import { ETIQUETAS, ICONOS, TEXTO_NO_DISPONIBLE, porcentajeTexto } from "../lib/tiempoVista.mjs";
import type { ResumenHistorico } from "../lib/types";
import { useTiempoSerie } from "../lib/useTiempo";

// Tendencia semana a semana del % que cumple el 50 % del tiempo de su clase (pestana Historial). Cada barra usa
// SU propia base (N de M); una semana sin tiempos es un hueco, nunca 0 %; la semana abierta es PROVISIONAL.
export default function TendenciaTiempo({ resultados, modo }: { resultados: ResumenHistorico[]; modo: "demo" | "real" }) {
  const { estado, datos } = useTiempoSerie(modo);
  const serie = datos && datos.disponible ? datos.semanas : null;
  return <section className="panel trend-panel tendencia-tiempo" aria-label="Tiempo en clase semana a semana">
    <div className="section-heading"><div><h2>Tiempo en clase · semana a semana</h2>
      <p>La barra de cada semana usa su propia base. No compares semanas con cobertura distinta como si fueran iguales.</p></div></div>
    {estado === "cargando" && <p className="nota" role="status">Cargando tiempo…</p>}
    {(estado === "no_disponible" || estado === "error") && <p className="historical-notice missing-notice" data-testid="tendencia-tiempo-no-disponible">{TEXTO_NO_DISPONIBLE}</p>}
    {serie && <div className="trend-list">{puntosTendenciaTiempo(resultados, serie).map((p) => {
      const baja = p.nivelCobertura === "baja";
      return <article className="trend-row" key={p.semana} data-semana={p.semana}>
        <div className="trend-label"><b>{p.semana}</b><span>{p.materia}</span>
          {p.provisional && <span className="badge-provisional">⏳ PROVISIONAL</span>}</div>
        <div className="trend-bars" aria-label={p.graficable
          ? `${p.semana}: ${porcentajeTexto(p.valor)} cumple el 50 % del tiempo, ${p.n_medibles} de ${p.n_ingresaron} con tiempo medido`
          : `${p.semana}: sin dato de tiempo`}>
          {p.graficable ? <>
            <div className={`trend-track tiempo-track${baja ? " cob-baja" : ""}${p.provisional ? " provisional" : ""}`}>
              <i className="trend-in t-cumple" style={{ width: `${p.valor}%` }} /></div>
            <b>{porcentajeTexto(p.valor)}</b>
            <small>{p.n_medibles} de {p.n_ingresaron} con tiempo medido ({Math.round((p.cobertura ?? 0) * 100)} %)
              {baja && <span className="badge-cobertura-baja"> ⚠ cobertura baja</span>}</small></>
            : <div className="trend-no-data">{ICONOS.sin_dato_tiempo} {ETIQUETAS.sin_dato_tiempo}{p.n_ingresaron > 0 ? ` (${p.n_medibles} de ${p.n_ingresaron} con tiempo medido)` : ""}</div>}
        </div>
      </article>;
    })}</div>}
    {serie && puntosTendenciaTiempo(resultados, serie).length === 0 && <p className="nota">Aún no hay semanas con tiempo por clase.</p>}
  </section>;
}
