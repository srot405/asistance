import type { AgregadoTiempo } from "../lib/tiempoContrato.d.mts";
import { ETIQUETAS, ICONOS, TEXTO_SIN_DATO_AYUDA, porcentajeCumple, porcentajeRojo, porcentajeTexto, porcentajeUnDecimal, textoCobertura } from "../lib/tiempoVista.mjs";

const entero = porcentajeUnDecimal;

// Cuatro tarjetas: cumple (✓), rojo por tiempo (⏱), sin dato (◌) y mediana. El % se calcula SOLO sobre los medidos;
// con 0 medidos muestra "—" (nunca 0 %) y un panel que explica por que.
export default function TiempoTarjetas({ a }: { a: AgregadoTiempo }) {
  const baja = a.nivel_cobertura === "baja";
  const sinMedidos = a.n_medibles === 0;
  return <>
    {baja && <p className="historical-notice weekly-notice" role="status">⚠ Cobertura baja: solo {textoCobertura(a)}. Lee los porcentajes como
      &ldquo;de los medidos&rdquo;, no como el total de quienes ingresaron.</p>}
    {sinMedidos && <section className="historical-notice missing-notice" role="status" data-testid="sin-medicion">
      <b>{ICONOS.sin_dato_tiempo} {ETIQUETAS.sin_dato_tiempo}:</b>{" "}
      {a.n_ingresaron > 0 ? `de ${a.n_ingresaron} que ingresaron, ninguno tiene tiempo medido todavía.`
        : "aún no hay ingresos con tiempo medido (clases pendientes, sin clase o sin captura)."}
    </section>}
    <div className="tiempo-grid" aria-label="Cifras de tiempo en clase">
      <article className="tiempo-card t-cumple"><span><b aria-hidden="true">{ICONOS.cumple}</b> Cumplen (50 % o más)</span>
        <strong>{entero(porcentajeCumple(a))}</strong>
        <small>{sinMedidos ? "sin tiempo medido" : `${a.n_cumplen} de ${a.n_medibles} medidos${baja ? " (de los medidos)" : ""}`}</small></article>
      <article className="tiempo-card t-rojo"><span><b aria-hidden="true">{ICONOS.rojo_tiempo}</b> Rojo por tiempo</span>
        <strong>{entero(porcentajeRojo(a))}</strong>
        <small>{sinMedidos ? "sin tiempo medido" : `${a.n_rojo} personas · menos del 50 % de su clase`}</small></article>
      <article className="tiempo-card t-sindato"><span><b aria-hidden="true">{ICONOS.sin_dato_tiempo}</b> {ETIQUETAS.sin_dato_tiempo}</span>
        <strong>{a.n_sin_dato}</strong>
        <small>no entra al cálculo{a.n_pendiente > 0 ? ` · ${a.n_pendiente} pendientes` : ""}</small>
        <details><summary>¿Por qué?</summary><p className="nota">{TEXTO_SIN_DATO_AYUDA}</p></details></article>
      <article className="tiempo-card t-mediana"><span>Mediana del % de clase</span>
        <strong>{a.mediana == null ? "—" : entero(a.mediana)}</strong>
        <small>{a.mediana == null ? (sinMedidos ? "sin tiempo medido" : "muestra pequeña (n<5)")
          : `p10 ${porcentajeTexto(a.p10).replace(" %", "")} · p90 ${porcentajeTexto(a.p90).replace(" %", "")} · de ${a.n_medibles} medidos`}</small></article>
    </div>
  </>;
}
