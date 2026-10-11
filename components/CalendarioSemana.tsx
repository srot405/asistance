"use client";
import { useEffect, useMemo, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import { textoSinNominal, usePuedeNominal } from "../lib/rolUi";
import { esFranjaPresencial, ICONO_SIN_SABADO } from "../lib/franjaTipo.mjs";
import { useConfianzaSemana } from "../lib/useTiempo";
import ChipConfianza, { mapaConfianza } from "./ChipConfianza";
import type { DetalleSemanaResponse, FiltroDetalle, ResumenHistorico } from "../lib/types";
import type { ConteoDia, TipoIngreso } from "../lib/ingresosDia.d.mts";

// Botones generales del calendario (TOC-91): cambian lo que muestra CADA dia de la semana. En pantalla solo cifras;
// los nombres salen unicamente en el CSV (nominal, con permiso).
const BOTONES_INGRESO: { tipo: TipoIngreso; texto: string; unidad: string }[] = [
  { tipo: "propias", texto: "En su horario", unidad: "en su horario" },
  { tipo: "otras", texto: "Se colaron a otra clase", unidad: "colados" },
  { tipo: "ambos", texto: "Ambos", unidad: "ingresos" },
];
type Ingresos = { conteo: Record<TipoIngreso, number>; porDia: ConteoDia[] };

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
export default function CalendarioSemana({ actual, modo, sinSabado = false }: {
  actual: ResumenHistorico; modo: "demo" | "real";
  // Semana marcada "sin sábado" (mismo dato que ya pinta la insignia ◆ arriba, ver
  // Dashboard.tsx). Sirve para marcar EN EL CALENDARIO cuál día es el responsable, sin
  // repetir el error de hoy temprano (una estrella suelta en cualquier clase entre semana,
  // que Samuel encontró confusa): acá solo se usa sobre la celda del sábado, y solo cuando
  // esta semana puntual ya está confirmada como "sin sábado".
  sinSabado?: boolean;
}) {
  const { puede: puedeNominal, rol } = usePuedeNominal();   // TOC-148: sin permiso nominal no se ofrecen los CSV con nombres
  const [filtro, setFiltro] = useState<FiltroDetalle>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleSemanaResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [falloExport, setFalloExport] = useState("");
  const [tipoIngreso, setTipoIngreso] = useState<TipoIngreso | null>(null);
  const [ingresos, setIngresos] = useState<Ingresos | null>(null);
  const [errorIngresos, setErrorIngresos] = useState("");
  const esDetalle = actual.nivel === "Detalle";
  const confianza = mapaConfianza(useConfianzaSemana(actual.semana, modo, esDetalle).datos);   // TOC-151

  // Cambiar de semana limpia día y filtros: "si se elige ver una semana, solo se
  // ve información de esa semana" (pedido explícito, no mezclar).
  useEffect(() => { setSelectedDate(null); setFiltro({}); setFalloExport(""); setTipoIngreso(null); }, [actual.semana]);

  // Conteos de ingresos (solo cifras) mientras haya un boton general activo; mismos filtros del calendario.
  // Cambiar entre los tres botones reusa los mismos conteos (la respuesta trae los tres).
  const conBoton = tipoIngreso != null;
  useEffect(() => {
    if (!esDetalle || !conBoton) { setIngresos(null); return; }
    let cancelado = false;
    (async () => {
      setErrorIngresos("");
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
        const r = await fetch(`/api/ingresos?${params}`, { headers, cache: "no-store" });
        if (!r.ok) throw new Error(`No se pudieron cargar los ingresos (HTTP ${r.status}).`);
        const data = await r.json() as Ingresos;
        if (!cancelado) setIngresos(data);
      } catch (error) {
        if (!cancelado) { setIngresos(null); setErrorIngresos(error instanceof Error ? error.message : String(error)); }
      }
    })();
    return () => { cancelado = true; };
  }, [actual.semana, esDetalle, conBoton, filtro.ciudad, filtro.franja, filtro.cuenta, modo]);

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
  const ingresoPorFecha = useMemo(() => new Map((ingresos?.porDia ?? []).map((d) => [d.fecha, d])), [ingresos]);
  const boton = BOTONES_INGRESO.find((b) => b.tipo === tipoIngreso) ?? null;
  const cifraIngreso = (fecha: string | null) => {
    if (!tipoIngreso || !ingresos) return null;
    return fecha ? ingresoPorFecha.get(fecha)?.[tipoIngreso] ?? 0 : ingresos.conteo[tipoIngreso];
  };
  const horarioDe = (slotId?: string) => detalle?.franjas.find((f) => f.slot_id === slotId)?.horario_texto ?? slotId ?? "";

  // Agregado de la semana completa (sin día elegido): si hay filtro Detalle
  // activo se usa el recorte filtrado; si no, el agregado ya validado de `actual`.
  const resumenSemana: ResumenPlano = esDetalle && detalle ? detalle.resumen : {
    poblacion: actual.poblacion, asistieron: actual.asistieron, nunca: actual.nunca,
    porcentaje_retencion: actual.porcentaje_retencion, porcentaje_nunca: actual.porcentaje_nunca,
  };

  async function descargarReporte() {
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, vista: "reporte" });
    const url = new URL(`/api/exportar-nominal?${params}`, window.location.origin);
    const error = await descargarCsv(url, modo, `asistencia_${actual.semana}_reporte.csv`);
    if (error) setFalloExport(error);
  }

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

  async function descargarIngresos(alcance: "semana" | "dia") {
    if (!tipoIngreso) return;
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, tipo: tipoIngreso, formato: "csv" });
    if (alcance === "dia") { if (!selectedDate) return; params.set("fecha", selectedDate); }
    if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
    if (filtro.franja) params.set("franja", filtro.franja);
    if (filtro.cuenta) params.set("cuenta", filtro.cuenta);
    const url = new URL(`/api/ingresos?${params}`, window.location.origin);
    const error = await descargarCsv(url, modo, `ingresos_${tipoIngreso}_${alcance === "dia" ? selectedDate : `semana_${actual.semana}`}.csv`);
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

    {esDetalle && <div className="ingresos-botones" role="group" aria-label="Qué mostrar en cada día">
      {BOTONES_INGRESO.map((b) => <button key={b.tipo} type="button" aria-pressed={tipoIngreso === b.tipo}
        className={`tab ingreso-${b.tipo}${tipoIngreso === b.tipo ? " active" : ""}`}
        onClick={() => setTipoIngreso(tipoIngreso === b.tipo ? null : b.tipo)}>
        {b.texto}{ingresos ? ` (${ingresos.conteo[b.tipo]})` : ""}
      </button>)}
      <span className="nota">{tipoIngreso ? "Cada día muestra cuántas personas. Los nombres, en el CSV." : "Elige qué contar en cada día; vuelve a oprimir para ver el % de ingreso."}</span>
    </div>}
    {tipoIngreso && errorIngresos && <p className="historical-notice missing-notice" role="alert">{errorIngresos}</p>}

    <div className="calendar-layout">
      <div className="calendar-grid" role="group" aria-label="Días de la semana">
        {fechas.map((fecha) => {
          const dia = porDiaPorFecha.get(fecha);
          const tieneDatos = esDetalle && Boolean(dia);
          const activo = selectedDate === fecha;
          // Solo el sábado, y solo si esta semana ya está confirmada "sin sábado" (nunca
          // por adivinar el día de la semana solo): marca cuál día es el motivo de la
          // insignia de arriba, sin tocar el resto de celdas.
          const esElSabadoResponsable = sinSabado && !esFranjaPresencial(fecha);
          return <button key={fecha} type="button" disabled={!tieneDatos}
            aria-pressed={activo}
            className={`calendar-day${tieneDatos ? " con-datos" : " sin-datos"}${activo ? " activo" : ""}${esElSabadoResponsable ? " sabado-responsable" : ""}`}
            title={esElSabadoResponsable ? "Este sábado no tuvo clase regular esta semana" : undefined}
            onClick={() => tieneDatos && setSelectedDate(activo ? null : fecha)}>
            {esElSabadoResponsable && <span className="calendar-day-estrella" aria-hidden="true">{ICONO_SIN_SABADO}</span>}
            <span className="calendar-day-nombre">{fechaCorta(fecha)}</span>
            <span className="calendar-day-numero">{fecha.slice(8, 10)}</span>
            {tieneDatos && boton ? <span className={`calendar-day-pct calendar-day-ingresos ingreso-${boton.tipo}`}>
                {cifraIngreso(fecha) ?? "…"}<small> {boton.unidad}</small></span>
              : tieneDatos && dia ? <span className="calendar-day-pct">{porcentaje(dia.porcentaje_retencion)}</span>
              : <span className="calendar-day-pct calendar-day-sin">{cargando && esDetalle ? "…" : "sin dato"}</span>}
          </button>;
        })}
      </div>

      <aside className="calendar-detail" aria-live="polite">
        {selectedDate ? <>
          <h3>{fechaLarga(selectedDate)}</h3>
          {boton && <p className="calendar-ingresos-resumen"><b>{cifraIngreso(selectedDate) ?? "…"}</b> {boton.unidad} este día</p>}
          {diaSeleccionado ? <>
            <strong>{porcentaje(diaSeleccionado.porcentaje_retencion)}</strong>
            <p>{diaSeleccionado.asistieron} ingresaron · {diaSeleccionado.nunca} no ingresaron ·
              roster medible {diaSeleccionado.poblacion}</p>
            {clasesDelDia.length > 0 && <div className="calendar-clases"><table className="class-table">
              <thead><tr><th>Clase</th><th>Roster</th><th>Ingresaron</th><th>%</th><th>Confianza</th></tr></thead>
              <tbody>{clasesDelDia.map((clase) => <tr key={`${clase.fecha}-${clase.slot_id}`}>
                <td>{horarioDe(clase.slot_id)}</td><td>{clase.poblacion}</td><td>{clase.asistieron}</td>
                <td>{porcentaje(clase.porcentaje_retencion)}</td>
                <td>{confianza.size ? <ChipConfianza c={confianza.get(clase.slot_id ?? "")} /> : "—"}</td>
              </tr>)}</tbody>
            </table></div>}
            {puedeNominal && boton && <button className="control" onClick={() => descargarIngresos("dia")}>
              Descargar CSV: {boton.texto.toLowerCase()} este día{modo === "demo" && " (práctica)"}
            </button>}
            {puedeNominal && <button className="control" onClick={() => descargarNominal("dia")}>
              Descargar CSV: no ingresaron este día{modo === "demo" && " (práctica)"}
            </button>}
          </> : <p className="nota">Sin datos para este día.</p>}
        </> : <>
          <h3>Semana completa</h3>
          {boton && <p className="calendar-ingresos-resumen"><b>{cifraIngreso(null) ?? "…"}</b> {boton.unidad} en la semana</p>}
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
        {(detalle?.franjas ?? []).map((f) => <option key={f.slot_id} value={f.slot_id}>{f.horario_texto}</option>)}
      </select></label>
      <label>Cuenta Zoom <select className="control" disabled={!esDetalle} value={filtro.cuenta ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, cuenta: e.target.value || undefined }))}>
        <option value="">Todas</option>
        {(detalle?.cuentas ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
      </select></label>
    </div>

    <div className="calendar-actions">
      {puedeNominal ? <>
      <button className="control" disabled={!esDetalle} onClick={() => descargarNominal("semana")}>
        Descargar CSV: no ingresaron esta semana{modo === "demo" && " (práctica)"}
      </button>
      {boton && <button className="control" onClick={() => descargarIngresos("semana")}>
        Descargar CSV: {boton.texto.toLowerCase()} esta semana{modo === "demo" && " (práctica)"}
      </button>}
      <button className="control" onClick={descargarReporte}
        title="Roster completo con estado por persona y resumen de captura; sirve aunque la semana esté incompleta">
        Descargar reporte CSV (semana completa o incompleta){modo === "demo" && " (práctica)"}
      </button>
      <button className="control" disabled title={PENDIENTE_NUNCA_PERIODO}>
        CSV: nunca ingresaron en el período (pendiente)
      </button>
      </> : rol.nominal !== "cargando" && <p className="nota" data-testid="sin-nominal">{textoSinNominal(rol)}</p>}
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </div>
  </section>;
}
