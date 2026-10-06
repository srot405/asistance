"use client";
import { useCallback, useEffect, useState } from "react";
import { sesionActual } from "../lib/auth";
import type { CoberturaResponse, ResumenHistorico } from "../lib/types";

const ETIQUETA: Record<string, string> = {
  capturada: "Capturada", en_curso: "En curso", pendiente: "Por dictar",
  sin_entradas_aun: "Sin entradas aún", sin_captura: "Falta captura",
};
const REFRESCO_MS = 300_000; // 5 min: cada carga lee ~3.000 eventos de la semana (egress)

// Pestaña "Cobertura": ¿cada clase del roster semanal ya tiene captura de Zoom?
// Cruza asist_franjas con zoom_live_log (ver lib/coberturaClases.mjs). Las personas son
// distintas por correo de Zoom, sin staff @tocaunavida.org: no es la asistencia validada.
export default function Cobertura({ actual, modo }: { actual: ResumenHistorico; modo: "demo" | "real" }) {
  const [datos, setDatos] = useState<CoberturaResponse | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (modo === "demo") return;
    setCargando(true); setError("");
    try {
      const sesion = await sesionActual();
      if (!sesion?.access_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      const params = new URLSearchParams({ semana: actual.semana, materia: actual.materia });
      const response = await fetch(`/api/cobertura?${params}`, {
        headers: { Authorization: `Bearer ${sesion.access_token}` }, cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar la cobertura (HTTP ${response.status}).`);
      setDatos((await response.json()) as CoberturaResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, [actual.semana, actual.materia, modo]);

  useEffect(() => { setDatos(null); cargar(); }, [cargar]);
  const hayEnCurso = datos?.clases.some((c) => c.estado === "en_curso") ?? false;
  useEffect(() => {
    if (!hayEnCurso) return;
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [hayEnCurso, cargar]);

  if (modo === "demo") return <section className="panel" aria-label="Cobertura por clase">
    <div className="section-heading"><div><h2>Cobertura por clase</h2></div></div>
    <p className="historical-notice missing-notice">
      La cobertura usa el registro real de Zoom y no existe en modo práctica.</p>
  </section>;

  const dias = new Map<string, CoberturaResponse["clases"]>();
  for (const clase of datos?.clases ?? []) dias.set(clase.fecha, [...(dias.get(clase.fecha) ?? []), clase]);
  const r = datos?.resumen;

  return <section className="panel" aria-label="Cobertura por clase">
    <div className="section-heading">
      <div><h2>Cobertura por clase</h2>
        <p>Cada clase del roster de la semana y si Zoom ya registró entradas. Las personas son distintas por
          correo de Zoom (cualquier entrada o salida), sin staff <code>@tocaunavida.org</code>; no es la asistencia validada.</p></div>
      <button className="control" onClick={cargar} disabled={cargando}>{cargando ? "Actualizando…" : "Actualizar"}</button>
    </div>

    {error && <p className="historical-notice missing-notice" role="alert">{error}</p>}
    {r && <div className="presencia-grid" aria-label="Resumen de cobertura">
      <article className="presencia-card presente"><span>Capturadas</span>
        <strong>{r.capturadas}</strong><small>de {r.dictadas} dictadas</small></article>
      <article className="presencia-card nunca-entro"><span>Falta captura</span>
        <strong>{r.faltan}</strong><small>dictadas sin ninguna entrada</small></article>
      <article className="presencia-card entro-salio"><span>Por dictar</span>
        <strong>{r.pendientes}</strong><small>de {r.programadas} del roster</small></article>
    </div>}

    {datos && datos.clases.length === 0 && <p className="historical-notice weekly-notice">
      Esta semana no tiene clases en el roster congelado.</p>}
    {datos && datos.clases.length > 0 && <div className="cob-tabla-wrap">
      <table className="cob-tabla">
        <thead><tr><th>Clase</th><th>Cuenta</th><th className="num">Roster</th>
          <th className="num">Entraron</th><th>Estado</th></tr></thead>
        <tbody>
          {[...dias.entries()].map(([fecha, clases]) => [
            <tr key={fecha} className="cob-dia"><td colSpan={5}>
              {new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </td></tr>,
            ...clases.map((c) => <tr key={c.slot_id}>
              <td>{c.horario_texto.replace(/^Backend - /, "")}</td>
              <td>{c.cuenta_zoom}</td>
              <td className="num">{c.roster_n}</td>
              <td className="num">{c.sesiones ? c.personas : "—"}</td>
              <td><span className={`cob-estado ${c.estado}`}>{ETIQUETA[c.estado]}</span></td>
            </tr>),
          ])}
        </tbody>
      </table>
    </div>}
    {datos && datos.sesiones_sin_clase > 0 && <p className="nota">
      {datos.sesiones_sin_clase} {datos.sesiones_sin_clase === 1 ? "reunión de Zoom" : "reuniones de Zoom"} de esta
      materia no se pudieron asociar a ninguna clase del roster.</p>}
    <details className="panel definitions"><summary>Cómo se calcula</summary>
      <p>Cada reunión de Zoom se asocia a la clase del roster más cercana a su primera entrada, del mismo nivel
        (Avanzado o no) y sala. <b>Falta captura</b> = la clase ya terminó (más 30 min) y Zoom no registró
        ninguna entrada. El roster viene de <code>asist_franjas</code>; las entradas, del webhook de Zoom.</p>
    </details>
  </section>;
}
