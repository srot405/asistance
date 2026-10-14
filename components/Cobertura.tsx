"use client";
import { useCallback, useEffect, useState } from "react";
import { sesionActual } from "../lib/auth";
import type { CoberturaResponse, ResumenHistorico } from "../lib/types";
import { CSS_COBERTURA, ETIQUETAS_COBERTURA } from "../lib/coberturaClases.mjs";

const REFRESCO_MS = 300_000; // 5 min mientras haya una clase en curso (cada carga son ~30 filas de asist_franjas + asist_sesiones)

// Pestaña "Cobertura": ¿cada clase del roster semanal ya tiene captura?
// Cruza asist_franjas con asist_sesiones.estado_captura (fuente única del ETL, ver lib/coberturaClases.mjs):
// la misma noción de «capturada» que los chips de Estadísticas y el calendario.
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
      if (!response.ok) throw new Error(`No se pudo cargar la captura de clases (HTTP ${response.status}).`);
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

  if (modo === "demo") return <section className="panel" aria-label="Captura de clases">
    <div className="section-heading"><div><h2>Captura de clases</h2></div></div>
    <p className="historical-notice missing-notice">
      La captura de clases usa el registro real de Zoom y no existe en modo práctica.</p>
  </section>;

  const dias = new Map<string, CoberturaResponse["clases"]>();
  for (const clase of datos?.clases ?? []) dias.set(clase.fecha, [...(dias.get(clase.fecha) ?? []), clase]);
  const r = datos?.resumen;

  return <section className="panel" aria-label="Captura de clases">
    <div className="section-heading">
      <div><h2>Captura de clases</h2>
        <p>Las clases de la semana y si Zoom registró quién entró. Es captura de <b>clases</b> (no es el % de estancia de las personas, que está en la pestaña Tiempo).</p></div>
      <button className="control" onClick={cargar} disabled={cargando}>{cargando ? "Actualizando…" : "Actualizar"}</button>
    </div>

    {error && <p className="historical-notice missing-notice" role="alert">{error}</p>}
    {r && <div className="presencia-grid" aria-label="Resumen de cobertura">
      <article className="presencia-card presente"><span>Capturadas</span>
        <strong>{r.capturadas}</strong><small>de {r.dictadas} dictadas</small></article>
      <article className="presencia-card nunca-entro"><span>Sin captura confiable</span>
        <strong>{r.faltan}</strong><small>sin captura, Zoom limit o dudosa{r.en_curso ? ` · ${r.en_curso} en curso` : ""}</small></article>
      <article className="presencia-card entro-salio"><span>Por dictar</span>
        <strong>{r.pendientes}</strong><small>de {r.programadas} clases de la semana</small></article>
    </div>}

    {datos && datos.clases.length === 0 && <p className="historical-notice weekly-notice">
      No hay clases programadas esta semana.</p>}
    {datos && datos.clases.length > 0 && <div className="cob-tabla-wrap">
      <table className="cob-tabla">
        <thead><tr><th>Clase</th><th>Cuenta</th><th className="num">Inscritas</th>
          <th className="num">Entraron (su clase)</th><th className="num">Colados (entradas)</th><th>Estado de captura</th></tr></thead>
        <tbody>
          {[...dias.entries()].map(([fecha, clases]) => [
            <tr key={fecha} className="cob-dia"><td colSpan={6}>
              {new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </td></tr>,
            ...clases.map((c) => <tr key={c.slot_id}>
              <td>{c.horario_texto.replace(/^Backend - /, "")}</td>
              <td>{c.cuenta_zoom}</td>
              <td className="num">{c.roster_n}</td>
              <td className="num">{c.personas_roster ?? "—"}</td>
              <td className="num">{c.personas_visita ?? "—"}</td>
              <td><span className={`cob-estado ${CSS_COBERTURA[c.estado]}`} title={c.estado_captura ? `Estado: ${c.estado_captura}` : "Aún no hay registro de esta clase"}>
                {ETIQUETAS_COBERTURA[c.estado]}</span></td>
            </tr>),
          ])}
        </tbody>
      </table>
    </div>}
    {datos && r && r.sin_sesion > 0 && <p className="nota">
      {r.sin_sesion} {r.sin_sesion === 1 ? "clase del roster no tiene" : "clases del roster no tienen"} sesión en el ETL todavía.</p>}
    {datos && datos.sesiones_sin_clase > 0 && <p className="nota">
      {datos.sesiones_sin_clase} {datos.sesiones_sin_clase === 1 ? "sesión del ETL no corresponde" : "sesiones del ETL no corresponden"} a
      ninguna clase del roster congelado.</p>}
    <details className="panel definitions"><summary>Cómo se calcula</summary>
      <p>El estado de cada clase es el <code>estado_captura</code> de <code>asist_sesiones</code> que escribe el ETL, sin recalcularlo:
        <b> Capturada</b> incluye las recuperadas por CSV o API; <b>Sin captura confiable</b> = sin captura, Zoom limit o dudosa
        (es un dato que falta, no una ausencia). El roster viene de <code>asist_franjas</code>. Esta pestaña ya no usa el registro
        crudo del webhook de Zoom: la señal en vivo está en «En vivo».</p>
    </details>
  </section>;
}
