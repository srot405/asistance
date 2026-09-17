"use client";
import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CellDay, DemoData, Slot } from "../lib/types";
import {
  cellsForPeople,
  countsByDate,
  filterRoster,
  indexBy,
} from "../lib/conteos";
import type { Filters } from "./Filtros";
import Leyenda from "./Leyenda";
import DetalleCelda from "./DetalleCelda";

export default function DiaADia({
  data,
  filters,
}: {
  data: DemoData;
  filters: Filters;
}) {
  const people = filterRoster(data.roster, filters, data.franjas);
  const dates = [...new Set(data.celdas_dia.map((cell) => cell.fecha))];
  const cells = cellsForPeople(data.celdas_dia, people, filters);
  const cellMap = new Map(
    cells.map((cell) => [`${cell.persona_id}|${cell.fecha}`, cell]),
  );
  const slotMap = indexBy(data.franjas, "slot_id") as Map<string, Slot>;
  const peopleMap = indexBy(people, "persona_id") as Map<
    string,
    DemoData["roster"][number]
  >;
  const totals = countsByDate(cells, people, dates);
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: people.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 42,
    overscan: 10,
  });
  const [selected, setSelected] = useState<CellDay | null>(null);
  const selectedPerson = selected
    ? peopleMap.get(selected.persona_id)
    : undefined;
  return (
    <>
      <Leyenda />
      <div className="grid-wrap" ref={parent}>
        <div
          className="grid"
          style={{ height: virtual.getTotalSize(), position: "relative" }}
        >
          <div className="grid-row header">
            <div>Nombre</div>
            <div>Ciudad</div>
            <div>Franja propia</div>
            {dates.map((date, index) => (
              <div key={date}>
                {date.slice(5)}
                <small className="total-codes">
                  {Object.entries(totals[index].counts)
                    .map(([code, count]) => `${code}:${count}`)
                    .join(" ")}
                </small>
              </div>
            ))}
          </div>
          {virtual.getVirtualItems().map((item) => {
            const person = people[item.index];
            return (
              <div
                className="grid-row"
                key={person.persona_id}
                style={{
                  position: "absolute",
                  top: item.start,
                  left: 0,
                  right: 0,
                }}
              >
                <div>{person.nombre}</div>
                <div>{person.ciudad}</div>
                <div>{person.franja.replace("backend-", "")}</div>
                {dates.map((date) => {
                  const cell =
                    cellMap.get(`${person.persona_id}|${date}`) ?? null;
                  return (
                    <button
                      className={`cell ${cell?.estado ?? "-"}`}
                      key={date}
                      onClick={() => setSelected(cell)}
                      title={cell?.detalle}
                    >
                      {cell?.estado ?? "-"}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <DetalleCelda
        cell={selected}
        slot={selectedPerson ? slotMap.get(selectedPerson.franja) : undefined}
      />
    </>
  );
}
