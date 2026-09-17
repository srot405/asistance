"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DemoData } from "../lib/types";
import { isWeekOverdue } from "../lib/conteos";
import Encabezado from "./Encabezado";
import Filtros, { type Filters } from "./Filtros";
import Resumen from "./Resumen";
import DiaADia from "./DiaADia";
import SemanaASemana from "./SemanaASemana";
import ZoomLimit from "./ZoomLimit";

const defaultFilters: Filters = {
  semana: "2026-09-14",
  ciudad: "",
  franja: "",
  cuenta: "",
  codigo: "",
  buscar: "",
};

export default function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(params.get("vista") ?? "Resumen");
  const [dark, setDark] = useState(false);
  const [filters, setFiltersState] = useState<Filters>({
    ...defaultFilters,
    ...Object.fromEntries(
      Object.keys(defaultFilters).map((key) => [
        key,
        params.get(key) ?? defaultFilters[key as keyof Filters],
      ]),
    ),
  } as Filters);
  const [weeks, setWeeks] = useState<DemoData[]>([]);
  const current = weeks.find((week) => week.semana === filters.semana) ?? null;
  const setFilters = (next: Filters) => {
    setFiltersState(next);
    const query = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value && value !== defaultFilters[key as keyof Filters])
        query.set(key, value);
    });
    if (tab !== "Resumen") query.set("vista", tab);
    router.replace(`${pathname}?${query}`, { scroll: false });
  };
  useEffect(() => {
    fetch("/api/semanas?demo=1")
      .then((response) => response.json())
      .then((rows: Array<{ semana: string }>) =>
        Promise.all(
          rows.map((row) =>
            fetch(`/api/datos?semana=${row.semana}&demo=1`).then((response) =>
              response.json(),
            ),
          ),
        ),
      )
      .then(setWeeks);
  }, []);
  const overdue = useMemo(
    () => (current ? isWeekOverdue(current) : false),
    [current],
  );
  if (!current)
    return (
      <main className="main">
        <div className="empty">Cargando panel…</div>
      </main>
    );
  const changeTab = (next: string) => {
    setTab(next);
    const query = new URLSearchParams(window.location.search);
    query.set("vista", next);
    router.replace(`${pathname}?${query}`, { scroll: false });
  };
  const limitCount = current.franjas.filter((slot) =>
    ["zoom_limit_pendiente", "dudosa", "sin_captura"].includes(
      slot.estado_captura,
    ),
  ).length;
  return (
    <div className={dark ? "shell dark" : "shell"}>
      <Encabezado dark={dark} setDark={setDark} demo />
      <main className="main">
        <Filtros
          data={current}
          weeks={weeks}
          filters={filters}
          setFilters={setFilters}
          tab={tab}
          onExport={() => {
            window.location.href = `/api/exportar?semana=${filters.semana}&vista=${encodeURIComponent(tab)}&demo=1`;
          }}
        />
        <nav className="tabs" role="tablist" aria-label="Vistas">
          {[
            "Resumen",
            "Día a día",
            "Semana a semana",
            `ZOOM-LIMIT (${limitCount})`,
          ].map((name) => (
            <button
              className={
                tab === name ||
                (name.startsWith("ZOOM") && tab.startsWith("ZOOM"))
                  ? "tab active"
                  : "tab"
              }
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => changeTab(name)}
            >
              {name}
              {name.startsWith("ZOOM") && overdue && (
                <span className="alert-badge">VENCIDA</span>
              )}
            </button>
          ))}
        </nav>
        {tab === "Resumen" && (
          <Resumen data={current} weeks={weeks} filters={filters} />
        )}
        {tab === "Día a día" && (
          <section className="panel">
            <h2>Día a día</h2>
            <DiaADia data={current} filters={filters} />
          </section>
        )}
        {tab === "Semana a semana" && (
          <section className="panel">
            <h2>Semana a semana</h2>
            <SemanaASemana data={current} weeks={weeks} filters={filters} />
          </section>
        )}
        {tab.startsWith("ZOOM") && <ZoomLimit data={current} weeks={weeks} />}
      </main>
    </div>
  );
}
