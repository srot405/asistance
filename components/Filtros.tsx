import type { DemoData } from "../lib/types";
export type Filters = {
  semana: string;
  ciudad: string;
  franja: string;
  cuenta: string;
};
type Props = {
  data: DemoData;
  weeks: DemoData[];
  semanaActual: string;
  filters: Filters;
  setFilters: (next: Filters) => void;
  tab: string;
  onExport: () => void;
};
export default function Filtros({
  data,
  weeks,
  semanaActual,
  filters,
  setFilters,
  tab,
  onExport,
}: Props) {
  const set = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  // `ciudades` ya viene sin vacíos desde el servidor: una <option> con key vacía
  // React la trata como key ausente y avisa por consola.
  const cities = data.ciudades;
  const slots = data.franjas_con_clase.map((slot) => slot.slot_id).sort();
  return (
    <div className="toolbar filters">
      <label>
        Semana{" "}
        <select
          className="control"
          value={filters.semana}
          onChange={(e) => set("semana", e.target.value)}
        >
          {weeks.map((week) => (
            <option value={week.semana} key={week.semana}>
            {week.semana} · {week.materia || "sin materia"} · {week.estado_semana || "En curso"}{week.semana === semanaActual ? " · actual" : ""}
            </option>
          ))}
        </select>
      </label>
      <select
        className="control"
        value={filters.ciudad}
        onChange={(e) => set("ciudad", e.target.value)}
      >
        <option value="">Todas las ciudades</option>
        {cities.map((city) => (
          <option key={city}>{city}</option>
        ))}
      </select>
      <select
        className="control"
        value={filters.franja}
        onChange={(e) => set("franja", e.target.value)}
      >
        <option value="">Todas las franjas</option>
        {slots.map((slot) => (
          <option key={slot}>{slot}</option>
        ))}
      </select>
      <select
        className="control"
        value={filters.cuenta}
        onChange={(e) => set("cuenta", e.target.value)}
      >
        <option value="">Todas las cuentas</option>
        {["comunicaciones", "jovenescreativos", "soporte"].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      {tab !== "ZOOM-LIMIT" && !tab.startsWith("ZOOM") && <button className="control" onClick={onExport}>
        Exportar CSV · {tab}
      </button>}
    </div>
  );
}
