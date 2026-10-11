"use client";
import { useEffect, useMemo, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import { textoSinNominal, usePuedeNominal } from "../lib/rolUi";
import { useConfianzaSemana } from "../lib/useTiempo";
import ChipConfianza, { mapaConfianza } from "./ChipConfianza";
import type { DetalleSemanaResponse, PresenciaClaseResponse, ResumenHistorico } from "../lib/types";

async function headersAuth(modo: "demo" | "real", params: URLSearchParams): Promise<Record<string, string>> {
  if (modo === "demo") { params.set("demo", "1"); return {}; }
  const sesion = await sesionActual();
  if (!sesion?.access_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  return { Authorization: `Bearer ${sesion.access_token}` };
}

// Pestaña "Presencia" (TOC-91, pedido de Samuel 2026-09-29): asistencia de UNA
// clase (franja). Desde TOC-146 usa el criterio ÚNICO del 50 % de Tiempo:
// 🟢 Presente (50 % o más) · 🟠 Parcial (menos del 50 %) · 🔴 Nunca entró,
// y ◌ Sin dato de tiempo (entró pero no se pudo medir). Solo existe para
// semanas nivel "Detalle" (roster congelado real) — ver lib/servidor/leerPresenciaClase.ts. La lista de franjas se toma de
// /api/detalle (misma fuente que usa CalendarioSemana), sin duplicar esa
// consulta a mano.
export default function Presencia({ actual, modo }: { actual: ResumenHistorico; modo: "demo" | "real" }) {
  const esDetalle = actual.nivel === "Detalle";
  const { puede: puedeNominal, rol } = usePuedeNominal();   // TOC-148
  const [franjas, setFranjas] = useState<DetalleSemanaResponse["franjas"]>([]);
  const [franjaId, setFranjaId] = useState("");
  const [datos, setDatos] = useState<PresenciaClaseResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [falloExport, setFalloExport] = useState("");
  const confianza = mapaConfianza(useConfianzaSemana(actual.semana, modo, esDetalle).datos);   // TOC-151

  useEffect(() => { setFranjaId(""); setDatos(null); setError(""); setFalloExport(""); }, [actual.semana]);

  useEffect(() => {
    if (!esDetalle) { setFranjas([]); return; }
    let cancelado = false;
    (async () => {
      try {
        const params = new URLSearchParams({ semana: actual.semana });
        const headers = await headersAuth(modo, params);
        const response = await fetch(`/api/detalle?${params}`, { headers, cache: "no-store" });
        if (!response.ok) throw new Error(`No se pudo cargar la lista de clases (HTTP ${response.status}).`);
        const data = (await response.json()) as DetalleSemanaResponse;
        if (!cancelado) {
          setFranjas(data.franjas);
          if (data.franjas.length > 0) setFranjaId((previa) => previa || data.franjas[0].slot_id);
        }
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelado = true; };
  }, [actual.semana, esDetalle, modo]);

  useEffect(() => {
    if (!esDetalle || !franjaId) { setDatos(null); return; }
    let cancelado = false;
    (async () => {
      setCargando(true); setError("");
      try {
        const params = new URLSearchParams({ semana: actual.semana, franja: franjaId });
        const headers = await headersAuth(modo, params);
        const response = await fetch(`/api/presencia?${params}`, { headers, cache: "no-store" });
        if (!response.ok) throw new Error(`No se pudo cargar la presencia de la clase (HTTP ${response.status}).`);
        const data = (await response.json()) as PresenciaClaseResponse;
        if (!cancelado) setDatos(data);
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [actual.semana, esDetalle, franjaId, modo]);

  const horarioDe = useMemo(() => (id: string) => franjas.find((f) => f.slot_id === id)?.horario_texto ?? id, [franjas]);

  async function descargar() {
    if (!franjaId) return;
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, franja: franjaId, vista: "presencia" });
    const url = new URL(`/api/exportar-nominal?${params}`, window.location.origin);
    const err = await descargarCsv(url, modo, `asistencia_${actual.semana}_${franjaId}_presencia.csv`);
    if (err) setFalloExport(err);
  }

  if (!esDetalle) return <section className="panel presencia-panel" aria-label="Presencia por clase">
    <div className="section-heading"><div><h2>Presencia por clase</h2></div></div>
    <p className="historical-notice missing-notice">
      Esta semana es nivel <b>{actual.nivel}</b>: no tiene roster congelado por clase, así que la presencia
      Presente/Parcial/Nunca entró no está disponible (igual que el calendario y el CSV nominal).
    </p>
  </section>;

  const total = datos ? datos.conteos.presente + datos.conteos.parcial + datos.conteos.nunca_entro + datos.conteos.sin_dato : 0;
  const pct = (n: number) => (total ? `${((n * 100) / total).toFixed(1)} %` : "—");

  return <section className="panel presencia-panel" aria-label="Presencia por clase">
    <div className="section-heading">
      <div><h2>Presencia por clase</h2>
        <p>Quién estuvo en una clase, con el mismo criterio de la pestaña <b>Tiempo</b>: el 50 % del tiempo de su clase.</p></div>
    </div>

    <label className="presencia-selector">Clase <select className="control" value={franjaId}
      onChange={(e) => setFranjaId(e.target.value)}>
      {franjas.map((f) => <option key={f.slot_id} value={f.slot_id}>{f.horario_texto}</option>)}
    </select></label>
    {franjaId && <p className="presencia-confianza"><ChipConfianza c={confianza.get(franjaId)} /></p>}

    {error && <p className="historical-notice missing-notice" role="alert">{error}</p>}
    {cargando && <p className="nota">Cargando…</p>}
    {!error && !cargando && franjas.length === 0 && <p className="historical-notice weekly-notice" data-testid="presencia-sin-clases">
      Esta semana todavía no tiene clases en el roster congelado, así que no hay una clase que elegir.</p>}

    {datos && !cargando && <>
      <div className="presencia-grid" aria-label="Conteo por categoría de presencia">
        <article className="presencia-card presente">
          <span>🟢 Presente</span><strong>{datos.conteos.presente}</strong><small>{pct(datos.conteos.presente)}</small>
        </article>
        <article className="presencia-card entro-salio">
          <span>🟠 Parcial</span><strong>{datos.conteos.parcial}</strong>
          <small>{pct(datos.conteos.parcial)}</small>
        </article>
        <article className="presencia-card nunca-entro">
          <span>🔴 Nunca entró</span><strong>{datos.conteos.nunca_entro}</strong>
          <small>{pct(datos.conteos.nunca_entro)}</small>
        </article>
        <article className="presencia-card sin-dato">
          <span>◌ Sin dato de tiempo</span><strong>{datos.conteos.sin_dato}</strong>
          <small>{pct(datos.conteos.sin_dato)}</small>
        </article>
      </div>
      <p className="nota">{horarioDe(datos.slot_id)} · {datos.fecha} · {total} personas medibles</p>
      {datos.conteos.sin_dato > 0 && <p className="historical-notice weekly-notice" data-testid="presencia-sin-dato">
        {datos.conteos.sin_dato} {datos.conteos.sin_dato === 1 ? "persona entró" : "personas entraron"} pero su tiempo
        en esta clase no está medido todavía (el tiempo se calcula al cerrar la clase), no se pudo medir o entraron a otra
        clase de la semana (colados): no se cuentan como Parcial ni como falta.
      </p>}
      {total === 0 && <p className="historical-notice weekly-notice" data-testid="presencia-sin-medibles">
        Esta clase no tiene personas medibles: aún no ocurre, no tiene captura o su roster está vacío.</p>}
      {puedeNominal ? <button className="control" onClick={descargar}>
        Descargar CSV: presencia de esta clase{modo === "demo" && " (práctica)"}
      </button>
        : rol.nominal !== "cargando" && <p className="nota" data-testid="sin-nominal">{textoSinNominal(rol)}</p>}
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </>}

    <p className="nota" data-testid="presencia-fuentes">Dos fuentes: «Nunca entró» sale de las entradas registradas (asist_entradas, a cualquier clase de la semana) y el tiempo de «Presente / Parcial» sale
      de la API de Zoom (pestaña Tiempo). Si una persona aparece distinta aquí y en Tiempo, es porque cada pantalla lee su fuente; no es un error de cálculo.</p>
    <details className="panel definitions"><summary>Cómo se calculan estas categorías</summary>
      <p><b>🟢 Presente:</b> estuvo al menos el 50&nbsp;% del tiempo de su clase (exactamente 50&nbsp;% cumple).</p>
      <p><b>🟠 Parcial:</b> estuvo menos del 50&nbsp;% del tiempo de su clase.</p>
      <p><b>🔴 Nunca entró:</b> no entró a su clase ni a ninguna otra clase de la semana (misma regla que «No ingresaron» del
        calendario: estas personas son exactamente las de ese CSV para esta clase).</p>
      <p><b>◌ Sin dato de tiempo:</b> entró, pero su tiempo en esta clase no se pudo medir o aún no se calcula; incluye a quien
        se coló en otra clase de la semana (entró, pero no a la suya). Nunca cuenta como Parcial.</p>
    </details>
  </section>;
}
