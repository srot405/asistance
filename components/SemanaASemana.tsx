"use client";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DemoData } from "../lib/types";
import { filterRoster, indexBy } from "../lib/conteos";
import type { Filters } from "./Filtros";
export default function SemanaASemana({
  data,
  weeks,
  filters,
}: {
  data: DemoData;
  weeks: DemoData[];
  filters: Filters;
}) {
  const people = filterRoster(data.roster, filters, data.franjas);
  const peopleMap = indexBy(people, "persona_id");
  const byWeek = weeks.map((week) => ({
    week,
    cells: indexBy(week.celdas_semana, "persona_id"),
  }));
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: people.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 42,
    overscan: 10,
  });
  return (
    <div className="grid-wrap" ref={parent}>
      <div
        className="weekly-grid"
        style={{ height: virtual.getTotalSize(), position: "relative" }}
      >
        <div className="grid-row header">
          <div>Nombre</div>
          {weeks.map((week) => (
            <div key={week.semana}>{week.semana}</div>
          ))}
        </div>
        {virtual.getVirtualItems().map((item) => {
          const person = peopleMap.get(people[item.index].persona_id)!;
          return (
            <div
              className="grid-row weekly-row"
              key={person.persona_id}
              style={{
                position: "absolute",
                top: item.start,
                left: 0,
                right: 0,
              }}
            >
              <div>{person.nombre}</div>
              {byWeek.map(({ week, cells }) => (
                <div className="cell" key={week.semana}>
                  {cells.get(person.persona_id)?.estado ?? "-"}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
