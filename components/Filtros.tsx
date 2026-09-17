import type { DemoData } from "../lib/types";
export type Filters = {
  semana: string;
  ciudad: string;
  franja: string;
  cuenta: string;
  codigo: string;
  buscar: string;
};
type Props = {
  data: DemoData;
  weeks: DemoData[];
  filters: Filters;
  setFilters: (next: Filters) => void;
  tab: string;
  onExport: () => void;
};
export default function Filtros({
  data,
  weeks,
  filters,
  setFilters,
  tab,
  onExport,
}: Props) {
  const set = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  const cities = [...new Set(data.roster.map((p) => p.ciudad))].sort();
  const slots = [...new Set(data.roster.map((p) => p.franja))].sort();
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
              {week.semana} · {week.estado_semana}
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
      <select
        className="control"
        value={filters.codigo}
        onChange={(e) => set("codigo", e.target.value)}
      >
        <option value="">Todos los estados</option>
        {["V", "A", "N", "R", "R?", "ZL", "P", "-"].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input
        className="control"
        placeholder="Buscar estudiante"
        value={filters.buscar}
        onChange={(e) => set("buscar", e.target.value)}
      />
      <button className="control" onClick={onExport}>
        Exportar CSV · {tab}
      </button>
    </div>
  );
}
