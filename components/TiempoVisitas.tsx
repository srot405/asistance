import type { FiltroTiempo } from "../lib/tiempoContrato.d.mts";
import { ICONOS, TEXTO_NO_DISPONIBLE, porcentajeUnDecimal } from "../lib/tiempoVista.mjs";
import { useVisitasSemana } from "../lib/useTiempo";
import { SIN_FRANJA_PROPIA, TEXTO_SUPRIMIDO, VEREDICTO_VISITA } from "../lib/visitasCalculo.mjs";
import type { MatrizVisitas } from "../lib/visitasCalculo.d.mts";

const ICONO_VEREDICTO: Record<string, string> = { cumple: ICONOS.cumple, rojo_tiempo: ICONOS.rojo_tiempo, sin_dato_tiempo: ICONOS.sin_dato_tiempo, pendiente: "…" };
// n = null es una celda suprimida (1 a 4 personas); una celda ausente (undefined) es 0 visitas.
const celda = (n: number | null | undefined) => (n === undefined ? "—" : n === null ? TEXTO_SUPRIMIDO : String(n));

function Matriz({ m }: { m: MatrizVisitas }) {
  const valor = new Map(m.celdas.map((c) => [`${c.origen}\u0000${c.destino}`, c.n]));
  const total = (lista: MatrizVisitas["origenes"], id: string) => lista.find((t) => t.slot_id === id)?.n;
  return <div className="class-table-wrap" role="region" aria-label="Matriz de visitas: clase propia hacia clase visitada" tabIndex={0}>
    <table className="class-table tiempo-tabla visitas-matriz"><caption>Visitas: de su clase (filas) a la clase que visitó (columnas)</caption>
      <thead><tr><th>Su clase ↓ / Visitó →</th>{m.destinos.map((d) => <th key={d.slot_id} scope="col">{d.horario_texto}</th>)}<th scope="col">Total</th></tr></thead>
      <tbody>{m.origenes.map((o) => <tr key={o.slot_id || "sin-franja"}>
        <th scope="row">{o.horario_texto}</th>
        {m.destinos.map((d) => <td key={d.slot_id}>{celda(valor.get(`${o.slot_id}\u0000${d.slot_id}`))}</td>)}
        <td><b>{celda(total(m.origenes, o.slot_id))}</b></td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Total</th>{m.destinos.map((d) => <td key={d.slot_id}><b>{celda(total(m.destinos, d.slot_id))}</b></td>)}<td /></tr></tfoot>
    </table></div>;
}

// «Entró a clase ajena» (TOC-147): quién entró a una clase que no era la suya, de cuál es y cuánto tiempo estuvo.
// La tabla lleva nombres (nominal, solo tras login); la matriz no, y suprime las celdas de menos de 5 personas.
export default function TiempoVisitas({ semana, filtro, modo }: { semana: string; filtro: FiltroTiempo; modo: "demo" | "real" }) {
  const { estado, datos, recargar } = useVisitasSemana(semana, filtro, modo, true);
  const d = datos && datos.disponible ? datos : null;
  const conFiltro = Boolean(filtro.ciudad || filtro.franja || filtro.cuenta);
  return <section className="panel tiempo-visitas-panel" aria-label="Entró a clase ajena" aria-busy={estado === "cargando"}>
    <h3>Entró a clase ajena</h3>
    {estado === "cargando" && <p className="nota" role="status" aria-live="polite">Cargando visitas…</p>}
    {estado === "no_disponible" && <p className="historical-notice missing-notice" role="status">{TEXTO_NO_DISPONIBLE}</p>}
    {estado === "error" && <p className="historical-notice missing-notice" role="alert">No se pudieron cargar las visitas.{" "}
      <button type="button" className="control" onClick={recargar}>Reintentar</button></p>}
    {estado === "ok" && d && <>
      <p className="nota">Una visita es entrar a una clase distinta de la propia. El tiempo se mide en la sala visitada y no se suma al de su clase.
        El CSV nominal de tiempo trae estas mismas filas (columna <code>es_visita</code> = SI).</p>
      {d.cuadre.estado === "DISCREPA" && <p className="historical-notice missing-notice" role="alert">Aviso: las visitas de la pantalla no cuadran con
        los totales por clase ({d.cuadre.detalle.length} diferencias). No uses esta tabla para decidir hasta revisarla.</p>}
      {d.visitas.length === 0
        ? <p className="historical-notice weekly-notice" role="status" data-testid="visitas-vacio">No hay visitas registradas
          {conFiltro ? " con estos filtros" : " en lo calculado de esta semana"}. Se detectan al cerrar cada clase.</p>
        : <>
          <p><b>{d.resumen.total}</b> {d.resumen.total === 1 ? "visita" : "visitas"} — {ICONOS.cumple} cumplen {d.resumen.cumplen} · {ICONOS.rojo_tiempo} rojo {d.resumen.rojo}
            {" "}· {ICONOS.sin_dato_tiempo} sin dato {d.resumen.sin_dato}{d.resumen.pendientes > 0 ? ` · pendientes ${d.resumen.pendientes}` : ""}</p>
          <Matriz m={d.matriz} />
          <p className="nota">«{TEXTO_SUPRIMIDO}» = entre 1 y 4 personas: no se publica el número para evitar identificar a alguien. «—» = nadie.</p>
          <div className="class-table-wrap" role="region" aria-label="Visitas nominales" tabIndex={0}>
            <table className="class-table tiempo-tabla visitas-tabla"><caption>Quién entró a una clase que no era la suya</caption>
              <thead><tr><th>Visitante</th><th>Su clase</th><th>Clase visitada</th><th>Ciudad</th><th>% de tiempo</th><th>Veredicto</th></tr></thead>
              <tbody>{d.visitas.map((v, i) => <tr key={`${v.visitante}|${v.franja_visitada}|${i}`}>
                <th scope="row">{v.visitante}</th>
                <td>{v.franja_propia === SIN_FRANJA_PROPIA ? "—" : v.horario_propia}</td>
                <td>{v.horario_visitada}</td><td>{v.ciudad || "—"}</td>
                <td>{v.pct_tiempo == null ? "—" : porcentajeUnDecimal(v.pct_tiempo)}</td>
                <td><b aria-hidden="true">{ICONO_VEREDICTO[v.veredicto] ?? ""}</b> {VEREDICTO_VISITA[v.veredicto] ?? v.veredicto}</td>
              </tr>)}</tbody>
            </table></div>
        </>}
      <details className="panel definitions"><summary>Sin identificar ({d.sin_identificar.total})</summary>
        {d.sin_identificar.por_motivo.length === 0
          ? <p className="nota">Esta semana no hay entradas sin identificar registradas.</p>
          : <>
            <p className="nota">Entradas a Zoom que no se pudieron asignar a una persona del roster. Solo se cuentan y se explica el motivo: no se adivina quién es.</p>
            <ul>{d.sin_identificar.por_motivo.map((m) => <li key={m.motivo}><b>{m.cantidad}</b> · {m.etiqueta}</li>)}</ul>
          </>}
      </details>
    </>}
  </section>;
}
