import { sessionsWithoutData } from "../lib/conteos";
import type { DemoData } from "../lib/types";
import type { Filters } from "./Filtros";

export default function Resumen({ data, weeks, filters }: { data: DemoData; weeks: DemoData[]; filters: Filters }) {
  const noData = sessionsWithoutData(data.franjas).filter((slot) => !filters.cuenta || slot.cuenta_zoom === filters.cuenta);
  const affected = noData.reduce((sum, slot) => sum + slot.personas_afectadas, 0);
  const roster = data.counts.roster ?? 0;
  return <>
    <section className="summary-grid">
      {[["Roster", roster], ["Entraron", data.counts.SI ?? 0], ["No entraron", data.counts.NO ?? data.counts["NO?"] ?? 0], ["Sin dato", data.counts.ZL ?? 0], ["Otra clase", data.counts.A ?? 0], ["Otra sala", data.counts.N ?? 0]].map(([label, value]) => <div className="stat" key={String(label)}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}
    </section>
    <div className="status"><strong>Semana {data.estado_semana}</strong> · {noData.length} sesiones sin dato confiable · {affected} personas afectadas</div>
    <section className="panel">
      <h2>Estado diario</h2>
      <div className="daily-bars">
        {data.por_dia.map((day) => <div className="daily-bar" key={day.fecha}>
          <div className="daily-stack">{Object.entries(day.counts).map(([code, count]) => <span key={code} title={`${code}: ${count}`} style={{ width: `${(count / Math.max(day.total, 1)) * 100}%` }} />)}</div>
          <small>{day.fecha.slice(5)}</small><b>{day.total}/{roster}</b>
        </div>)}
      </div>
      <div className="legend" aria-label="Leyenda de estados"><span><i className="cell V" /> V: propia</span><span><i className="cell A" /> A: otra clase</span><span><i className="cell N" /> N: otra sala</span><span><i className="cell R" /> R: dudosa</span><span><i className="cell P" /> P: por ocurrir</span></div>
    </section>
    <section className="panel">
      <h2>Semana a semana · entraron / roster</h2>
      {weeks.map((week) => { const value = week.counts.SI ?? 0; return <div className="series-row" key={week.semana}><span>{week.semana}</span><div className="series-track"><i style={{ width: `${(value / Math.max(roster, 1)) * 100}%` }} /></div><b>{value} / {roster}</b></div>; })}
    </section>
  </>;
}
