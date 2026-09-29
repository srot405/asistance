import type { ResumenHistorico } from "../lib/types";
import { ETIQUETA_SIN_SABADO, ICONO_SIN_SABADO } from "../lib/franjaTipo.mjs";

const SOLO = "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase.";
const porcentaje = (valor: number | null) => valor == null ? "—" : `${valor.toFixed(1)} %`;
// Con clases sin captura, "ingresaron" solo puede subir: la cifra es un piso, no el valor real.
const esMinimo = (fila: ResumenHistorico) => fila.nivel !== "Sin dato" && !fila.captura_completa;
const MINIMO = "mínimo: hubo clases sin captura";

function Nivel({ nivel }: { nivel: ResumenHistorico["nivel"] }) {
  const clase = nivel === "Detalle" ? "detail" : nivel === "Solo semanal" ? "weekly" : "missing";
  return <span className={`level-badge ${clase}`}>{nivel}</span>;
}

// Vista "Semana" (TOC-91, 2026-09-29): solo la semana elegida en el selector,
// nunca mezclada con otras. La comparación entre semanas vive en la pestaña
// "Historial" -> components/TendenciaHistorica.tsx. El detalle por día pasó del
// listado estático de antes a components/CalendarioSemana.tsx (interactivo).
export default function ResumenSemanaVisual({ actual, nuncaPeriodo, sinSabado }: {
  actual: ResumenHistorico;
  nuncaPeriodo: number | null;
  // TOC-91, 2026-09-29 (pedido de Samuel): esta semana el sábado no tuvo clase
  // regular (ver lib/franjaTipo.mjs::semanaSinSabado). Se calcula una sola vez en
  // Dashboard.tsx y se pasa aquí para no repetir la comparación entre semanas.
  sinSabado: boolean;
}) {
  return <>
    <section className="historical-hero">
      <div><p className="eyebrow">Semana del {actual.semana} · {actual.materia}
          {sinSabado && <span className="badge-sin-sabado" title="Las franjas de sábado de esta semana no tuvieron clase regular.">
            {ICONO_SIN_SABADO} Semana {ETIQUETA_SIN_SABADO}
          </span>}
        </p>
        <h1>Ingresos a clases virtuales</h1>
        <p className="hero-copy">Una lectura ejecutiva del alcance semanal, con el nivel de evidencia visible.</p>
      </div>
      <div className="period-never" aria-label="Nunca ingresaron en todo el período">
        <strong>{nuncaPeriodo ?? "—"}</strong><span>nunca ingresaron en todo el período</span>
        {actual.periodo_desde && actual.periodo_hasta && <small>{actual.periodo_desde} a {actual.periodo_hasta}</small>}
      </div>
    </section>

    <section className="metric-grid" aria-label="Cifras de la semana">
      <article className="metric-card retained"><span>Ingresaron</span>
        <strong>{porcentaje(actual.porcentaje_retencion)}</strong>
        <small>{actual.asistieron ?? "—"} de {actual.poblacion ?? "—"} personas medibles{esMinimo(actual) && <> · <b>{MINIMO}</b></>} · <a href="#definiciones">¿Qué significa?</a></small>
      </article>
      <article className="metric-card absent"><span>No ingresaron</span>
        <strong>{porcentaje(actual.porcentaje_nunca)}</strong><small>{actual.nunca ?? "—"} personas · <a href="#definiciones">¿Qué significa?</a></small>
      </article>
    </section>

    {actual.nivel === "Solo semanal" && <p className="historical-notice weekly-notice">{SOLO}</p>}
    {actual.nivel === "Sin dato" && <p className="historical-notice missing-notice"><b>Sin dato suficiente.</b>{" "}
      {actual.aviso.replace(/^Sin dato suficiente\s*·?\s*/, "")}</p>}

    <section className="panel reconciliation" aria-label="Cuadre del roster">
      <div className="section-heading"><div><h2>Cuadre del roster</h2><p>La población siempre debe quedar completamente explicada.</p></div><Nivel nivel={actual.nivel} /></div>
      <div className="reconciliation-line" role="status"><b>{actual.cuadre.roster} roster</b><span>=</span>
        <span>{actual.cuadre.medibles} medibles</span><span>+</span><span>{actual.cuadre.sin_dato} sin dato</span><span>+</span>
        <span>{actual.cuadre.pendientes} pendientes</span><span>+</span><span>{actual.cuadre.sin_clase} sin clase ocurrida</span>
      </div>
      <p className="coverage-line">Captura: <b>{actual.clases_capturadas}</b> de <b>{actual.clases_programadas ?? "?"}</b> clases
        {actual.porcentaje_cobertura != null && <> · {porcentaje(actual.porcentaje_cobertura)}</>}</p>
    </section>

    <details className="panel definitions" id="definiciones"><summary>Cómo se calculan estas cifras</summary>
      <p><b>Ingresaron:</b> personas del roster medible con al menos una entrada identificada en la semana.</p>
      <p><b>No ingresaron:</b> personas medibles sin ninguna entrada identificada; no incluye clases pendientes ni sin dato.</p>
      <p><b>Mínimo:</b> la semana tuvo clases sin captura (sobre todo de la cuenta soporte). El % real de ingreso es igual o mayor al mostrado.</p>
      <p><b>Nunca en el período:</b> personas activas al cierre del período que no aparecen identificadas en ninguna semana mostrada.</p>
    </details>
  </>;
}
