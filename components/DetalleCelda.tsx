import type { CellDay, Slot } from "../lib/types";
export default function DetalleCelda({
  cell,
  slot,
}: {
  cell: CellDay | null;
  slot?: Slot;
}) {
  if (!cell)
    return (
      <aside className="panel detail">
        <strong>Detalle</strong>
        <p>Selecciona una celda para ver sala, primera entrada y origen.</p>
      </aside>
    );
  return (
    <aside className="panel detail">
      <h2>Detalle · {cell.estado}</h2>
      <p>Sala: {cell.sala ?? slot?.sala ?? "No disponible"}</p>
      <p>Primera entrada: {cell.primera_entrada ?? "No disponible"}</p>
      <p>Origen: {cell.origen ?? "No disponible"}</p>
    </aside>
  );
}
