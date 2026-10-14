import { useState } from "react";
import type { ResumenHistorico } from "../lib/types";
import type { CamposResumenVivo } from "../lib/servidor/leerHistorico";
import { textoBaseSeguimiento } from "../lib/baseSeguimiento.mjs";
import { ETIQUETA_SIN_SABADO, ICONO_SIN_SABADO } from "../lib/franjaTipo.mjs";
import type { ConteoOrigen, TiempoNoDisponible, TiempoSemanaResponse } from "../lib/tiempoContrato.d.mts";
import { ICONOS, TEXTO_NO_DISPONIBLE, textoCobertura } from "../lib/tiempoVista.mjs";

const SOLO = "Semana recuperada solo a nivel semanal: sin detalle por día ni por clase.";
const porcentaje = (valor: number | null) => valor == null ? "—" : `${valor.toFixed(1)} %`;
// Con clases sin captura, "ingresaron" solo puede subir: la cifra es un piso, no el valor real.
const esMinimo = (fila: ResumenHistorico) => fila.nivel !== "Sin dato" && !fila.captura_completa;
const MINIMO = "mínimo: hubo clases sin captura";

// Fase 1.1 plan veracidad (2026-10-09): en semanas "Detalle" /api/datos recalcula la cifra en vivo (= calendario sin filtros) y
// deja la del ETL como *_etl. Aqui solo se rotula el origen; nunca se mezcla ni se inventa una cifra.
type FilaHero = ResumenHistorico & CamposResumenVivo;
const difiereDelEtl = (f: FilaHero) => f.resumen_fuente === "vivo" && f.asistieron_etl !== undefined
  && (f.asistieron_etl !== f.asistieron || f.poblacion_etl !== f.poblacion);
function OrigenCifra({ fila }: { fila: FilaHero }) {
  if (fila.nivel !== "Detalle" || !fila.resumen_fuente) return null;
  if (fila.resumen_fuente === "etl") return <span className="origen-cifra" data-testid="origen-cifra">
    {" · "}cifra guardada al cierre de la semana (no se pudo calcular en vivo)</span>;
  return <span className="origen-cifra" data-testid="origen-cifra" title={fila.resumen_calculado_en
    ? `Calculado ${new Date(fila.resumen_calculado_en).toLocaleString("es-CO")}` : undefined}>
    {" · "}calculado en vivo, igual al calendario
    {difiereDelEtl(fila) && <> · la cifra guardada al cierre decía {fila.asistieron_etl ?? "—"} de {fila.poblacion_etl ?? "—"} ({porcentaje(fila.porcentaje_retencion_etl ?? null)})</>}
  </span>;
}

function Nivel({ nivel }: { nivel: ResumenHistorico["nivel"] }) {
  const clase = nivel === "Detalle" ? "detail" : nivel === "Solo semanal" ? "weekly" : "missing";
  return <span className={`level-badge ${clase}`}>{nivel}</span>;
}

// Regla C (2026-10-14). Un selector de POBLACION gobierna las tres tarjetas, que cuentan personas (nadie dos veces):
//  - todos:   los que ingresaron (a su clase o a cualquier otra). Misma base que «Ingresaron».
//  - horario: los que entraron a SU propia clase.
//  - colados: los que entraron SOLO a otra clase (colados/visitas). Por definicion todos ingresaron: «No ingresaron» no aplica.
// La tarjeta de tiempo es de COBERTURA: de las personas de la poblacion, cuantas tienen un % de estancia medido (aunque sea minimo),
// y cuantas no superan el 50 % ni con su mejor clase. El % de cada persona sale de su mejor clase (veredicto semanal guardado).
export type Poblacion = "todos" | "horario" | "colados";
const pctEntero = (c: number, n: number) => n > 0 ? `${Math.round((c / n) * 100)} %` : "—";
const ETIQUETA_POBLACION: Record<Poblacion, string> = { todos: "Todos los que ingresaron", horario: "En su horario", colados: "Colados" };
const QUIENES: Record<Poblacion, string> = { todos: "personas que ingresaron", horario: "personas que entraron a su clase", colados: "colados" };

function SelectorPoblacion({ actual, valor, onCambiar }: { actual: FilaHero; valor: Poblacion; onCambiar: (p: Poblacion) => void }) {
  const cuantos: Record<Poblacion, number | null> = { todos: actual.asistieron, horario: actual.ingresaron_horario ?? null, colados: actual.ingresaron_colados ?? null };
  return <div className="poblacion-vistas" role="radiogroup" aria-label="Población que muestran las tarjetas" data-testid="selector-poblacion">
    {(["todos", "horario", "colados"] as Poblacion[]).map((p) =>
      <button key={p} type="button" role="radio" className="poblacion-vista" data-poblacion={p} aria-checked={valor === p} onClick={() => onCambiar(p)}>
        {ETIQUETA_POBLACION[p]} · {cuantos[p] ?? "—"}</button>)}
  </div>;
}

function TarjetaTiempo({ actual, tiempo, t, irATiempo, poblacion }: {
  actual: FilaHero; tiempo: { estado: string; datos: TiempoSemanaResponse | TiempoNoDisponible | null };
  t: TiempoSemanaResponse | null; irATiempo?: () => void; poblacion: Poblacion;
}) {
  const origen = t?.origen_personas ?? null;
  const fila: ConteoOrigen | null = !origen ? null : poblacion === "horario" ? origen.con_propia : poblacion === "colados" ? origen.solo_visita : origen.total;
  const esperadas = poblacion === "horario" ? actual.ingresaron_horario : poblacion === "colados" ? actual.ingresaron_colados : actual.asistieron;
  const faltan = fila && esperadas != null ? Math.max(fila.sin_pct, esperadas - fila.con_pct) : 0;   // ingresaron (en vivo) y aun sin % en la base
  const verPestana = irATiempo ? <button type="button" className="link-boton" onClick={irATiempo}>ver pestaña Tiempo</button> : "ver pestaña Tiempo";
  const provisional = t?.provisional ? <> · ⏳ provisional</> : null;
  const sp = t?.semana_personas ?? null;
  return <article className="metric-card tiempo" data-testid="tarjeta-tiempo" data-poblacion-tiempo={poblacion}>
    <span><b aria-hidden="true">{ICONOS.rojo_tiempo}</b> Tiempo en clase · % de estancia</span>
    {t && t.hay_tiempos ? (fila ? <>
      <strong>{pctEntero(fila.con_pct, fila.personas)}</strong>
      <small><b>{fila.con_pct} de {fila.personas} {QUIENES[poblacion]} con % de estancia en sala</b>
        {faltan > 0 && (!actual.cerrada_en
          ? <span data-testid="nota-tiempo-desfase"> · {faltan} por calcular (el tiempo se actualiza cada ~15 min)</span>
          : <b className="tiempo-alerta" data-testid="alerta-sin-pct"> · ⚠ {faltan} sin % de estancia (revisar)</b>)}
        {" "}· <b className="tiempo-bajo50" data-testid="bajo-50">{fila.rojo} no superan el 50 % de estancia ni con su mejor clase</b> · {fila.cumplen} sí lo superan
        {fila.pendientes > 0 && <> · {fila.pendientes} pendientes de medir</>}
        {provisional} · {verPestana}</small></>
      : poblacion === "colados"
        ? <><strong>—</strong><small>Sin detalle por persona de los colados para esta semana (falta la vista de origen). Entradas de visita: {t.visitas.sesiones} · {t.visitas.cumplen} cumplen · {t.visitas.rojo} bajo 50 %{provisional} · {verPestana}</small></>
        : poblacion === "horario"
          ? <><strong>{t.semana_agregada.n_ingresaron > 0 ? pctEntero(t.semana_agregada.n_medibles, t.semana_agregada.n_ingresaron) : "—"}</strong>
            <small><b>{textoCobertura(t.semana_agregada)}</b> · {t.semana_agregada.n_rojo} no superan el 50 % de estancia{provisional} · {verPestana}</small></>
          : sp ? <><strong>{pctEntero(sp.medidos, sp.con_entrada)}</strong>
            <small><b>{sp.medidos} de {sp.con_entrada} personas que ingresaron con tiempo medido</b> · {sp.rojo} no superan el 50 % de estancia ni con su mejor clase · {sp.cumplen} sí lo superan{provisional} · {verPestana}</small></>
            : <><strong>—</strong><small>Sin veredicto por persona para esta semana{provisional} · {verPestana}</small></>)
      : <><strong>—</strong><small>{tiempo.estado === "cargando" ? "Cargando tiempo…" : tiempo.estado === "vacio" ? "Aún no hay tiempos calculados para esta semana." : TEXTO_NO_DISPONIBLE}</small></>}
  </article>;
}

// Vista "Semana" (TOC-91, 2026-09-29): solo la semana elegida en el selector,
// nunca mezclada con otras. La comparación entre semanas vive en la pestaña
// "Historial" -> components/TendenciaHistorica.tsx. El detalle por día pasó del
// listado estático de antes a components/CalendarioSemana.tsx (interactivo).
export default function ResumenSemanaVisual({ actual, sinSabado, tiempo, irATiempo, poblacionInicial }: {
  actual: FilaHero;
  // TOC-91, 2026-09-29 (pedido de Samuel): esta semana el sábado no tuvo clase
  // regular (ver lib/franjaTipo.mjs::semanaSinSabado). Se calcula una sola vez en
  // Dashboard.tsx y se pasa aquí para no repetir la comparación entre semanas.
  sinSabado: boolean;
  // TOC-140: tarjeta de tiempo (opcional para no romper usos anteriores).
  tiempo?: { estado: string; datos: TiempoSemanaResponse | TiempoNoDisponible | null };
  irATiempo?: () => void;
  poblacionInicial?: Poblacion;              // solo para pruebas de renderizado estatico
}) {
  const t = tiempo?.datos && tiempo.datos.disponible ? tiempo.datos : null;
  const [elegida, setElegida] = useState<Poblacion>(poblacionInicial ?? "todos");
  // El selector solo existe con la cifra en vivo (trae horario y colados por persona); sin ella se muestra todo como siempre.
  const hayPoblaciones = actual.nivel === "Detalle" && actual.ingresaron_horario != null && actual.ingresaron_colados != null;
  const poblacion: Poblacion = hayPoblaciones ? elegida : "todos";
  const abierta = actual.nivel === "Detalle" && !actual.cerrada_en;       // semana en curso: cifras parciales
  const horario = actual.ingresaron_horario ?? 0, colados = actual.ingresaron_colados ?? 0, total = actual.poblacion ?? 0;
  return <>
    <section className="historical-hero">
      <div><p className="eyebrow">Semana del {actual.semana} · {actual.materia}
          {sinSabado && <span className="badge-sin-sabado" title="Las franjas de sábado de esta semana no tuvieron clase regular.">
            {ICONO_SIN_SABADO} Semana {ETIQUETA_SIN_SABADO}
          </span>}
        </p>
        <h1>Ingresos a clases virtuales</h1>
        <p className="hero-copy">Cuántos entraron a clase esta semana y cuánto tiempo se quedaron.</p>
      </div>
    </section>

    {abierta && <p className="historical-notice weekly-notice" data-testid="aviso-semana-abierta">⏳ Semana abierta: solo cuentan las clases ya realizadas. «Aún no ingresaron» puede bajar cuando se dicten las demás.</p>}
    {hayPoblaciones && <SelectorPoblacion actual={actual} valor={poblacion} onCambiar={setElegida} />}
    <section className="metric-grid" aria-label="Cifras de la semana" data-poblacion={poblacion}>
      <article className="metric-card retained"><span>Ingresaron{poblacion === "horario" ? " a su clase" : poblacion === "colados" ? " (colados)" : ""}</span>
        {poblacion === "todos" && <><strong>{porcentaje(actual.porcentaje_retencion)}</strong>
          <small>{actual.asistieron ?? "—"} de {actual.poblacion ?? "—"} personas medibles{esMinimo(actual) && <> · <b>{MINIMO}</b></>} · <a href="#definiciones">¿Qué significa?</a>
            <OrigenCifra fila={actual} /></small></>}
        {poblacion === "horario" && <><strong>{total > 0 ? porcentaje((horario / total) * 100) : "—"}</strong>
          <small>{horario} de {total} personas medibles entraron a su propia clase{esMinimo(actual) && <> · <b>{MINIMO}</b></>} · <a href="#definiciones">¿Qué significa?</a></small></>}
        {poblacion === "colados" && <><strong>{colados > 0 ? "100 %" : "—"}</strong>
          <small>{colados} de {colados} colados: entraron a una clase que no es la suya y no a la suya; por definición todos ingresaron · <a href="#definiciones">¿Qué significa?</a></small></>}
      </article>
      <article className="metric-card absent"><span>{poblacion === "horario" ? "No entraron a su clase" : poblacion === "colados" ? "No ingresaron (colados)" : abierta ? "Aún no ingresaron" : "No ingresaron"}</span>
        {poblacion === "todos" && <><strong>{porcentaje(actual.porcentaje_nunca)}</strong><small>{actual.nunca ?? "—"} personas · <a href="#definiciones">¿Qué significa?</a></small></>}
        {poblacion === "horario" && <><strong>{total > 0 ? porcentaje(((total - horario) / total) * 100) : "—"}</strong>
          <small>{total - horario} personas no entraron a su clase: {actual.nunca ?? "—"} no entraron a ninguna clase y {colados} entraron solo como colados · <a href="#definiciones">¿Qué significa?</a></small></>}
        {poblacion === "colados" && <><strong>No aplica</strong><small>un colado, por definición, sí ingresó (entró a otra clase) · <a href="#definiciones">¿Qué significa?</a></small></>}
      </article>
      {tiempo && actual.nivel === "Detalle" && <TarjetaTiempo actual={actual} tiempo={tiempo} t={t} irATiempo={irATiempo} poblacion={poblacion} />}
    </section>

    {actual.nivel === "Solo semanal" && <p className="historical-notice weekly-notice">{SOLO}</p>}
    {actual.nivel === "Sin dato" && <p className="historical-notice missing-notice"><b>Sin dato suficiente.</b>{" "}
      {actual.aviso.replace(/^Sin dato suficiente\s*·?\s*/, "")}</p>}

    <section className="panel reconciliation" aria-label="Lista de la semana">
      <div className="section-heading"><div><h2>Lista de la semana</h2><p>Todas las personas de la lista, repartidas por estado.</p></div><Nivel nivel={actual.nivel} /></div>
      <div className="reconciliation-line" role="status"><b>{actual.cuadre.roster} personas en la lista</b><span>=</span>
        <span>{actual.cuadre.medibles} medibles</span><span>+</span><span>{actual.cuadre.sin_dato} sin dato</span><span>+</span>
        <span>{actual.cuadre.pendientes} pendientes</span><span>+</span><span>{actual.cuadre.sin_clase} sin clase realizada</span>
      </div>
      {actual.cuadre.roster > 0 && <p className="coverage-line" data-testid="base-seguimiento">Base del denominador:{" "}
        <b>{textoBaseSeguimiento(actual.cuadre.roster, actual.congelada_en, { reconstruida: actual.roster_reconstruido })}</b></p>}
      <p className="coverage-line">Captura: <b>{actual.clases_capturadas}</b> de <b>{actual.clases_programadas ?? "?"}</b> clases
        {actual.porcentaje_cobertura != null && <> · {porcentaje(actual.porcentaje_cobertura)}</>}</p>
    </section>

    <details className="panel definitions" id="definiciones"><summary>Cómo se calculan estas cifras</summary>
      <p><b>Ingresaron:</b> personas del roster medible con al menos una entrada identificada en la semana.</p>
      <p><b>Población (botones de arriba):</b> «Todos los que ingresaron» = entraron a su clase o a otra; «En su horario» = entraron a su propia clase; «Colados» = entraron solo a otra clase. Cada persona está en una sola de las dos últimas, así que suman el total. Un colado siempre ingresó, por eso «No ingresaron» no aplica para ellos.</p>
      <p><b>Tiempo en clase · % de estancia:</b> cuenta personas, no entradas. «Con % de estancia» son las que ingresaron y tienen un % medido en alguna clase (el de su mejor clase), aunque sea mínimo; el objetivo es que sean todas. «No superan el 50 % ni con su mejor clase» son las que, aun en su mejor clase medida, no llegaron a la mitad del tiempo; su % bajo se conserva y se muestra. Si alguna persona que ingresó no tuviera ningún % medido, la tarjeta lo avisa.</p>
      <p><b>No ingresaron:</b> personas medibles sin ninguna entrada identificada; no incluye clases pendientes ni sin dato.</p>
      <p><b>Calculado en vivo:</b> en semanas con detalle, estas cifras y el cuadre se recalculan desde las tablas del panel (las mismas del calendario); la cifra guardada al cierre de la semana se conserva solo como referencia.</p>
      <p><b>Mínimo:</b> la semana tuvo clases sin captura (sobre todo de la cuenta soporte). El % real de ingreso es igual o mayor al mostrado.</p>
      <p><b>Nunca en el período:</b> personas activas al cierre del período que no aparecen identificadas en ninguna semana mostrada.</p>
    </details>
  </>;
}
