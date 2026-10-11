"use client";
import { useEffect, useMemo, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import { textoSinNominal, usePuedeNominal } from "../lib/rolUi";
import { esFranjaPresencial, ICONO_SIN_SABADO } from "../lib/franjaTipo.mjs";
import { useConfianzaSemana } from "../lib/useTiempo";
import ChipConfianza, { mapaConfianza } from "./ChipConfianza";
import type { CamposIngreso, DetalleHistorico, DetalleSemanaResponse, FiltroDetalle, ResumenHistorico } from "../lib/types";

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
  porcentaje_retencion: number | null; porcentaje_nunca: number | null } & Partial<CamposIngreso>;

// Descargas de poblacion del periodo (TOC-91, auditoria 2026-10-09): cifras de /api/poblacion (agregados) y nombres solo en CSV.
type ConteosPoblacion = { nunca: number; nunca_con_registro: number; nunca_sin_registro: number; sin_rastro: number; solo_colados: number; solo_log: number };
type Poblacion = { disponible: boolean; poblacion?: number; conteos?: ConteosPoblacion; periodo_desde?: string; periodo_hasta?: string };
const DESCARGAS_POBLACION: { vista: keyof ConteosPoblacion & string; texto: string; ayuda: string }[] = [
  { vista: "nunca", texto: "Nunca ingresaron en el período", ayuda: "Del roster actual, sin ninguna entrada a clase en todo el período (por cédula). Incluye si están registrados en Zoom." },
  { vista: "sin_rastro", texto: "Sin rastro en Zoom", ayuda: "No aparecen en el registro de Zoom ni por correo ni por cédula: aunque entren, no se les puede identificar." },
  { vista: "solo_colados", texto: "Solo colados del período", ayuda: "Entraron alguna vez, pero nunca a su propia clase." },
  { vista: "solo_log", texto: "Entraron pero el panel no lo registró", ayuda: "Hay entrada a clase en el log crudo de Zoom, pero no en el panel: hueco del pipeline para revisar." },
];

// Filtros del calendario (TOC-91, Samuel 2026-10-09). Uno a la vez. Cambian la cifra de TODOS los días, del resumen y la
// columna «Cantidad» de su tabla. Todo se cuenta en el día de la clase de la persona (si alguien del martes entra el
// miércoles, cuenta el martes) sobre el roster medible de ese día/clase. Nombres solo en el CSV.
type Modo = "ambos" | "horario" | "colados";
const MODOS: { modo: Modo; texto: string; ayuda: string }[] = [
  { modo: "ambos", texto: "Horario correcto + colados", ayuda: "Entraron a su clase o, si no, a otra clase de la semana." },
  { modo: "horario", texto: "Horario correcto", ayuda: "Entraron a la clase de su horario." },
  { modo: "colados", texto: "Solo colados", ayuda: "No entraron a su clase, pero sí a otra de la semana." },
];

type Cifras = ResumenPlano | DetalleHistorico;
const pctDe = (d: Cifras, m: Modo) => (m === "horario" ? d.porcentaje_horario : m === "colados" ? d.porcentaje_colados : d.porcentaje_ambos);
// % + "x de y" (y = roster medible) de un recorte (día, clase o semana).
function vista(d: Cifras | null | undefined, m: Modo): { pct: string; n: number | string; xy: string } {
  if (!d) return { pct: "—", n: "—", xy: "" };
  const n = d[m] ?? "—";
  return { pct: porcentaje(pctDe(d, m)), n, xy: `${n} de ${d.poblacion ?? "—"}` };
}

// Nombre corto de la clase para la tabla del día (el día ya se sabe): "Backend - Sábado 8:00 A.M. COL/ECU/PAN | 10:00 A.M. UY - Uno"
// -> "8:00 A.M. · Uno". El texto completo queda en el title.
const DIA = /\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b\s*/i;
function claseCorta(texto: string): string {
  const [antes, despues = ""] = texto.split("|");
  const hora = antes.replace(/^.*?\s-\s/, "").replace(DIA, "").replace(/\s+[A-Z]{2,3}(\/[A-Z]{2,3})+\s*$/, "").trim();
  const extra = /\s-\s([^-]+)$/.exec(despues)?.[1]?.trim();
  return extra ? `${hora} · ${extra}` : hora || texto;
}

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
  const [vistaModo, setVistaModo] = useState<Modo>("ambos");
  const [poblacion, setPoblacion] = useState<Poblacion | null>(null);
  const esDetalle = actual.nivel === "Detalle";
  const confianza = mapaConfianza(useConfianzaSemana(actual.semana, modo, esDetalle).datos);   // TOC-151

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

  // Conteos de poblacion del periodo (no dependen de la semana elegida). Solo en modo real: el demo no tiene registro de Zoom.
  useEffect(() => {
    if (modo !== "real") return;
    let cancelado = false;
    (async () => {
      try {
        const sesion = await sesionActual();
        if (!sesion?.access_token) return;
        const r = await fetch("/api/poblacion", { headers: { Authorization: `Bearer ${sesion.access_token}` }, cache: "no-store" });
        if (r.ok && !cancelado) setPoblacion(await r.json() as Poblacion);
      } catch { /* sin cifras: los botones salen sin conteo */ }
    })();
    return () => { cancelado = true; };
  }, [modo]);

  const fechas = useMemo(() => fechasDeSemana(actual.semana), [actual.semana]);
  const porDiaPorFecha = useMemo(() => new Map((detalle?.porDia ?? []).map((d) => [d.fecha, d])), [detalle]);
  const diaSeleccionado = selectedDate ? porDiaPorFecha.get(selectedDate) ?? null : null;
  const clasesDelDia = useMemo(() => selectedDate
    ? (detalle?.porClase ?? []).filter((c) => c.fecha === selectedDate) : [],
    [detalle, selectedDate]);
  const horarioDe = (slotId?: string) => detalle?.franjas.find((f) => f.slot_id === slotId)?.horario_texto ?? slotId ?? "";
  const modoInfo = MODOS.find((m) => m.modo === vistaModo) ?? MODOS[0];
  const conFiltro = Boolean(filtro.ciudad || filtro.franja || filtro.cuenta);

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

  // CSV con nombres del filtro activo, de la semana o del día elegido.
  async function descargarIngresos(alcance: "semana" | "dia") {
    setFalloExport("");
    const params = new URLSearchParams({ semana: actual.semana, tipo: vistaModo });
    if (alcance === "dia") { if (!selectedDate) return; params.set("fecha", selectedDate); }
    if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
    if (filtro.franja) params.set("franja", filtro.franja);
    if (filtro.cuenta) params.set("cuenta", filtro.cuenta);
    const url = new URL(`/api/ingresos?${params}`, window.location.origin);
    const error = await descargarCsv(url, modo, `ingresos_${vistaModo}_${alcance === "dia" ? selectedDate : `semana_${actual.semana}`}.csv`);
    if (error) setFalloExport(error);
  }

  async function descargarPoblacion(vista: string) {
    setFalloExport("");
    const params = new URLSearchParams({ vista });
    if (vista === "no_medibles") params.set("semana", actual.semana);
    if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
    const url = new URL(`/api/poblacion?${params}`, window.location.origin);
    const error = await descargarCsv(url, modo, `${vista}_${vista === "no_medibles" ? actual.semana : poblacion?.periodo_hasta ?? "periodo"}.csv`);
    if (error) setFalloExport(error);
  }

  const botonNombres = (alcance: "semana" | "dia") => puedeNominal
    ? <button className="control" onClick={() => descargarIngresos(alcance)} title={`${modoInfo.texto}: nombres en CSV`}>
      Nombres (CSV){alcance === "semana" ? " de la semana" : ""}{modo === "demo" && " · práctica"}
    </button> : null;
  const semana = vista(resumenSemana, vistaModo);

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

    {esDetalle && <div className="seg-grupo" role="radiogroup" aria-label="Qué contar en cada día">
      {MODOS.map((m) => {
        const v = vista(resumenSemana, m.modo);
        return <button key={m.modo} type="button" role="radio" className="seg-btn" data-tipo={m.modo} aria-checked={vistaModo === m.modo}
          onClick={() => setVistaModo(m.modo)} title={m.ayuda} aria-label={`${m.texto}: ${v.pct}, ${v.xy} en la semana`}>
          <span className="seg-pct">{detalle ? v.pct : "…"}</span>
          <span className="seg-texto">{m.texto}</span>
          <span className="seg-xy">{detalle ? v.xy : ""}</span>
        </button>;
      })}
    </div>}

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
          const v = vista(dia, vistaModo);
          return <button key={fecha} type="button" disabled={!tieneDatos}
            aria-pressed={activo} data-modo={tieneDatos ? vistaModo : undefined}
            aria-label={tieneDatos ? `${fechaLarga(fecha)}: ${modoInfo.texto} ${v.pct}, ${v.xy}` : undefined}
            className={`calendar-day${tieneDatos ? " con-datos" : " sin-datos"}${activo ? " activo" : ""}${esElSabadoResponsable ? " sabado-responsable" : ""}`}
            title={esElSabadoResponsable ? "Este sábado no tuvo clase regular esta semana" : undefined}
            onClick={() => tieneDatos && setSelectedDate(activo ? null : fecha)}>
            {esElSabadoResponsable && <span className="calendar-day-estrella" aria-hidden="true">{ICONO_SIN_SABADO}</span>}
            <span className="calendar-day-nombre">{fechaCorta(fecha)}</span>
            <span className="calendar-day-numero">{fecha.slice(8, 10)}</span>
            {tieneDatos ? <><span className="cd-pct">{v.pct}</span><span className="cd-sub">{v.xy}</span></>
              : <span className="calendar-day-pct calendar-day-sin">{cargando && esDetalle ? "…" : "sin dato"}</span>}
          </button>;
        })}
      </div>

      <aside className="calendar-detail" aria-live="polite">
        {selectedDate ? <>
          <h3>{fechaLarga(selectedDate)}</h3>
          {diaSeleccionado ? <>
            <strong className="cifra-modo">{vista(diaSeleccionado, vistaModo).pct}</strong>
            <p className="cifra-sub">{vista(diaSeleccionado, vistaModo).xy} · {modoInfo.texto.toLowerCase()}</p>
            {clasesDelDia.length > 0 && <div className="calendar-clases"><table className="class-table tabla-modo">
              <thead><tr><th>Clase</th><th>Roster</th><th>Cantidad</th><th>%</th><th title="Confianza de la captura y cuadre de la clase">Conf.</th></tr></thead>
              <tbody>{clasesDelDia.map((clase) => {
                const v = vista(clase, vistaModo);
                return <tr key={`${clase.fecha}-${clase.slot_id}`}>
                  <td className="col-clase" title={horarioDe(clase.slot_id)}>{claseCorta(horarioDe(clase.slot_id))}</td>
                  <td>{clase.poblacion}</td><td className="col-cantidad">{v.n}</td><td>{v.pct}</td>
                  <td className="col-conf">{confianza.size ? <ChipConfianza c={confianza.get(clase.slot_id ?? "")} /> : "—"}</td>
                </tr>;
              })}</tbody>
            </table></div>}
            <div className="calendar-csv">
              {botonNombres("dia")}
              {puedeNominal && <button className="control" onClick={() => descargarNominal("dia")}>
                No ingresaron (CSV){modo === "demo" && " · práctica"}
              </button>}
            </div>
          </> : <p className="nota">Sin datos para este día.</p>}
        </> : <>
          <h3>Semana completa</h3>
          <strong className="cifra-modo">{semana.pct}</strong>
          <p className="cifra-sub">{semana.xy} · {modoInfo.texto.toLowerCase()}{conFiltro ? " (con filtro)" : ""}</p>
          {esDetalle && detalle && detalle.porDia.length > 0 && <div className="calendar-clases"><table className="class-table tabla-modo">
            <thead><tr><th>Día</th><th>Roster</th><th>Cantidad</th><th>%</th></tr></thead>
            <tbody>{detalle.porDia.map((d) => {
              const v = vista(d, vistaModo);
              return <tr key={d.fecha}><td className="tabla-dia">{fechaCorta(d.fecha)} {d.fecha.slice(8, 10)}</td>
                <td>{d.poblacion}</td><td className="col-cantidad">{v.n}</td><td>{v.pct}</td></tr>;
            })}</tbody>
          </table></div>}
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
      {esDetalle && botonNombres("semana")}
      <button className="control" disabled={!esDetalle} onClick={() => descargarNominal("semana")}>
        Descargar CSV: no ingresaron esta semana{modo === "demo" && " (práctica)"}
      </button>
      <button className="control" onClick={descargarReporte}
        title="Roster completo con estado por persona y resumen de captura; sirve aunque la semana esté incompleta">
        Descargar reporte CSV (semana completa o incompleta){modo === "demo" && " (práctica)"}
      </button>
      </> : rol.nominal !== "cargando" && <p className="nota" data-testid="sin-nominal">{textoSinNominal(rol)}</p>}
      {falloExport && <p className="status" role="alert">{falloExport}</p>}
    </div>

    {puedeNominal && modo === "real" && <div className="poblacion-descargas" role="group" aria-label="Descargas de población del período">
      <h3>Población del período{poblacion?.periodo_desde ? <small> · {poblacion.periodo_desde} → {poblacion.periodo_hasta} · roster {poblacion.poblacion}</small> : null}</h3>
      <div className="calendar-actions">
        {DESCARGAS_POBLACION.map((d) => <button key={d.vista} className="control" title={d.ayuda} onClick={() => descargarPoblacion(d.vista)}>
          {d.texto}{poblacion?.conteos ? ` (${poblacion.conteos[d.vista]})` : ""}
        </button>)}
        {esDetalle && <button className="control" title="Personas del roster de esta semana que no cuentan en el %: su clase no ha ocurrido, está pendiente de cierre o sin dato"
          onClick={() => descargarPoblacion("no_medibles")}>No medibles esta semana</button>}
      </div>
      {poblacion?.conteos && <p className="nota">De los {poblacion.conteos.nunca} que nunca ingresaron, {poblacion.conteos.nunca_con_registro} están registrados en Zoom
        y {poblacion.conteos.nunca_sin_registro} no tienen ningún registro (verificar contacto).</p>}
    </div>}
  </section>;
}
