"use client";
import { useEffect, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import { aplicarRolDemo } from "../lib/rolUi";
import type { FilaIngreso, TipoIngreso } from "../lib/ingresosDia.d.mts";
import type { FiltroDetalle } from "../lib/types";

// Botones del dia elegido en el calendario (TOC-91): ver con nombre quien entro en su horario, quien se colo a otra clase, o ambos.
// Solo se monta con permiso nominal; el servidor vuelve a validarlo y recorta por ciudad.
const BOTONES: { tipo: TipoIngreso; texto: string }[] = [
  { tipo: "propias", texto: "En su horario" }, { tipo: "otras", texto: "Se colaron a otra clase" }, { tipo: "ambos", texto: "Ambos" }];
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "—");
type Respuesta = { conteo: Record<TipoIngreso, number>; filas: FilaIngreso[] };

function urlIngresos(semana: string, fecha: string, tipo: TipoIngreso, filtro: FiltroDetalle, modo: "demo" | "real", csv = false) {
  const url = new URL("/api/ingresos-dia", window.location.origin);
  url.searchParams.set("semana", semana); url.searchParams.set("fecha", fecha); url.searchParams.set("tipo", tipo);
  if (filtro.ciudad) url.searchParams.set("ciudad", filtro.ciudad);
  if (filtro.franja) url.searchParams.set("franja", filtro.franja);
  if (filtro.cuenta) url.searchParams.set("cuenta", filtro.cuenta);
  if (csv) url.searchParams.set("formato", "csv");
  if (modo === "demo") { url.searchParams.set("demo", "1"); aplicarRolDemo(url.searchParams); }
  return url;
}

export default function IngresosDia({ semana, fecha, filtro, modo }: { semana: string; fecha: string; filtro: FiltroDetalle; modo: "demo" | "real" }) {
  const [tipo, setTipo] = useState<TipoIngreso | null>(null);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [estado, setEstado] = useState<"inactivo" | "cargando" | "ok" | "error">("inactivo");
  const [mensaje, setMensaje] = useState("");

  // Cambiar de dia o de filtros cierra la lista: nunca se muestra la de otro dia.
  useEffect(() => { setTipo(null); setDatos(null); setEstado("inactivo"); }, [semana, fecha, filtro.ciudad, filtro.franja, filtro.cuenta]);

  useEffect(() => {
    if (!tipo) return;
    let cancelado = false;
    (async () => {
      setEstado("cargando"); setMensaje("");
      try {
        const headers: Record<string, string> = {};
        if (modo === "real") {
          const sesion = await sesionActual();
          if (!sesion?.access_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
          headers.Authorization = `Bearer ${sesion.access_token}`;
        }
        const r = await fetch(urlIngresos(semana, fecha, tipo, filtro, modo), { headers, cache: "no-store" });
        const body = await r.json().catch(() => null) as (Respuesta & { error?: string }) | null;
        if (!r.ok || !body) throw new Error(body?.error ?? `No se pudo cargar la lista (HTTP ${r.status}).`);
        if (!cancelado) { setDatos(body); setEstado("ok"); }
      } catch (e) {
        if (!cancelado) { setEstado("error"); setMensaje(e instanceof Error ? e.message : String(e)); }
      }
    })();
    return () => { cancelado = true; };
  }, [tipo, semana, fecha, filtro, modo]);

  async function csv() {
    if (!tipo) return;
    const error = await descargarCsv(urlIngresos(semana, fecha, tipo, filtro, modo, true), modo, `ingresos_${fecha}_${tipo}.csv`);
    if (error) setMensaje(error);
  }

  const conteo = datos?.conteo;
  return <div className="ingresos-dia">
    <p className="nota">Ver con nombre quién ingresó este día:</p>
    <div className="ingresos-dia-botones" role="group" aria-label="Tipo de ingreso">
      {BOTONES.map((b) => <button key={b.tipo} type="button" aria-pressed={tipo === b.tipo}
        className={`tab ingreso-${b.tipo}${tipo === b.tipo ? " active" : ""}`} onClick={() => setTipo(tipo === b.tipo ? null : b.tipo)}>
        {b.texto}{conteo ? ` (${conteo[b.tipo]})` : ""}{modo === "demo" ? " · práctica" : ""}
      </button>)}
    </div>
    {estado === "cargando" && <p className="nota" role="status">Cargando…</p>}
    {estado === "error" && <p className="status" role="alert">{mensaje}</p>}
    {estado === "ok" && datos && tipo && <>
      {datos.filas.length === 0 ? <p className="nota" role="status">Nadie en esta categoría para este día{filtro.ciudad || filtro.franja || filtro.cuenta ? " con el filtro aplicado" : ""}.</p>
        : <div className="class-table-wrap" role="region" aria-label="Personas que ingresaron" tabIndex={0}>
          <table className="class-table visitas-tabla"><caption>{BOTONES.find((b) => b.tipo === tipo)?.texto} · {datos.filas.length} {datos.filas.length === 1 ? "persona" : "personas"}</caption>
            <thead><tr><th>Nombre</th>{tipo === "ambos" && <th>Tipo</th>}<th>Entró a</th>{tipo !== "propias" && <th>Su clase</th>}<th>Cédula</th><th>Ciudad</th><th>Hora</th></tr></thead>
            <tbody>{datos.filas.map((f, i) => <tr key={`${f.cedula}|${f.slot_entro}|${i}`}>
              <th scope="row">{f.nombre}</th>
              {tipo === "ambos" && <td><span className={`chip-conf ${f.tipo === "otra" ? "chip-senal-otra_franja" : "chip-senal-roster"}`}>
                <b aria-hidden="true">{f.tipo === "otra" ? "↔" : "✓"}</b>{f.tipo === "otra" ? "Otra clase" : "Su horario"}</span></td>}
              <td>{f.clase_entro}</td>{tipo !== "propias" && <td>{f.tipo === "otra" ? f.su_clase ?? "—" : "Esta"}</td>}
              <td>{f.cedula}</td><td>{f.ciudad ?? "—"}</td><td>{hora(f.primera_entrada)}</td>
            </tr>)}</tbody>
          </table></div>}
      {datos.filas.length > 0 && <button type="button" className="control" onClick={csv}>Descargar esta lista (CSV)</button>}
    </>}
  </div>;
}
