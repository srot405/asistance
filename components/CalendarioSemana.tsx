"use client";
import { useEffect, useMemo, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import { esFranjaPresencial, ESTRELLA_PRESENCIAL } from "../lib/franjaTipo.mjs";
import type { DetalleSemanaResponse, FiltroDetalle, ResumenHistorico } from "../lib/types";

const porcentaje = (valor: number | null | undefined) => (valor == null ? "—" : `${valor.toFixed(1)} %`);
const fechaCorta = (fecha: string) => new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "UTC" })
  .format(new Date(`${fecha}T12:00:00Z`)).replace(/\.$/, "");
const fechaLarga = (fecha: string) => new Intl.DateTimeFormat("es-CO", {
  weekday: "long", day: "numeric", month: "short", timeZone: "UTC",
}).format(new Date(`${fecha}T12:00:00Z`));

// Lunes de `semana` + 0..6 días, sin depender de qué haya ocurrido: la grilla
// siempre tiene 7 celdas, y son los datos (porDia) los que deciden cuáles se
// pintan como clicables. Así un sábado sin clase real se ve gris, no se oculta.
function fechasDeSemana(semana: string): string[] {
  const lunes = new Date(`${semana}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(lunes);
    dia.setUTCDate(dia.getUTCDate() + i);
    return dia.toISOString().slice(0, 10);
  });
}

type ResumenPlano = { poblacion: number | null; asistieron: number | null; nunca: number | null;
  porcentaje_retencion: number | null; porcentaje_nunca: number | null };

const PENDIENTE_NUNCA_PERIODO = "Pendiente: el histórico solo expone el conteo agregado del período (arriba), " +
  "no la lista de personas. Para nominarlo sin inventar datos falta que el ETL exponga los persona_id " +
  "identificados en cada semana, incluidas las de nivel \"Solo semanal\".";

// Calendario + detalle por día + filtros + CSV nominal (TOC-91, pedido de Samuel
// 2026-09-29). Solo pide /api/detalle y /api/exportar-nominal cuando la semana
// elegida es nivel "Detalle" (roster congelado real): para el resto, la grilla
// se muestra completa en gris y el panel lateral cae al agregado de `actual`.
export default function CalendarioSemana({ actual, modo }: { actual: ResumenHistorico; modo: "demo" | "real" }) {
  const [filtro, setFiltro] = useState<FiltroDetalle>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleSemanaResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [falloExport, setFalloExport] = useState("");
  const esDetalle = actual.nivel === "Detalle";

  // Cambiar de semana limpia día y filtros: "si se elige ver una semana, solo se
  // ve información de esa semana" (pedido explícito, no mezclar).
  useEffect(() => { setSelectedDate(null); setFiltro({}); setFalloExport(""); }, [actual.semana]);

  useEffect(() => {
    if (!esDetalle) { setDetalle(null); return; }
    let cancelado = false;
    async function cargar() {
      setCargando(true); setErrorDetalle("");
      try {
        const params = new URLSearchParams({ semana: actual.semana });
        if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
        if (filtro.franja) params.set("franja", filtro.franja);
        if (filtro.cuenta) params.set("cuenta", filtro.cuenta);
        const headers: Record<string, string> = {};
        if (modo === "demo") params.set("demo", "1");
        else {
          const sesion = await sesionActual();
          if (!sesion?.access_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
          headers.Authorization = `Bearer ${sesion.access_token}`;
        }
        const response = await fetch(`/api/detalle?${params}`, { headers, cache: "no-store" });
        if (!response.ok) throw new Error(`No se pudo cargar el detalle (HTTP ${response.status}).`);
        const data = (await response.json()) as DetalleSemanaResponse;
        if (!cancelado) setDetalle(data);
      } catch (error) {
        if (!cancelado) setErrorDetalle(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, [actual.semana, esDetalle, filtro.ciudad, filtro.franja, filtro.cuenta, modo]);

  const fechas = useMemo(() => fechasDeSemana(actual.semana), [actual.semana]);
  const porDiaPorFecha = useMemo(() => new Map((detalle?.porDia ?? []).map((d) => [d.fecha, d])), [detalle]);
  const diaSeleccionado = selectedDate ? porDiaPorFecha.get(selectedDate) ?? null : null;
  const clasesDelDia = useMemo(() => selectedDate
    ? (detalle?.porClase ?? []).filter((c) => c.fecha === selectedDate) : [],
    [detalle, selectedDate]);
  const horarioDe = (slotId?: string) => detalle?.franjas.find((f) => f.slot_id === slotId)?.horario_texto ?? slotId ?? "";

  // Agregado de la semana completa (sin día elegido): si hay filtro Detalle
  // activo se usa el recorte filtrado; si no, el agregado ya validado de `actual`.
  const resumenSemana: ResumenPlano = esDetalle && detalle ? detalle.resumen : {
    poblacion: actual.poblacion, asistieron: actual.asistieron, nunca: actual.nunca,
    porcentaje_retencion: actual.porcentaje_retencion, porcentaje_nunca: actual.porcentaje_nunca,
  };

  async function descargarNominal(alcance: "semana" | "dia") {
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, alcance });
    if (alcance === "dia") {
      if (!selectedDate) return;
      params.set("fecha", selectedDate);
    }
    if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
    if (filtro.franja) params.set("franja", filtro.franja);
    if (filtro.cuenta) params.set("cuenta", filtro.cuenta);
    const url = new URL(`/api/exportar-nominal?${params}`, window.location.origin);
    const nombre = `asistencia_${actual.semana}_no_ingresaron_${alcance}.csv`;
    const error = await descargarCsv(url, modo, nombre);
    if (error) setFalloExport(error);
  }

  return <section className="panel calendar-panel" aria-label="Calendario de la semana">
    <div className="section-heading">
      <div><h2>Calendario · semana {actual.semana}</h2>
        <p>Clic en un día para ver su detalle. Sin selección se ve el total de la semana elegida.</p></div>
    </div>

    {!esDetalle && <p className="historical-notice missing-notice">
      Esta semana es nivel <b>{actual.nivel}</b>: no tiene roster congelado por día, así que el calendario se
      muestra sin días clicables y sin filtros de ciudad/franja/cuenta ni CSV nominal.
    </p>}
    {esDetalle && errorDetalle && <p className="historical-notice missing-notice">{errorDetalle}</p>}

    <div className="calendar-layout">
      <div className="calendar-grid" role="group" aria-label="Días de la semana">
        {fechas.map((fecha) => {
          const dia = porDiaPorFecha.get(fecha);
          const tieneDatos = esDetalle && Boolean(dia);
          const activo = selectedDate === fecha;
          const presencial = esFranjaPresencial(fecha);
          return <button key={fecha} type="button" disabled={!tieneDatos}
            aria-pressed={activo}
            className={`calendar-day${tieneDatos ? " con-datos" : " sin-datos"}${activo ? " activo" : ""}${presencial ? " presencial" : ""}`}
            title={presencial ? "Día entre semana (presencial)" : undefined}
            onClick={() => tieneDatos && setSelectedDate(activo ? null : fecha)}>
            {presencial && <span className="calendar-day-estrella" aria-hidden="true">{ESTRELLA_PRESENCIAL}</span>}
            <span className="calendar-day-nombre">{fechaCorta(fecha)}</span>
            <span className="calendar-day-numero">{fecha.slice(8, 10)}</span>
            {tieneDatos && dia ? <span className="calendar-day-pct">{porcentaje(dia.porcentaje_retencion)}</span>
              : <span className="calendar-day-pct calendar-day-sin">{cargando && esDetalle ? "…" : "sin dato"}</span>}
          </button>;
        })}
      </div>

      <aside className="calendar-detail" aria-live="polite">
        {selectedDate ? <>
          <h3>{fechaLarga(selectedDate)}</h3>
          {diaSeleccionado ? <>
            <strong>{porcentaje(diaSeleccionado.porcentaje_retencion)}</strong>
            <p>{diaSeleccionado.asistieron} ingresaron · {diaSeleccionado.nunca} no ingresaron ·
              roster medible {diaSeleccionado.poblacion}</p>
            {clasesDelDia.length > 0 && <div className="calendar-clases"><table className="class-table">
              <thead><tr><th>Clase</th><th>Roster</th><th>Ingresaron</th><th>%</th></tr></thead>
              <tbody>{clasesDelDia.map((clase) => <tr key={`${clase.fecha}-${clase.slot_id}`}>
                <td>{horarioDe(clase.slot_id)}</td><td>{clase.poblacion}</td><td>{clase.asistieron}</td>
                <td>{porcentaje(clase.porcentaje_retencion)}</td>
              </tr>)}</tbody>
            </table></div>}
            <button className="control" onClick={() => descargarNominal("dia")}>
              Descargar CSV: no ingresaron este día{modo === "demo" && " (práctica)"}
            </button>
          </> : <p className="nota">Sin datos para este día.</p>}
        </> : <>
          <h3>Semana completa</h3>
          <strong>{porcentaje(resumenSemana.porcentaje_retencion)}</strong>
          <p>{resumenSemana.asistieron ?? "—"} ingresaron · {resumenSemana.nunca ?? "—"} no ingresaron de{" "}
            {resumenSemana.poblacion ?? "—"} medibles{filtro.ciudad || filtro.franja || filtro.cuenta ? " (con filtro aplicado)" : ""}</p>
        </>}
      </aside>
    </div>

    <div className="calendar-filters">
      <label>Ciudad <select className="control" disabled={!esDetalle} value={filtro.ciudad ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, ciudad: e.target.value || undefined }))}>
        <option value="">Todas</option>
        {(detalle?.ciudades ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
      </select></label>
      <label>Franja <select className="control" disabled={!esDetalle} value={filtro.franja ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, franja: e.target.value || undefined }))}>
        <option value="">Todas</option>
        {(detalle?.franjas ?? []).map((f) => <option key={f.slot_id} value={f.slot_id}>
          {esFranjaPresencial(f.fecha) ? `${ESTRELLA_PRESENCIAL} ` : ""}{f.horario_texto}
        </option>)}
      </select></label>
      <label>Cuenta Zoom <select className="control" disabled={!esDetalle} value={filtro.cuenta ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, cuenta: e.target.value || undefined }))}>
        <option value="">Todas</option>
        {(detalle?.cuentas ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
      </select></label>
    </div>

    <div className="calendar-actions">
      <button className="control" disabled={!esDetalle} onClick={() => descargarNominal("semana")}>
        Descargar CSV: no ingresaron esta semana{modo === "demo" && " (práctica)"}
      </button>
      <button className="control" disabled title={PENDIENTE_NUNCA_PERIODO}>
        CSV: nunca ingresaron en el período (pendiente)
      </button>
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </div>
  </section>;
}
