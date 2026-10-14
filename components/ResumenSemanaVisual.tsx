import type { ResumenHistorico } from "../lib/types";
import type { CamposResumenVivo } from "../lib/servidor/leerHistorico";
import { textoBaseSeguimiento } from "../lib/baseSeguimiento.mjs";
import { ETIQUETA_SIN_SABADO, ICONO_SIN_SABADO } from "../lib/franjaTipo.mjs";
import type { TiempoNoDisponible, TiempoSemanaResponse } from "../lib/tiempoContrato.d.mts";
import { ICONOS, TEXTO_NO_DISPONIBLE, textoCobertura } from "../lib/tiempoVista.mjs";

const SOLO = "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase.";
const porcentaje = (valor: number | null) => valor == null ? "—" : `${valor.toFixed(1)} %`;
// Con clases sin captura, "ingresaron" solo puede subir: la cifra es un piso, no el valor real.
const esMinimo = (fila: ResumenHistorico) => fila.nivel !== "Sin dato" && !fila.captura_completa;
// Ingresaron (calendario) cuenta entrada a cualquier clase; la tarjeta de tiempo solo a la propia (ingresaron_propios).
const otrosIngresos = (asistieron: number | null, propios: number) => asistieron == null ? 0 : Math.max(0, asistieron - propios);
const MINIMO = "mínimo: hubo clases sin captura";

// Fase 1.1 plan veracidad (2026-10-09): en semanas "Detalle" /api/datos recalcula la cifra en vivo (= calendario sin filtros) y
// deja la del ETL como *_etl. Aqui solo se rotula el origen; nunca se mezcla ni se inventa una cifra.
type FilaHero = ResumenHistorico & CamposResumenVivo;
const difiereDelEtl = (f: FilaHero) => f.resumen_fuente === "vivo" && f.asistieron_etl !== undefined
  && (f.asistieron_etl !== f.asistieron || f.poblacion_etl !== f.poblacion);
function OrigenCifra({ fila }: { fila: FilaHero }) {
  if (fila.nivel !== "Detalle" || !fila.resumen_fuente) return null;
  if (fila.resumen_fuente === "etl") return <span className="origen-cifra" data-testid="origen-cifra">
    {" · "}cifra del cierre del ETL (no se pudo calcular en vivo)</span>;
  return <span className="origen-cifra" data-testid="origen-cifra" title={fila.resumen_calculado_en
    ? `Calculado ${new Date(fila.resumen_calculado_en).toLocaleString("es-CO")}` : undefined}>
    {" · "}calculado en vivo, igual al calendario
    {difiereDelEtl(fila) && <> · el último cierre del ETL decía {fila.asistieron_etl ?? "—"} de {fila.poblacion_etl ?? "—"} ({porcentaje(fila.porcentaje_retencion_etl ?? null)})</>}
  </span>;
}

function Nivel({ nivel }: { nivel: ResumenHistorico["nivel"] }) {
  const clase = nivel === "Detalle" ? "detail" : nivel === "Solo semanal" ? "weekly" : "missing";
  return <span className={`level-badge ${clase}`}>{nivel}</span>;
}

// Vista "Semana" (TOC-91, 2026-09-29): solo la semana elegida en el selector,
// nunca mezclada con otras. La comparación entre semanas vive en la pestaña
// "Historial" -> components/TendenciaHistorica.tsx. El detalle por día pasó del
// listado estático de antes a components/CalendarioSemana.tsx (interactivo).
export default function ResumenSemanaVisual({ actual, sinSabado, tiempo, irATiempo }: {
  actual: FilaHero;
  // TOC-91, 2026-09-29 (pedido de Samuel): esta semana el sábado no tuvo clase
  // regular (ver lib/franjaTipo.mjs::semanaSinSabado). Se calcula una sola vez en
  // Dashboard.tsx y se pasa aquí para no repetir la comparación entre semanas.
  sinSabado: boolean;
  // TOC-140: tarjeta de tiempo (opcional para no romper usos anteriores).
  tiempo?: { estado: string; datos: TiempoSemanaResponse | TiempoNoDisponible | null };
  irATiempo?: () => void;
}) {
  const t = tiempo?.datos && tiempo.datos.disponible ? tiempo.datos : null;
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
    </section>

    <section className="metric-grid" aria-label="Cifras de la semana">
      <article className="metric-card retained"><span>Ingresaron</span>
        <strong>{porcentaje(actual.porcentaje_retencion)}</strong>
        <small>{actual.asistieron ?? "—"} de {actual.poblacion ?? "—"} personas medibles{esMinimo(actual) && <> · <b>{MINIMO}</b></>} · <a href="#definiciones">¿Qué significa?</a>
          <OrigenCifra fila={actual} /></small>
      </article>
      <article className="metric-card absent"><span>No ingresaron</span>
        <strong>{porcentaje(actual.porcentaje_nunca)}</strong><small>{actual.nunca ?? "—"} personas · <a href="#definiciones">¿Qué significa?</a></small>
      </article>
      {tiempo && actual.nivel === "Detalle" && <article className="metric-card tiempo" data-testid="tarjeta-tiempo"><span><b aria-hidden="true">{ICONOS.rojo_tiempo}</b> Tiempo en clase</span>
        {t && t.hay_tiempos ? <>
          <strong>{t.semana_agregada.n_medibles > 0 ? `${Math.round((t.semana_agregada.n_cumplen / t.semana_agregada.n_medibles) * 100)} %` : "—"}</strong>
          <small>{t.semana_agregada.n_cumplen} de {t.semana_agregada.n_medibles} medidos cumplen (suma de clases) · 50 % del tiempo de su clase · <b>{textoCobertura(t.semana_agregada)}</b>
            {otrosIngresos(actual.asistieron, t.semana_agregada.n_ingresaron) > 0 && <span data-testid="nota-ingresos-otros"> · de las {actual.asistieron} personas que ingresaron,
              {" "}{t.semana_agregada.n_ingresaron} entraron a su propia clase y cuentan aquí; las otras {otrosIngresos(actual.asistieron, t.semana_agregada.n_ingresaron)} entraron
              solo a otra clase (visitas, medidas aparte) o Zoom no devolvió su tiempo</span>}
            {t.provisional && <> · ⏳ provisional</>} · el veredicto semanal usa la mejor sesión: {irATiempo
              ? <button type="button" className="link-boton" onClick={irATiempo}>ver pestaña Tiempo</button> : "ver pestaña Tiempo"}</small></>
          : <><strong>—</strong><small>{tiempo.estado === "cargando" ? "Cargando tiempo…" : tiempo.estado === "vacio" ? "Aún no hay tiempos calculados para esta semana." : TEXTO_NO_DISPONIBLE}</small></>}
      </article>}
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
      {actual.cuadre.roster > 0 && <p className="coverage-line" data-testid="base-seguimiento">Base del denominador:{" "}
        <b>{textoBaseSeguimiento(actual.cuadre.roster, actual.congelada_en, { reconstruida: actual.roster_reconstruido })}</b></p>}
      <p className="coverage-line">Captura: <b>{actual.clases_capturadas}</b> de <b>{actual.clases_programadas ?? "?"}</b> clases
        {actual.porcentaje_cobertura != null && <> · {porcentaje(actual.porcentaje_cobertura)}</>}</p>
    </section>

    <details className="panel definitions" id="definiciones"><summary>Cómo se calculan estas cifras</summary>
      <p><b>Ingresaron:</b> personas del roster medible con al menos una entrada identificada en la semana.</p>
      <p><b>Tiempo en clase:</b> solo cuenta a quienes entraron a su propia clase. Quien entró a otra clase (visita) sí cuenta como «Ingresó», pero su tiempo se mide aparte; por eso «Ingresaron» puede ser mayor que las personas con tiempo medido.</p>
      <p><b>No ingresaron:</b> personas medibles sin ninguna entrada identificada; no incluye clases pendientes ni sin dato.</p>
      <p><b>Calculado en vivo:</b> en semanas con detalle, estas cifras y el cuadre se recalculan desde las tablas del panel (las mismas del calendario); el resumen del cierre del ETL se conserva solo como referencia.</p>
      <p><b>Mínimo:</b> la semana tuvo clases sin captura (sobre todo de la cuenta soporte). El % real de ingreso es igual o mayor al mostrado.</p>
      <p><b>Nunca en el período:</b> personas activas al cierre del período que no aparecen identificadas en ninguna semana mostrada.</p>
    </details>
  </>;
}
