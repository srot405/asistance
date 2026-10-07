"use client";
import { useEffect, useState } from "react";
import { descargarCsv } from "../lib/descargas";
import { textoSinNominal, usePuedeNominal } from "../lib/rolUi";
import type { FiltroTiempo, TiempoSemanaResponse } from "../lib/tiempoContrato.d.mts";
import { TEXTO_NO_DISPONIBLE, ICONOS, TEXTO_ROJO_SEMANAL, UMBRAL_PORCENTAJE_ROJO, ETIQUETAS } from "../lib/tiempoVista.mjs";
import type { ResumenHistorico } from "../lib/types";
import { useConfianzaSemana, useTiempoSemana } from "../lib/useTiempo";
import { mapaConfianza } from "./ChipConfianza";
import CoberturaTiempo from "./CoberturaTiempo";
import HistogramaTiempo from "./HistogramaTiempo";
import LeyendaTiempo from "./LeyendaTiempo";
import TiempoTablaClases from "./TiempoTablaClases";
import TiempoTarjetas from "./TiempoTarjetas";
import TiempoVisitas from "./TiempoVisitas";

// Pestana "Tiempo" (TOC-140): cuanto tiempo estuvo cada persona en SU clase y quien estuvo menos del 50 %.
// Por defecto SOLO agregados (sin nombres); el nominal sale por el CSV autenticado y por la tabla «Entro a clase ajena» (TOC-147).
// Si el backend aun no tiene las tablas, muestra "Tiempo aun no disponible" y el resto del panel sigue igual.
export default function Tiempo({ actual, modo }: { actual: ResumenHistorico; modo: "demo" | "real" }) {
  const esDetalle = actual.nivel === "Detalle";
  const { puede: puedeNominal, rol } = usePuedeNominal();   // TOC-148: CSV y tabla de visitas llevan nombres
  const [filtro, setFiltro] = useState<FiltroTiempo>({});
  const [falloExport, setFalloExport] = useState("");
  useEffect(() => { setFiltro({}); setFalloExport(""); }, [actual.semana]);
  const { estado, datos, recargar } = useTiempoSemana(actual.semana, filtro, modo, esDetalle);
  const d = datos && datos.disponible ? (datos as TiempoSemanaResponse) : null;
  // TOC-151: chip de confianza + cuadre por clase; si no hay lectura, la tabla queda como antes.
  const lecturaConfianza = useConfianzaSemana(actual.semana, modo, esDetalle).datos;
  const confianza = mapaConfianza(lecturaConfianza);
  const resumenConfianza = lecturaConfianza && lecturaConfianza.disponible ? lecturaConfianza : null;

  async function descargar() {
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, vista: "tiempo" });
    for (const k of ["ciudad", "franja", "cuenta"] as const) if (filtro[k]) params.set(k, String(filtro[k]));
    const err = await descargarCsv(new URL(`/api/exportar-nominal?${params}`, window.location.origin), modo, `asistencia_${actual.semana}_tiempo.csv`);
    if (err) setFalloExport(err);
  }

  if (!esDetalle) return <section className="panel tiempo-panel" aria-label="Tiempo en clase">
    <div className="section-heading"><div><h2>Tiempo en clase</h2></div></div>
    <p className="historical-notice missing-notice">Esta semana es nivel <b>{actual.nivel}</b>: no tiene tiempo por clase (solo las semanas con roster congelado por clase).</p>
  </section>;

  return <section className="panel tiempo-panel" aria-label="Tiempo en clase" aria-busy={estado === "cargando"}>
    <div className="section-heading"><div><h2>Tiempo en clase</h2>
      <p>Regla: menos del {UMBRAL_PORCENTAJE_ROJO} % del tiempo de su clase = {ICONOS.rojo_tiempo} rojo por tiempo. Solo agregados, sin nombres; la tabla «Entró a clase ajena» es nominal.</p></div>
      {d?.provisional && <span className="badge-provisional" title="Las cifras pueden cambiar hasta que cierre la semana.">⏳ PROVISIONAL: semana abierta</span>}
    </div>

    {estado === "cargando" && <p className="nota" role="status" aria-live="polite">Cargando tiempo…</p>}
    {estado === "no_disponible" && <p className="historical-notice missing-notice" role="status" data-testid="tiempo-no-disponible">{TEXTO_NO_DISPONIBLE}</p>}
    {estado === "no_detalle" && <p className="historical-notice missing-notice">Esta semana no tiene tiempo por clase.</p>}
    {estado === "error" && <p className="historical-notice missing-notice" role="alert">No se pudo cargar el tiempo.{" "}
      <button type="button" className="control" onClick={recargar}>Reintentar</button></p>}
    {estado === "vacio" && <p className="historical-notice weekly-notice" role="status" data-testid="tiempo-vacio">
      Aún no hay tiempos calculados para esta semana. Se calculan al cerrar cada clase.</p>}

    {estado === "ok" && d && <>
      {d.provisional && <p className="historical-notice weekly-notice">Semana en curso: las cifras cambian hasta que cierre la última clase.</p>}
      <CoberturaTiempo conteos={d.semana_agregada} roster={d.roster} congeladaEn={d.congelada_en} reconstruida={d.reconstruida} />
      <div className="tiempo-filtros" aria-label="Filtros">
        <label>Ciudad <select className="control" value={filtro.ciudad ?? ""} onChange={(e) => setFiltro({ ...filtro, ciudad: e.target.value || null })}>
          <option value="">Todas</option>{d.ciudades.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Clase <select className="control" value={filtro.franja ?? ""} onChange={(e) => setFiltro({ ...filtro, franja: e.target.value || null })}>
          <option value="">Todas</option>{d.franjas.map((f) => <option key={f.slot_id} value={f.slot_id}>{f.horario_texto}</option>)}</select></label>
        <label>Cuenta Zoom <select className="control" value={filtro.cuenta ?? ""} onChange={(e) => setFiltro({ ...filtro, cuenta: e.target.value || null })}>
          <option value="">Todas</option>{d.cuentas.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      <p className="nota">Filtros por la clase y la ciudad PROPIAS de cada persona. Cada cifra de aquí cuenta a quienes ingresaron a SU clase.</p>

      <TiempoTarjetas a={d.semana_agregada} />
      <section aria-label="Visitas" className="tiempo-visitas">
        <p><b>Visitas</b> (clase que no es la suya): {d.visitas.sesiones} sesiones — cumplen {d.visitas.cumplen} · rojo {d.visitas.rojo} · sin dato {d.visitas.sin_dato}.
          No suman a los conteos de arriba.</p></section>
      {puedeNominal ? <TiempoVisitas semana={actual.semana} filtro={filtro} modo={modo} />
        : rol.nominal !== "cargando" && <p className="nota" data-testid="sin-nominal">{textoSinNominal(rol)}</p>}

      <h3>Distribución del % del tiempo de clase</h3>
      <HistogramaTiempo histograma={d.histograma} />

      {resumenConfianza && <p className="nota" data-testid="resumen-confianza">Confianza de la captura: {resumenConfianza.resumen.capturadas} de {resumenConfianza.resumen.clases} clases capturadas
        {resumenConfianza.cuadre_disponible ? ` · cuadre: ${resumenConfianza.resumen.cuadradas} cuadradas, ${resumenConfianza.resumen.con_diferencias} con diferencias, ${resumenConfianza.resumen.sin_cuadre} sin cuadre.` : " · el cuadre automático aún no está disponible en esta base."}</p>}
      <TiempoTablaClases clases={d.por_clase} dias={d.por_dia} semana={d.semana_agregada} confianza={confianza} />

      {d.semana_personas && !filtro.ciudad && !filtro.franja && !filtro.cuenta && <section className="panel tiempo-personas" aria-label="Veredicto semanal por persona">
        <h3>Veredicto de la semana por persona (la MEJOR clase)</h3>
        <p className="nota">Otra lectura, no se suma a las tablas de arriba: cada persona cuenta una vez, con su mejor clase (visitas incluidas, tiempos sin sumar).</p>
        <p>{ICONOS.cumple} cumplen {d.semana_personas.cumplen} · {ICONOS.rojo_tiempo} rojo por tiempo {d.semana_personas.rojo} · {ICONOS.sin_dato_tiempo} sin dato {d.semana_personas.sin_dato}
          {" "}· {ICONOS.no_ingreso} no ingresó {d.semana_personas.ausentes} — <b>{d.semana_personas.medidos} de {d.semana_personas.con_entrada} con tiempo medido</b></p>
        <p className="nota">Rojo semanal: «{TEXTO_ROJO_SEMANAL}».</p>
      </section>}

      {!d.cuadre.ok && <p className="historical-notice missing-notice" role="alert">Aviso: los conteos de tiempo no cuadran ({d.cuadre.errores.length} diferencias). No uses esta pantalla para decidir hasta revisarla.</p>}
      {d.cuadre_backend.estado === "DISCREPA" && <p className="historical-notice missing-notice" role="alert">Aviso: el detalle por persona no coincide con el agregado por clase ({d.cuadre_backend.detalle.length} diferencias).</p>}

      {puedeNominal && <button className="control" type="button" onClick={descargar}>Descargar CSV nominal de tiempo{modo === "demo" && " (práctica)"}</button>}
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </>}

    <LeyendaTiempo />
    <details className="panel definitions"><summary>Cómo se calcula</summary>
      <p><b>{ETIQUETAS.rojo_tiempo}:</b> estuvo conectado menos de la mitad de la duración de SU clase (la sala abre ~15 min antes y ese rato no cuenta). Exactamente 50 % cumple.</p>
      <p><b>{ETIQUETAS.sin_dato_tiempo}:</b> no se pudo medir; nunca cuenta como rojo ni como 0.</p>
      <p><b>Cobertura:</b> «N de M con tiempo medido»; con menos de 70 % se avisa y con menos de 5 medidos no se publica mediana ni distribución.</p>
      <p><b>Presencia</b> usa este mismo criterio: Presente = 50 % o más, Parcial = menos del 50 %.</p>
    </details>
  </section>;
}
