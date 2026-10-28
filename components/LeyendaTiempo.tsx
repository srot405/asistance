import { ETIQUETAS, ICONOS, LEYENDA_VISITAS } from "../lib/tiempoVista.mjs";

// Leyenda SIEMPRE visible: cada categoria = color + icono + texto + trama (liso / diagonal / punteado).
// Rojo por tiempo (⏱, trama diagonal) NO es lo mismo que no ingreso (✕, liso).
const ITEMS = ["cumple", "rojo_tiempo", "no_ingreso", "sin_dato_tiempo"] as const;
const CLASE: Record<(typeof ITEMS)[number], string> = {
  cumple: "t-cumple", rojo_tiempo: "t-rojo", no_ingreso: "t-noingreso", sin_dato_tiempo: "t-sindato",
};

export default function LeyendaTiempo() {
  return <div className="leyenda-tiempo" aria-label="Leyenda de categorías de tiempo">
    <p><b>Permanencia:</b> rojo &lt; 60 % · amarillo ≥ 60 % y &lt; 80 % · verde ≥ 80 % · sin dato si no se pudo medir.
      Entró a clase: Sí con cualquier entrada, independientemente del porcentaje.</p>
    <p>Indicadores técnicos históricos del tiempo (regla 50 %, independientes del semáforo):</p>
    <ul>{ITEMS.filter((k) => k !== "cumple" && k !== "rojo_tiempo").map((k) => <li key={k}>
      <i className={`t-muestra ${CLASE[k]}`} aria-hidden="true" />
      <b aria-hidden="true">{ICONOS[k]}</b> {ETIQUETAS[k]}
    </li>)}</ul>
    <p className="nota">{LEYENDA_VISITAS}</p>
  </div>;
}
