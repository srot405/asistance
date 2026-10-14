import type { PersonasPorOrigen } from "../lib/tiempoContrato.d.mts";
import HistogramaTiempo from "./HistogramaTiempo";
import TiempoTarjetas from "./TiempoTarjetas";

// Regla C (2026-10-14): tiempo en clase POR PERSONA que ingreso, con su mejor clase. Misma base que «Ingresaron» de la pestaña Semana.
// Selector Todos / En su horario / Colados (cada persona esta en una sola de las dos ultimas). El 50 % es dato secundario.
export type PoblacionTiempo = "todos" | "horario" | "colados";
const ETIQUETA: Record<PoblacionTiempo, string> = { todos: "Todos los que ingresaron", horario: "En su horario", colados: "Colados" };
const QUIENES: Record<PoblacionTiempo, string> = { todos: "personas que ingresaron", horario: "personas que entraron a su clase", colados: "colados" };

export default function TiempoPersonas({ datos, vista, onCambiar, filtrado }: {
  datos: PersonasPorOrigen; vista: PoblacionTiempo; onCambiar: (v: PoblacionTiempo) => void; filtrado: boolean;
}) {
  const a = datos[vista];
  const pct = a.n_ingresaron > 0 ? Math.round((a.con_pct / a.n_ingresaron) * 100) : null;
  return <section className="tiempo-personas-bloque" aria-label="Tiempo por persona que ingresó" data-testid="tiempo-personas">
    <p className="tiempo-encabezado" data-testid="tiempo-encabezado">
      <b>{datos.todos.n_ingresaron} ingresaron</b> = {datos.horario.n_ingresaron} en su horario + {datos.colados.n_ingresaron} colados
      {filtrado && <> <span className="nota">(con los filtros elegidos)</span></>}</p>
    <div className="poblacion-vistas" role="radiogroup" aria-label="Población del tiempo en clase" data-testid="selector-tiempo">
      {(["todos", "horario", "colados"] as PoblacionTiempo[]).map((v) =>
        <button key={v} type="button" role="radio" className="poblacion-vista" data-poblacion={v} aria-checked={vista === v} onClick={() => onCambiar(v)}>
          {ETIQUETA[v]} · {datos[v].n_ingresaron}</button>)}
    </div>
    {a.n_ingresaron === 0
      ? <p className="nota" data-testid="tiempo-personas-vacio">No hay {QUIENES[vista]} con estos filtros.</p>
      : <>
        <p className="tiempo-cobertura" data-testid="tiempo-cobertura-personas"><b>{a.con_pct} de {a.n_ingresaron} {QUIENES[vista]} con % de estancia en sala{pct != null && <> ({pct} %)</>}</b>
          {a.sin_pct > 0 && <b className="tiempo-alerta" data-testid="alerta-sin-pct-tiempo"> · ⚠ {a.sin_pct} sin % de estancia (revisar)</b>}</p>
        <TiempoTarjetas a={a} porPersona />
        <h3>Distribución del % de estancia (mejor clase de cada persona)</h3>
        <HistogramaTiempo histograma={a.histograma} />
      </>}
  </section>;
}
