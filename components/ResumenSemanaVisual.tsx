import type { ResumenHistorico } from "../lib/types";

const SOLO = "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase.";
const fechaLarga = (fecha: string) => new Intl.DateTimeFormat("es-CO", {
  weekday: "long", day: "numeric", month: "short", timeZone: "UTC",
}).format(new Date(`${fecha}T12:00:00Z`));
const porcentaje = (valor: number | null) => valor == null ? "—" : `${valor.toFixed(1)} %`;
// Con clases sin captura, "ingresaron" solo puede subir: la cifra es un piso, no el valor real.
const esMinimo = (fila: ResumenHistorico) => fila.nivel !== "Sin dato" && !fila.captura_completa;
const MINIMO = "mínimo: hubo clases sin captura";

function Nivel({ nivel }: { nivel: ResumenHistorico["nivel"] }) {
  const clase = nivel === "Detalle" ? "detail" : nivel === "Solo semanal" ? "weekly" : "missing";
  return <span className={`level-badge ${clase}`}>{nivel}</span>;
}

export default function ResumenSemanaVisual({ actual, resultados, nuncaPeriodo }: {
  actual: ResumenHistorico;
  resultados: ResumenHistorico[];
  nuncaPeriodo: number | null;
}) {
  return <>
    <section className="historical-hero">
      <div><p className="eyebrow">Semana del {actual.semana} · {actual.materia}</p>
        <h1>Ingresos a clases virtuales</h1>
        <p className="hero-copy">Una lectura ejecutiva del alcance semanal, con el nivel de evidencia visible.</p>
      </div>
      <div className="period-never" aria-label="Nunca ingresaron en todo el período">
        <strong>{nuncaPeriodo ?? "—"}</strong><span>nunca ingresaron en todo el período</span>
        {actual.periodo_desde && actual.periodo_hasta && <small>{actual.periodo_desde} a {actual.periodo_hasta}</small>}
      </div>
    </section>

    <section className="metric-grid" aria-label="Cifras de la semana">
      <article className="metric-card retained"><span>Ingresaron</span>
        <strong>{porcentaje(actual.porcentaje_retencion)}</strong>
        <small>{actual.asistieron ?? "—"} de {actual.poblacion ?? "—"} personas medibles{esMinimo(actual) && <> · <b>{MINIMO}</b></>} · <a href="#definiciones">¿Qué significa?</a></small>
      </article>
      <article className="metric-card absent"><span>No ingresaron</span>
        <strong>{porcentaje(actual.porcentaje_nunca)}</strong><small>{actual.nunca ?? "—"} personas · <a href="#definiciones">¿Qué significa?</a></small>
      </article>
    </section>

    {actual.nivel === "Solo semanal" && <p className="historical-notice weekly-notice">{SOLO}</p>}
    {actual.nivel === "Sin dato" && <p className="historical-notice missing-notice"><b>Sin dato suficiente.</b>{" "}
      {actual.aviso.replace(/^Sin dato suficiente\s*·?\s*/, "")}</p>}

    <section className="panel reconciliation" aria-label="Cuadre del roster">
      <div className="section-heading"><div><h2>Cuadre del roster</h2><p>La población siempre debe quedar completamente explicada.</p></div><Nivel nivel={actual.nivel} /></div>
      <div className="reconciliation-line" role="status"><b>{actual.cuadre.roster} roster</b><span>=</span>
        <span>{actual.cuadre.medibles} medibles</span><span>+</span><span>{actual.cuadre.sin_dato} sin dato</span><span>+</span>
        <span>{actual.cuadre.pendientes} pendientes</span><span>+</span><span>{actual.cuadre.sin_clase} sin clase ocurrida</span>
      </div>
      <p className="coverage-line">Captura: <b>{actual.clases_capturadas}</b> de <b>{actual.clases_programadas ?? "?"}</b> clases
        {actual.porcentaje_cobertura != null && <> · {porcentaje(actual.porcentaje_cobertura)}</>}</p>
    </section>

    <section className="panel trend-panel">
      <div className="section-heading"><div><h2>Tendencia semanal</h2><p>Cada semana muestra qué tan sólido es el dato.</p></div></div>
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
    </section>

    {actual.nivel === "Detalle" && actual.detalle_dias && <section className="panel day-detail">
      <div className="section-heading"><div><h2>Detalle por día</h2><p>Solo aparece cuando existe un roster congelado y trazable.</p></div></div>
      <div className="day-grid">{actual.detalle_dias.map((dia) => <article className="day-card" key={dia.fecha}>
        <h3>{fechaLarga(dia.fecha)}</h3><strong>{porcentaje(dia.porcentaje_retencion)}</strong>
        <p>{dia.asistieron} ingresaron · {dia.nunca} no ingresaron</p><small>Roster medible: {dia.poblacion}</small>
      </article>)}</div>
      {actual.detalle_clases && <div className="class-table-wrap"><table className="class-table">
        <thead><tr><th>Clase</th><th>Fecha</th><th>Roster</th><th>Ingresaron</th><th>%</th></tr></thead>
        <tbody>{actual.detalle_clases.map((clase) => <tr key={`${clase.fecha}-${clase.slot_id}`}>
          <td>{clase.slot_id}</td><td>{clase.fecha}</td><td>{clase.poblacion}</td><td>{clase.asistieron}</td>
          <td>{porcentaje(clase.porcentaje_retencion)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>}

    <details className="panel definitions" id="definiciones"><summary>Cómo se calculan estas cifras</summary>
      <p><b>Ingresaron:</b> personas del roster medible con al menos una entrada identificada en la semana.</p>
      <p><b>No ingresaron:</b> personas medibles sin ninguna entrada identificada; no incluye clases pendientes ni sin dato.</p>
      <p><b>Mínimo:</b> la semana tuvo clases sin captura (sobre todo de la cuenta soporte). El % real de ingreso es igual o mayor al mostrado.</p>
      <p><b>Nunca en el período:</b> personas activas al cierre del período que no aparecen identificadas en ninguna semana mostrada.</p>
    </details>
  </>;
}
