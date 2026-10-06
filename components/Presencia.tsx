"use client";
import { useEffect, useMemo, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import type { DetalleSemanaResponse, PresenciaClaseResponse, ResumenHistorico } from "../lib/types";

async function headersAuth(modo: "demo" | "real", params: URLSearchParams): Promise<Record<string, string>> {
  if (modo === "demo") { params.set("demo", "1"); return {}; }
  const sesion = await sesionActual();
  if (!sesion?.access_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  return { Authorization: `Bearer ${sesion.access_token}` };
}

// Pestaña "Presencia" (TOC-91, pedido de Samuel 2026-09-29): asistencia de UNA
// clase (franja) clasificada en las mismas 3 categorías del reporte en vivo
// por correo (reporte_15min.py): 🟢 Presente · 🟠 Entró y salió · 🔴 Nunca
// entró. Solo existe para semanas nivel "Detalle" (roster congelado real) —
// ver lib/servidor/leerPresenciaClase.ts. La lista de franjas se toma de
// /api/detalle (misma fuente que usa CalendarioSemana), sin duplicar esa
// consulta a mano.
export default function Presencia({ actual, modo }: { actual: ResumenHistorico; modo: "demo" | "real" }) {
  const esDetalle = actual.nivel === "Detalle";
  const [franjas, setFranjas] = useState<DetalleSemanaResponse["franjas"]>([]);
  const [franjaId, setFranjaId] = useState("");
  const [datos, setDatos] = useState<PresenciaClaseResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [falloExport, setFalloExport] = useState("");

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
      Presente/Entró y salió/Nunca entró no está disponible (igual que el calendario y el CSV nominal).
    </p>
  </section>;

  const total = datos ? datos.conteos.presente + datos.conteos.entro_y_salio + datos.conteos.nunca_entro : 0;
  const pct = (n: number) => (total ? `${((n * 100) / total).toFixed(1)} %` : "—");

  return <section className="panel presencia-panel" aria-label="Presencia por clase">
    <div className="section-heading">
      <div><h2>Presencia por clase</h2>
        <p>Mismas 3 categorías del reporte en vivo por correo, aplicadas a una clase ya cerrada.</p></div>
    </div>

    <p className="historical-notice weekly-notice" data-testid="aviso-presencia-legado">Esta pestaña usa el criterio de presencia en vivo (70 % de la clase).
      El criterio oficial de tiempo (menos del 50 % del tiempo de su clase = rojo por tiempo) está en la pestaña <b>Tiempo</b>.</p>

    <label className="presencia-selector">Clase <select className="control" value={franjaId}
      onChange={(e) => setFranjaId(e.target.value)}>
      {franjas.map((f) => <option key={f.slot_id} value={f.slot_id}>{f.horario_texto}</option>)}
    </select></label>

    {error && <p className="historical-notice missing-notice" role="alert">{error}</p>}
    {cargando && <p className="nota">Cargando…</p>}

    {datos && !cargando && <>
      <div className="presencia-grid" aria-label="Conteo por categoría de presencia">
        <article className="presencia-card presente">
          <span>🟢 Presente</span><strong>{datos.conteos.presente}</strong><small>{pct(datos.conteos.presente)}</small>
        </article>
        <article className="presencia-card entro-salio">
          <span>🟠 Entró y salió</span><strong>{datos.conteos.entro_y_salio}</strong>
          <small>{pct(datos.conteos.entro_y_salio)}</small>
        </article>
        <article className="presencia-card nunca-entro">
          <span>🔴 Nunca entró</span><strong>{datos.conteos.nunca_entro}</strong>
          <small>{pct(datos.conteos.nunca_entro)}</small>
        </article>
      </div>
      <p className="nota">{horarioDe(datos.slot_id)} · {datos.fecha} · {total} personas medibles</p>
      {datos.sin_evidencia > 0 && <p className="historical-notice weekly-notice">
        {datos.sin_evidencia} {datos.sin_evidencia === 1 ? "persona entró" : "personas entraron"} según el registro
        de entradas pero sin evento de conexión localizable: se cuentan como &ldquo;Entró y salió&rdquo; sin
        inventar minutos.
      </p>}
      <button className="control" onClick={descargar}>
        Descargar CSV: presencia de esta clase{modo === "demo" && " (práctica)"}
      </button>
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </>}

    <details className="panel definitions"><summary>Cómo se calculan estas categorías</summary>
      <p><b>🟢 Presente:</b> entró y se quedó al menos el 70&nbsp;% de la duración de la clase.</p>
      <p><b>🟠 Entró y salió:</b> entró pero por debajo del 70&nbsp;% (o entró y no hay evidencia de cuánto se quedó).</p>
      <p><b>🔴 Nunca entró:</b> ningún ingreso identificado a esta clase.</p>
    </details>
  </section>;
}
