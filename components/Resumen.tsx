import type { DemoData } from "../lib/types";
import {
  cellsForPeople,
  countsByDate,
  filterRoster,
  sessionsWithoutData,
} from "../lib/conteos";
import Leyenda from "./Leyenda";
import type { Filters } from "./Filtros";
export default function Resumen({
  data,
  weeks,
  filters,
}: {
  data: DemoData;
  weeks: DemoData[];
  filters: Filters;
}) {
  const people = filterRoster(data.roster, filters, data.franjas);
  const cells = cellsForPeople(data.celdas_dia, people, filters);
  const dates = [...new Set(data.celdas_dia.map((c) => c.fecha))];
  const byDay = countsByDate(cells, people, dates);
  const noData = sessionsWithoutData(data.franjas).filter(
    (slot) => !filters.cuenta || slot.cuenta_zoom === filters.cuenta,
  );
  const affected = noData.reduce((sum, s) => sum + s.personas_afectadas, 0);
  const si = weeks.map((w) => ({
    week: w.semana,
    value: w.celdas_semana.filter((c) => c.estado === "SI").length,
  }));
  return (
    <>
      <section className="summary-grid">
        {[
          ["Roster", people.length],
          [
            "Entraron",
            data.celdas_semana.filter((c) => c.estado === "SI").length,
          ],
          [
            "No entraron",
            data.celdas_semana.filter((c) => c.estado === "NO?").length,
          ],
          ["Sin dato", cells.filter((c) => c.estado === "ZL").length],
          ["Otra clase", cells.filter((c) => c.estado === "A").length],
          ["Otra sala", cells.filter((c) => c.estado === "N").length],
        ].map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </section>
      <div className="status">
        <strong>Semana {data.estado_semana}</strong> · {noData.length} sesiones
        sin dato confiable · {affected} estudiantes afectados
      </div>
      <section className="panel">
        <h2>Estado diario</h2>
        <div className="daily-bars">
          {byDay.map((day) => (
            <div className="daily-bar" key={day.fecha}>
              <div className="daily-stack">
                {Object.entries(day.counts).map(([code, count]) => (
                  <span
                    key={code}
                    title={`${code}: ${count}`}
                    style={{
                      width: `${(count / Math.max(day.total, 1)) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <small>{day.fecha.slice(5)}</small>
              <b>
                {day.total}/{people.length}
              </b>
            </div>
          ))}
        </div>
        <Leyenda />
      </section>
      <section className="panel">
        <h2>Semana a semana · entraron / roster</h2>
        {si.map((item) => (
          <div className="series-row" key={item.week}>
            <span>{item.week}</span>
            <div className="series-track">
              <i
                style={{
                  width: `${(item.value / Math.max(data.roster.length, 1)) * 100}%`,
                }}
              />
            </div>
            <b>
              {item.value} / {data.roster.length}
            </b>
          </div>
        ))}
      </section>
    </>
  );
}
