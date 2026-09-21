import { sessionsWithoutData, yaOcurrio } from "../lib/conteos";
import type { DemoData } from "../lib/types";
import type { Filters } from "./Filtros";

export default function Resumen({ data, weeks, filters }: { data: DemoData; weeks: DemoData[]; filters: Filters }) {
  const noData = sessionsWithoutData(data.franjas).filter((slot) => !filters.cuenta || slot.cuenta_zoom === filters.cuenta);
  const affected = noData.reduce((sum, slot) => sum + slot.personas_afectadas, 0);
  const roster = data.counts.roster ?? 0;
  return <>
    <section className="summary-grid">
      {[["Roster", roster], ["Entraron", data.counts.SI ?? 0], ["No entraron", data.counts.NO ?? data.counts["NO?"] ?? 0], ["Sin dato (ZL)", data.counts.ZL ?? 0], ["Aún no ocurre", data.counts.P ?? 0], ["Faltó a la suya, fue a otra", data.counts.A ?? 0], ["Apareció en un día que no era el suyo", data.counts.N ?? 0]].map(([label, value]) => <div className="stat" key={String(label)}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}
    </section>
    <div className="status"><strong>Semana {data.estado_semana}</strong> · {noData.length} sesiones sin dato confiable · {affected} personas afectadas{data.sinHorario > 0 && ` · ${data.sinHorario} personas del canon sin horario asignado esta semana, fuera del roster`}</div>
    <section className="panel">
      <h2>Estado diario</h2>
      <p className="nota">A y N no son lo mismo visto dos veces: A se marca el día de su clase (no vino, anduvo en otra) y N en un día distinto. Quien se cuela el mismo día de su clase solo genera A. Por eso no coinciden, y ninguno es el número de visitas.</p>
      <div className="daily-bars">
        {data.por_dia.map((day) => <div className="daily-bar" key={day.fecha}>
          <div className="daily-stack">{Object.entries(day.counts).map(([code, count]) => <span key={code} title={`${code}: ${count}`} style={{ width: `${(count / Math.max(day.total, 1)) * 100}%` }} />)}</div>
          <small>{day.fecha.slice(5)}</small><b>{day.total}/{roster}</b>
        </div>)}
      </div>
      <div className="legend" aria-label="Leyenda de estados"><span><i className="cell V" /> V: entró a la suya</span><span><i className="cell A" /> A: faltó a la suya, fue a otra</span><span><i className="cell N" /> N: apareció otro día</span><span><i className="cell R" /> R: dudosa</span><span><i className="cell P" /> P: por ocurrir</span></div>
    </section>
    <section className="panel">
      <h2>Semana a semana · entraron / poblacion medible</h2>
      <p className="nota">Cada semana se divide entre SU propia poblacion medible. Dividir entre el roster de la semana abierta pintaba 18% en agosto y 74% en septiembre: parecia una mejora enorme y solo cambiaba cuanto alcanzabamos a capturar.</p>
      {weeks.filter(yaOcurrio).map((week) => { const r = week.resumen; return <div className="series-row" key={week.semana}><span>{week.semana}</span><div className="series-track"><i style={{ width: `${r.asistenciaPct}%` }} /></div><b>{r.si} / {r.medible} ({r.asistenciaPct}%)</b></div>; })}
    </section>
  </>;
}
