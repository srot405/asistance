"use client";
import { ESTILO } from "./Permanencia";
import { useEffect, useState } from "react";
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

// TOC-152: ingreso por evidencia y permanencia visual independiente.
export default function Presencia({ actual, modo }: { actual: ResumenHistorico; modo: "demo" | "real" }) {
  const esDetalle = actual.nivel === "Detalle";
  // 2026-10-14: semanas «Solo semanal» con roster reconstruido: lista de clases y estado semanal por persona (sin separar su clase / colado).
  const hayPresencia = esDetalle || actual.nivel === "Solo semanal";
  const { puede: puedeNominal, rol } = usePuedeNominal();   // TOC-148
  const [franjas, setFranjas] = useState<DetalleSemanaResponse["franjas"]>([]);
  const [franjaId, setFranjaId] = useState("");
  const [datos, setDatos] = useState<PresenciaClaseResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [falloExport, setFalloExport] = useState("");
  const confianza = mapaConfianza(useConfianzaSemana(actual.semana, modo, esDetalle).datos);

  useEffect(() => { setFranjaId(""); setDatos(null); setError(""); setFalloExport(""); }, [actual.semana]);

  useEffect(() => {
    if (!hayPresencia) { setFranjas([]); return; }
    let cancelado = false;
    (async () => {
      try {
        const params = new URLSearchParams({ semana: actual.semana });
        const headers = await headersAuth(modo, params);
        if (!esDetalle) params.set("listar", "franjas");
        const response = await fetch(esDetalle ? `/api/detalle?${params}` : `/api/presencia?${params}`, { headers, cache: "no-store" });
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
  }, [actual.semana, esDetalle, hayPresencia, modo]);

  useEffect(() => {
    if (!hayPresencia || !franjaId) { setDatos(null); return; }
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
  }, [actual.semana, esDetalle, hayPresencia, franjaId, modo]);


  async function descargar() {
    if (!franjaId) return;
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, franja: franjaId, vista: "presencia" });
    const url = new URL(`/api/exportar-nominal?${params}`, window.location.origin);
    const err = await descargarCsv(url, modo, `asistencia_${actual.semana}_${franjaId}_presencia.csv`);
    if (err) setFalloExport(err);
  }

  if (!hayPresencia) return <section className="panel presencia-panel" aria-label="Presencia por clase">
    <div className="section-heading"><div><h2>Presencia por clase</h2></div></div>
    <p className="historical-notice missing-notice">
      Esta semana es nivel <b>{actual.nivel}</b>: no tiene detalle por persona, así que la presencia no está disponible.
    </p>
  </section>;

  return <section className="panel presencia-panel" aria-label="Ingreso y permanencia">
    <h2>Ingreso y permanencia</h2>
    <p>Entró a la clase: Sí con cualquier entrada identificada, aunque dure medio segundo.
      El porcentaje de permanencia se muestra por separado.</p>
    <label className="presencia-selector">Clase <select className="control" value={franjaId} onChange={(e) => setFranjaId(e.target.value)}>
      {franjas.map((f) => <option key={f.slot_id} value={f.slot_id}>{f.horario_texto}</option>)}
    </select></label>
    {franjaId && <p className="presencia-confianza"><ChipConfianza c={confianza.get(franjaId)} /></p>}
    {error && <p className="historical-notice missing-notice" role="alert">{error}</p>}
    {cargando && <p className="nota" role="status">Cargando…</p>}
    {!error && !cargando && franjas.length === 0 && <p className="historical-notice weekly-notice" data-testid="presencia-sin-clases">
      Esta semana todavía no tiene clases en el roster congelado, así que no hay una clase que elegir.</p>}
    {datos && !cargando && <>
      {datos.reconstruida && <p className="historical-notice weekly-notice" role="note" data-testid="presencia-reconstruida">
        <b>Semana reconstruida.</b> La lista de esta clase es la asignación actual de cada persona, no la de entonces;
        el ingreso corresponde a la semana y la permanencia a su mejor clase. No se separa «su clase» y «colados».
        No aparecen las personas sin clase asignada ni las de clases sin captura de Zoom.</p>}
      {datos.ingreso && datos.permanencia ? <>
        <div className="presencia-grid" aria-label="Entró a clase">
          <article className="presencia-card"><span>Sí</span><strong>{datos.ingreso.si}</strong></article>
          <article className="presencia-card"><span>No</span><strong>{datos.ingreso.no}</strong></article>
          <article className="presencia-card"><span>Sin dato de ingreso</span><strong>{datos.ingreso.sin_dato}</strong></article>
        </div>
        <h3>Permanencia de quienes entraron</h3>
        <div className="presencia-grid">
          {(["rojo", "amarillo", "verde", "sin_dato"] as const).map((c) => <article key={c} className="presencia-card" style={ESTILO[c]}>
            <span>{c === "sin_dato" ? "Sin dato de tiempo" : c}</span><strong>{datos.permanencia![c]}</strong>
          </article>)}
        </div>
        <p>{datos.medible} personas en el roster. La falta de tiempo no cambia un Sí.</p>
      </> : <p role="status">Esta respuesta aún no incluye ingreso independiente y semáforo 60/80.</p>}
      {datos.permanencia && datos.permanencia.sin_dato > 0 && <p className="historical-notice weekly-notice" data-testid="presencia-sin-dato">
        {datos.permanencia.sin_dato} personas entraron pero su tiempo aún no está medido o no se pudo medir.
        No cuentan como falta ni reciben color de permanencia.</p>}
      {datos.medible === 0 && <p className="historical-notice weekly-notice" data-testid="presencia-sin-medibles">
        Esta clase no tiene personas medibles: aún no ocurre, no tiene captura o su roster está vacío.</p>}
      {puedeNominal && !datos.reconstruida && <button className="control" onClick={descargar}>Descargar CSV: ingreso y permanencia{modo === "demo" && " (práctica)"}</button>}
      {!puedeNominal && rol.nominal !== "cargando" && <p className="nota" data-testid="sin-nominal">{textoSinNominal(rol)}</p>}
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </>}
    <p>Rojo: menos de 60 % · Amarillo: desde 60 % y menos de 80 % · Verde: desde 80 %.
      Sin dato: no se pudo medir. Los colores no toman ninguna acción sobre estudiantes.</p>
    <p>En semanas con detalle, el Sí/No se refiere a la clase elegida; entrar solo a otra clase
      conserva el ingreso semanal en Calendario, pero no marca Sí en esta clase.</p>
    <p className="nota" data-testid="presencia-fuentes">Dos fuentes: el ingreso sale de las entradas registradas
      y la permanencia de la API de Zoom. En esta vista se mira la clase elegida; en Tiempo, la mejor clase de cada persona,
      así que pueden diferir (por ejemplo, un colado).</p>
  </section>;
}
