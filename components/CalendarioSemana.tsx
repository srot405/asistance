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

const PENDIENTE_NUNCA_PERIODO = "Pendiente: el histórico solo expone el conteo agregado del período (arriba), " +
  "no la lista de personas. Para nominarlo sin inventar datos falta que el ETL exponga los persona_id " +
  "identificados en cada semana, incluidas las de nivel \"Solo semanal\".";

// Selector de vista del calendario (TOC-91, Samuel 2026-10-09; revisado por 3 agentes de UX/UI/datos). Cuatro opciones
// excluyentes, siempre una marcada. Cambia la cifra de TODOS los días, del resumen y la columna resaltada de las tablas.
// En pantalla solo cifras; los nombres salen únicamente en el CSV (nominal, con permiso). Denominadores:
//  - ingreso: % oficial (entró a alguna clase ese día / roster medible). No se toca.
//  - propias: entró a SU clase / el mismo roster medible -> siempre <= % de ingreso.
//  - otras:   colados / todos los que entraron a esas clases (nunca sobre el roster: los colados no están en él).
//  - ambos:   solo conteo de entradas (persona x clase; una persona puede sumar en dos clases).
type Modo = "ingreso" | "propias" | "otras" | "ambos";
const MODOS: { modo: Modo; ico: string; texto: string; ayuda: string }[] = [
  { modo: "ingreso", ico: "%", texto: "% de ingreso", ayuda: "Del roster de cada día, cuántos entraron a alguna clase (la suya u otra)." },
  { modo: "propias", ico: "✓", texto: "Entraron en su horario", ayuda: "Del roster de cada día, cuántos entraron a SU clase, la de su horario." },
  { modo: "otras", ico: "↪", texto: "Se colaron a otra clase", ayuda: "Personas que entraron a una clase que no es la suya. El % es sobre todos los que entraron a esas clases." },
  { modo: "ambos", ico: "+", texto: "Todos los ingresos", ayuda: "Cada entrada a una clase, de su horario o colada. Una misma persona puede sumar en dos clases." },
];
const NOMBRE_CSV: Record<Exclude<Modo, "ingreso">, string> = { propias: "entraron en su horario", otras: "colados", ambos: "todos los ingresos" };

type Cifras = ResumenPlano | DetalleHistorico;
// Cifra grande + subtítulo de un recorte (día, clase o semana) según el modo.
function vista(d: Cifras | null | undefined, modo: Modo): { grande: string; sub: string } {
  if (!d) return { grande: "—", sub: "" };
  if (modo === "propias") return { grande: porcentaje(d.porcentaje_su_horario), sub: `${d.en_su_horario ?? "—"} de ${d.poblacion ?? "—"}` };
  if (modo === "otras") return { grande: porcentaje(d.porcentaje_colados), sub: `${d.colados ?? "—"} de ${d.ingresos ?? "—"} entradas` };
  if (modo === "ambos") return { grande: String(d.ingresos ?? "—"), sub: "entradas" };
  return { grande: porcentaje(d.porcentaje_retencion), sub: `${d.asistieron ?? "—"} de ${d.poblacion ?? "—"}` };
}

// Celda de tabla: número + % pequeño debajo.
function Num({ n, pct }: { n: number | null | undefined; pct?: number | null }) {
  return <>{n ?? "—"}{pct !== undefined && <small className="tabla-pct">{porcentaje(pct)}</small>}</>;
}

const ENCABEZADOS = <>
  <th className="col-ingreso" title="Entró a alguna clase ese día (la suya u otra)">Ingresaron</th>
  <th className="col-propias" title="Entró a la clase de su horario">En su horario</th>
  <th className="col-otras" title="Personas de otro horario que entraron a esta clase; % sobre todos los que entraron a ella">De otra clase</th>
</>;
function CeldasCifras({ d }: { d: Cifras }) {
  return <>
    <td className="col-ingreso"><Num n={d.asistieron} pct={d.porcentaje_retencion} /></td>
    <td className="col-propias"><Num n={d.en_su_horario} pct={d.porcentaje_su_horario} /></td>
    <td className="col-otras"><Num n={d.colados} pct={d.porcentaje_colados} /></td>
  </>;
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
  const [vistaModo, setVistaModo] = useState<Modo>("ingreso");
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

  // CSV con nombres del modo activo (en su horario / colados / todos), de la semana o del día elegido.
  async function descargarIngresos(alcance: "semana" | "dia") {
    if (vistaModo === "ingreso") return;
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

  const botonNombres = (alcance: "semana" | "dia") => vistaModo !== "ingreso" && puedeNominal
    ? <button className="control" onClick={() => descargarIngresos(alcance)}>
      ⬇ Descargar nombres: {NOMBRE_CSV[vistaModo]} {alcance === "dia" ? "este día" : "esta semana"}{modo === "demo" && " (práctica)"}
    </button> : null;
  const cifraSemana = vista(resumenSemana, vistaModo);

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

    {esDetalle && <div className="modo-vista">
      <div className="seg-grupo" role="group" aria-label="Qué mostrar en cada día de la semana">
        {MODOS.map((m) => {
          const semana = vista(resumenSemana, m.modo).grande;
          return <button key={m.modo} type="button" className="seg-btn" data-tipo={m.modo} aria-pressed={vistaModo === m.modo}
            onClick={() => setVistaModo(m.modo)} title={m.ayuda} aria-label={`${m.texto}. Semana: ${semana}`}>
            <span className="seg-ico" aria-hidden="true">{m.ico}</span>
            <span className="seg-texto">{m.texto}</span>
            {detalle && <span className="seg-badge" aria-hidden="true">{semana}</span>}
          </button>;
        })}
      </div>
      <p className="seg-ayuda" aria-live="polite">{modoInfo.ayuda}</p>
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
            aria-label={tieneDatos ? `${fechaLarga(fecha)}: ${modoInfo.texto} ${v.grande}, ${v.sub}` : undefined}
            className={`calendar-day${tieneDatos ? " con-datos" : " sin-datos"}${activo ? " activo" : ""}${esElSabadoResponsable ? " sabado-responsable" : ""}`}
            title={esElSabadoResponsable ? "Este sábado no tuvo clase regular esta semana" : undefined}
            onClick={() => tieneDatos && setSelectedDate(activo ? null : fecha)}>
            {esElSabadoResponsable && <span className="calendar-day-estrella" aria-hidden="true">{ICONO_SIN_SABADO}</span>}
            <span className="calendar-day-nombre">{fechaCorta(fecha)}</span>
            <span className="calendar-day-numero">{fecha.slice(8, 10)}</span>
            {tieneDatos ? <><span className="cd-pct">{v.grande}</span><span className="cd-sub">{v.sub}</span></>
              : <span className="calendar-day-pct calendar-day-sin">{cargando && esDetalle ? "…" : "sin dato"}</span>}
          </button>;
        })}
      </div>

      <aside className="calendar-detail" aria-live="polite">
        {selectedDate ? <>
          <h3>{fechaLarga(selectedDate)}</h3>
          {diaSeleccionado ? <>
            <strong className={`cifra-modo cifra-${vistaModo}`}>{vista(diaSeleccionado, vistaModo).grande}</strong>
            <p className="cifra-sub">{modoInfo.texto} · {vista(diaSeleccionado, vistaModo).sub}</p>
            {clasesDelDia.length > 0 && <div className="calendar-clases"><table className="class-table tabla-modo" data-modo={vistaModo}>
              <thead><tr><th>Clase</th>{ENCABEZADOS}<th>Confianza</th></tr></thead>
              <tbody>{clasesDelDia.map((clase) => <tr key={`${clase.fecha}-${clase.slot_id}`}>
                <td>{horarioDe(clase.slot_id)}<small className="tabla-roster">roster {clase.poblacion}</small></td>
                <CeldasCifras d={clase} />
                <td>{confianza.size ? <ChipConfianza c={confianza.get(clase.slot_id ?? "")} /> : "—"}</td>
              </tr>)}</tbody>
              {clasesDelDia.length > 1 && <tfoot><tr><td>Total del día<small className="tabla-roster">roster {diaSeleccionado.poblacion}</small></td>
                <CeldasCifras d={diaSeleccionado} /><td /></tr></tfoot>}
            </table></div>}
            <div className="calendar-csv">
              {botonNombres("dia")}
              {puedeNominal && <button className="control" onClick={() => descargarNominal("dia")}>
                Descargar CSV: no ingresaron este día{modo === "demo" && " (práctica)"}
              </button>}
            </div>
          </> : <p className="nota">Sin datos para este día.</p>}
        </> : <>
          <h3>Semana completa</h3>
          <strong className={`cifra-modo cifra-${vistaModo}`}>{cifraSemana.grande}</strong>
          <p className="cifra-sub">{modoInfo.texto} · {cifraSemana.sub}{conFiltro ? " (con filtro aplicado)" : ""}</p>
          {esDetalle && detalle && detalle.porDia.length > 0 && <div className="calendar-clases"><table className="class-table tabla-modo" data-modo={vistaModo}>
            <thead><tr><th>Día</th>{ENCABEZADOS}</tr></thead>
            <tbody>{detalle.porDia.map((d) => <tr key={d.fecha}>
              <td><span className="tabla-dia">{fechaCorta(d.fecha)} {d.fecha.slice(8, 10)}</span><small className="tabla-roster">roster {d.poblacion}</small></td><CeldasCifras d={d} />
            </tr>)}</tbody>
            <tfoot><tr><td>Semana<small className="tabla-roster">roster {resumenSemana.poblacion ?? "—"}</small></td><CeldasCifras d={resumenSemana as Cifras} /></tr></tfoot>
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
      {botonNombres("semana")}
      <button className="control" disabled={!esDetalle} onClick={() => descargarNominal("semana")}>
        Descargar CSV: no ingresaron esta semana{modo === "demo" && " (práctica)"}
      </button>
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
