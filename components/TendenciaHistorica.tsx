import type { ResumenHistorico } from "../lib/types";
import TendenciaGrafico from "./TendenciaGrafico";

const porcentaje = (valor: number | null) => (valor == null ? "—" : `${valor.toFixed(1)} %`);
// Con clases sin captura, "ingresaron" solo puede subir: la cifra es un piso, no el valor real.
const esMinimo = (fila: ResumenHistorico) => fila.nivel !== "Sin dato" && !fila.captura_completa;
const MINIMO = "mínimo: hubo clases sin captura";

function Nivel({ nivel }: { nivel: ResumenHistorico["nivel"] }) {
  const clase = nivel === "Detalle" ? "detail" : nivel === "Solo semanal" ? "weekly" : "missing";
  return <span className={`level-badge ${clase}`}>{nivel}</span>;
}

// Pestaña "Historial" (TOC-91, 2026-09-29): antes vivía siempre visible dentro
// de ResumenSemanaVisual; Samuel pidió separarla para que la vista "Semana" solo
// muestre la semana elegida, sin mezclar con la comparación entre semanas.
export default function TendenciaHistorica({ resultados }: { resultados: ResumenHistorico[] }) {
  return <section className="panel trend-panel">
    <div className="section-heading"><div><h2>Tendencia semanal</h2><p>Cada semana muestra qué tan sólido es el dato.</p></div></div>
    <TendenciaGrafico resultados={resultados} />
    <div className="trend-legend" aria-label="Series de la tendencia"><span><i className="in" />Ingresaron</span><span><i className="out" />No ingresaron</span></div>
    <div className="trend-list">{resultados.map((fila) => <article className="trend-row" key={`${fila.semana}-${fila.materia}`}>
      <div className="trend-label"><b>{fila.semana}</b><span>{fila.materia}</span><Nivel nivel={fila.nivel} /></div>
      <div className="trend-bars" aria-label={`${fila.semana}: ${porcentaje(fila.porcentaje_retencion)} ingresaron`}>
        {fila.porcentaje_retencion == null ? <div className="trend-no-data">Dato no comparable</div> : <>
          <div className="trend-track" title={`Ingresaron ${porcentaje(fila.porcentaje_retencion)} · No ingresaron ${porcentaje(fila.porcentaje_nunca)}`}>
            <i className="trend-in" style={{ width: `${fila.porcentaje_retencion}%` }} />
            <i className="trend-out" style={{ width: `${fila.porcentaje_nunca}%` }} />
          </div>
          <b>{porcentaje(fila.porcentaje_retencion)} / {porcentaje(fila.porcentaje_nunca)}</b>
          {esMinimo(fila) && <small className="trend-minimo" title={`Captura: ${fila.clases_capturadas} de ${fila.clases_programadas ?? "?"} clases`}>
            mínimo · {fila.clases_programadas == null ? "horario no verificable"
              : `${fila.clases_capturadas} de ${fila.clases_programadas} clases`}</small>}</>}
      </div>
    </article>)}</div>
  </section>;
}
