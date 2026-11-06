"use client";
import { useEffect, useMemo, useState } from "react";
import { sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";
import { aplicarRolDemo, textoSinNominal, usePuedeNominal } from "../lib/rolUi";
import { CODIGOS_DIA_JCON, CODIGOS_SEMANA_JCON } from "../lib/semanaJcon.mjs";
import type { ColumnaJcon, FiltroJcon, IngresoJcon, SemanaJconResponse } from "../lib/semanaJcon.d.mts";

// JC-ON fase 2: pestana «Semana» para JC-ON. Mismo diseno (clases CSS) que ResumenSemanaVisual + CalendarioSemana de JC, pero con
// datos SOLO de /api/semana-jcon: nunca lee /api/datos ni /api/detalle, asi que ninguna cifra de JC entra aqui (ni al reves).
// Se omiten las tarjetas que dependen de datos que JC-ON no tiene (tiempo, ZL de Soporte, Seguimiento congelado, confianza, poblacion
// del periodo). Nombres solo en el CSV autenticado (mismos permisos que JC: monitor solo su ciudad).
type Modo = "ambos" | "horario" | "colados";
const MODOS: { modo: Modo; texto: string; ayuda: string }[] = [
  { modo: "ambos", texto: "Horario correcto + colados", ayuda: "Entraron a su sala o, si no, a la del otro grupo esa semana." },
  { modo: "horario", texto: "Horario correcto", ayuda: "Entraron a la sala de su grupo." },
  { modo: "colados", texto: "Solo colados", ayuda: "No entraron a su sala, pero sí a la del otro grupo." },
];
type Poblacion = "todos" | "horario" | "colados";
const ETIQUETA_POBLACION: Record<Poblacion, string> = { todos: "Todos los que ingresaron", horario: "En su horario", colados: "Colados" };
const porcentaje = (valor: number | null | undefined) => (valor == null ? "—" : `${valor.toFixed(1)} %`);
const fechaCorta = (fecha: string) => new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "UTC" })
  .format(new Date(`${fecha}T12:00:00Z`)).replace(/\.$/, "");
const fechaLarga = (fecha: string) => new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })
  .format(new Date(`${fecha}T12:00:00Z`));
function fechasDeSemana(semana: string): string[] {
  const lunes = new Date(`${semana}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(lunes); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
}
const pctDe = (d: IngresoJcon, m: Modo) => (m === "horario" ? d.porcentaje_horario : m === "colados" ? d.porcentaje_colados : d.porcentaje_ambos);
function vista(d: (IngresoJcon & { en_curso?: boolean; ocurrio?: boolean }) | null | undefined, m: Modo) {
  if (!d) return { pct: "—", n: "—" as number | string, xy: "" };
  const n = d[m];
  if (d.ocurrio === false) return { pct: "pendiente", n, xy: n ? `${n} hasta ahora` : "clase sin datos aún" };
  return { pct: porcentaje(pctDe(d, m)), n, xy: `${n} de ${d.poblacion}` };
}
const Codigo = ({ c }: { c: string }) => <span className="cod-jcon" data-codigo={c}>{c}</span>;

export default function SemanaJcon({ semana, etiqueta, modo, datosIniciales }: {
  semana: string; etiqueta: string; modo: "demo" | "real";
  datosIniciales?: SemanaJconResponse;       // solo para pruebas de renderizado estatico
}) {
  const { puede: puedeNominal, rol } = usePuedeNominal();
  const [filtro, setFiltro] = useState<FiltroJcon>({});
  const [datos, setDatos] = useState<SemanaJconResponse | null>(datosIniciales ?? null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [falloExport, setFalloExport] = useState("");
  const [vistaModo, setVistaModo] = useState<Modo>("ambos");
  const [elegida, setElegida] = useState<Poblacion>("todos");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => { setSelectedDate(null); setFiltro({}); setFalloExport(""); }, [semana]);
  useEffect(() => {
    if (datosIniciales) return;
    let cancelado = false;
    (async () => {
      setCargando(true); setError("");
      try {
        const params = new URLSearchParams({ semana });
        if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
        if (filtro.grupo) params.set("grupo", filtro.grupo);
        const headers: Record<string, string> = {};
        if (modo === "demo") { params.set("demo", "1"); aplicarRolDemo(params); }
        else {
          const sesion = await sesionActual();
          if (!sesion?.access_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
          headers.Authorization = `Bearer ${sesion.access_token}`;
        }
        const r = await fetch(`/api/semana-jcon?${params}`, { headers, cache: "no-store" });
        if (!r.ok) throw new Error(`No se pudo cargar JC-ON (HTTP ${r.status}). Las cifras de JC no se afectan.`);
        const d = (await r.json()) as SemanaJconResponse;
        if (!cancelado) setDatos(d);
      } catch (e) {
        if (!cancelado) { setDatos(null); setError(e instanceof Error ? e.message : String(e)); }
      } finally { if (!cancelado) setCargando(false); }
    })();
    return () => { cancelado = true; };
  }, [semana, filtro.ciudad, filtro.grupo, modo, datosIniciales]);

  const fechas = useMemo(() => fechasDeSemana(semana), [semana]);
  const columnasPorFecha = useMemo(() => {
    const m = new Map<string, ColumnaJcon[]>();
    for (const c of datos?.columnas ?? []) m.set(c.fecha, [...(m.get(c.fecha) ?? []), c]);
    return m;
  }, [datos]);
  const modoInfo = MODOS.find((m) => m.modo === vistaModo) ?? MODOS[0];

  async function descargarNominal() {
    setFalloExport("");
    const params = new URLSearchParams({ semana, formato: "csv" });
    if (filtro.ciudad) params.set("ciudad", filtro.ciudad);
    if (filtro.grupo) params.set("grupo", filtro.grupo);
    const error = await descargarCsv(new URL(`/api/semana-jcon?${params}`, window.location.origin), modo, `jcon_${semana}_lista.csv`);
    if (error) setFalloExport(error);
  }

  const r = datos?.resumen;
  const abierta = Boolean(datos && !datos.terminada);
  const poblacion: Poblacion = r ? elegida : "todos";
  const total = r?.poblacion ?? 0;
  const diaCol = (fecha: string) => columnasPorFecha.get(fecha) ?? [];
  const seleccion = selectedDate ? diaCol(selectedDate) : [];

  return <div className="jcon-semana" data-programa="jcon">
    <section className="historical-hero">
      <div><p className="eyebrow"><span className="vivo-programa">JC-ON</span> Semana del {semana} · {etiqueta.replace(/^\d{4}-\d{2}-\d{2}\s·\s/, "")}</p>
        <h1>Ingresos a clases virtuales · JC-ON</h1>
        <p className="hero-copy">Quién entró a su sala esta semana. Programa aparte de Jóvenes creaTIvos: sus cifras no se suman a JC.</p>
      </div>
    </section>

    {error && <p className="historical-notice missing-notice" role="alert">{error}</p>}
    {datos?.aviso && <p className="historical-notice missing-notice">{datos.aviso}</p>}
    {abierta && <p className="historical-notice weekly-notice" data-testid="aviso-semana-abierta-jcon">⏳ Semana abierta: solo cuentan las clases ya
      cargadas. «Aún no ingresaron» puede bajar cuando se dicte la otra clase; un rojo es definitivo después del domingo (antes sale R?).</p>}
    {!datos && !error && <p className="nota">{cargando ? "Cargando JC-ON…" : ""}</p>}

    {r && <>
      <div className="poblacion-vistas" role="radiogroup" aria-label="Población que muestran las tarjetas">
        {(["todos", "horario", "colados"] as Poblacion[]).map((p) =>
          <button key={p} type="button" role="radio" className="poblacion-vista" data-poblacion={p} aria-checked={poblacion === p} onClick={() => setElegida(p)}>
            {ETIQUETA_POBLACION[p]} · {p === "todos" ? r.asistieron : p === "horario" ? r.horario : r.colados}</button>)}
      </div>
      <section className="metric-grid" aria-label="Cifras de la semana JC-ON" data-poblacion={poblacion}>
        <article className="metric-card retained"><span>Ingresaron{poblacion === "horario" ? " a su sala" : poblacion === "colados" ? " (colados)" : ""}</span>
          {poblacion === "todos" && <><strong>{porcentaje(r.porcentaje_retencion)}</strong>
            <small>{r.asistieron} de {r.poblacion} personas medibles · {r.horario} en su sala y {r.colados} solo en la del otro grupo</small></>}
          {poblacion === "horario" && <><strong>{porcentaje(r.porcentaje_horario)}</strong><small>{r.horario} de {total} personas medibles entraron a la sala de su grupo</small></>}
          {poblacion === "colados" && <><strong>{r.colados > 0 ? "100 %" : "—"}</strong>
            <small>{r.colados} de {r.colados} colados: entraron solo a la sala del otro grupo; por definición todos ingresaron</small></>}
        </article>
        <article className="metric-card absent"><span>{poblacion === "horario" ? "No entraron a su sala" : poblacion === "colados" ? "No ingresaron (colados)" : abierta ? "Aún no ingresaron" : "No ingresaron"}</span>
          {poblacion === "todos" && <><strong>{porcentaje(r.porcentaje_nunca)}</strong><small>{r.nunca} personas no entraron a ninguna sala{abierta ? " hasta ahora" : ""}</small></>}
          {poblacion === "horario" && <><strong>{total ? porcentaje(((total - r.horario) / total) * 100) : "—"}</strong>
            <small>{total - r.horario} personas: {r.nunca} no entraron a ninguna sala y {r.colados} entraron solo como colados</small></>}
          {poblacion === "colados" && <><strong>No aplica</strong><small>un colado, por definición, sí ingresó</small></>}
        </article>
      </section>

      <section className="panel reconciliation" aria-label="Lista de la semana JC-ON">
        <div className="section-heading"><div><h2>Lista de la semana · JC-ON</h2><p>Egresados activos de JC-ON (los retirados no cuentan).</p></div></div>
        <div className="reconciliation-line" role="status"><b>{datos!.roster} personas en la lista</b><span>=</span>
          <span>{r.poblacion} medibles</span><span>+</span><span>{r.pendientes} pendientes (su clase aún no tiene datos)</span></div>
        <div className="calendar-clases"><table className="class-table tabla-modo" data-testid="tabla-grupos-jcon">
          <thead><tr><th>Grupo</th><th>En la lista</th><th>En su sala</th><th>Solo colados</th><th>{abierta ? "Aún no ingresaron" : "No ingresaron"}</th><th>Pendientes</th><th>%</th></tr></thead>
          <tbody>{datos!.porGrupo.map((g) => <tr key={g.grupo}><td>{g.etiqueta}</td><td>{g.roster}</td><td>{g.horario}</td><td>{g.colados}</td>
            <td>{g.nunca}</td><td>{g.pendientes}</td><td>{porcentaje(g.porcentaje_retencion)}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>}

    <section className="panel calendar-panel" aria-label="Calendario de la semana JC-ON">
      <div className="section-heading"><div><h2>Calendario · semana {semana} · JC-ON</h2>
        <p>Clic en un día de clase para ver sus códigos. Cada persona cuenta en el día de SU grupo (viernes = V, sábado = S; en la Bienvenida, B1 = V y B2 = S).</p></div></div>

      {r && <div className="seg-grupo" role="radiogroup" aria-label="Qué contar en cada día">
        {MODOS.map((m) => {
          const v = vista(r, m.modo);
          return <button key={m.modo} type="button" role="radio" className="seg-btn" data-tipo={m.modo} aria-checked={vistaModo === m.modo}
            onClick={() => setVistaModo(m.modo)} title={m.ayuda}>
            <span className="seg-pct">{v.pct}</span><span className="seg-texto">{m.texto}</span><span className="seg-xy">{v.xy}</span>
          </button>;
        })}
      </div>}

      <div className="calendar-layout">
        <div className="calendar-grid" role="group" aria-label="Días de la semana">
          {fechas.map((fecha) => {
            const cols = diaCol(fecha);
            const col = cols[0];
            const tieneDatos = Boolean(col);
            const activo = selectedDate === fecha;
            const v = vista(col, vistaModo);
            const pendiente = Boolean(col && !col.ocurrio);
            return <button key={fecha} type="button" disabled={!tieneDatos} aria-pressed={activo} data-modo={tieneDatos ? vistaModo : undefined}
              className={`calendar-day${tieneDatos ? " con-datos" : " sin-datos"}${activo ? " activo" : ""}${pendiente ? " en-curso" : ""}`}
              title={col ? `${col.tema} · sala del ${col.etiqueta_grupo}` : undefined}
              onClick={() => tieneDatos && setSelectedDate(activo ? null : fecha)}>
              <span className="calendar-day-nombre">{fechaCorta(fecha)}</span>
              <span className="calendar-day-numero">{fecha.slice(8, 10)}</span>
              {tieneDatos ? <><span className="cd-pct">{v.pct}</span><span className="cd-sub">{col!.tema} · {col!.grupo}</span></>
                : <span className="calendar-day-pct calendar-day-sin">{cargando ? "…" : "sin clase"}</span>}
            </button>;
          })}
        </div>

        <aside className="calendar-detail" aria-live="polite">
          {selectedDate && seleccion.length ? seleccion.map((col) => {
            const v = vista(col, vistaModo);
            return <div key={col.id}>
              <h3>{fechaLarga(col.fecha)} · {col.tema} · sala del {col.etiqueta_grupo}</h3>
              <strong className="cifra-modo">{v.pct}</strong>
              <p className="cifra-sub">{v.xy} · {modoInfo.texto.toLowerCase()} · {col.inscritas} en el {col.etiqueta_grupo}</p>
              {!col.ocurrio && <p className="nota">Clase pendiente: aún no hay datos cargados de esta sala.</p>}
              <div className="calendar-clases"><table className="class-table tabla-modo" data-testid="codigos-dia-jcon">
                <thead><tr><th>Código</th><th>Qué significa</th><th>Personas</th></tr></thead>
                <tbody>{CODIGOS_DIA_JCON.map((c) => <tr key={c.codigo}><td><Codigo c={c.codigo} /></td><td>{c.texto}</td><td>{col.codigos[c.codigo]}</td></tr>)}</tbody>
              </table></div>
            </div>;
          }) : <>
            <h3>Semana completa</h3>
            <strong className="cifra-modo">{vista(r, vistaModo).pct}</strong>
            <p className="cifra-sub">{vista(r, vistaModo).xy} · {modoInfo.texto.toLowerCase()}</p>
            {datos && <div className="calendar-clases"><table className="class-table tabla-modo" data-testid="semana-jcon">
              <thead><tr><th>Semana a semana</th><th>Qué significa</th><th>Personas</th></tr></thead>
              <tbody>{CODIGOS_SEMANA_JCON.map((c) => <tr key={c.codigo}><td><Codigo c={c.codigo} /></td><td>{c.texto}</td><td>{datos.semanal[c.codigo]}</td></tr>)}</tbody>
            </table></div>}
          </>}
        </aside>
      </div>

      {datos && datos.columnas.length > 0 && <div className="calendar-clases"><table className="class-table tabla-modo tabla-codigos-jcon" data-testid="dia-a-dia-jcon">
        <caption>Día a día: personas por código en cada clase de la semana</caption>
        <thead><tr><th>Código</th>{datos.columnas.map((c) => <th key={c.id}>{fechaCorta(c.fecha)} {c.fecha.slice(8, 10)} · {c.tema} · sala {c.grupo}</th>)}</tr></thead>
        <tbody>{CODIGOS_DIA_JCON.map((k) => <tr key={k.codigo} title={k.texto}><td><Codigo c={k.codigo} /></td>
          {datos.columnas.map((c) => <td key={c.id}>{c.codigos[k.codigo]}</td>)}</tr>)}</tbody>
      </table></div>}

      <div className="calendar-filters">
        <label>Ciudad <select className="control" value={filtro.ciudad ?? ""} onChange={(e) => setFiltro((f) => ({ ...f, ciudad: e.target.value || undefined }))}>
          <option value="">Todas</option>
          {(datos?.ciudades ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select></label>
        <label>Grupo <select className="control" value={filtro.grupo ?? ""} onChange={(e) => setFiltro((f) => ({ ...f, grupo: (e.target.value || undefined) as FiltroJcon["grupo"] }))}>
          <option value="">Ambos</option><option value="V">Grupo V (viernes)</option><option value="S">Grupo S (sábado)</option>
        </select></label>
      </div>

      <div className="calendar-actions">
        {puedeNominal ? <button className="control" onClick={descargarNominal} title="Una fila por persona con su código en cada clase y en la semana">
          Lista nominal JC-ON (CSV) de la semana{modo === "demo" && " · práctica"}</button>
          : rol.nominal !== "cargando" && <p className="nota" data-testid="sin-nominal">{textoSinNominal(rol)}</p>}
        {falloExport && <p className="status" role="alert">{falloExport}</p>}
      </div>
    </section>

    <details className="panel definitions"><summary>Cómo se calculan estas cifras (JC-ON)</summary>
      <p><b>Salas:</b> cada clase es de un grupo (viernes = grupo V, sábado = grupo S; Bienvenida B1 = V, B2 = S). Quien entra a la sala del otro grupo es «colado».</p>
      <p><b>Ingresaron:</b> entraron a cualquiera de las dos salas de la semana. <b>Medibles:</b> todos los activos, salvo quien tiene su clase sin datos aún y no ha entrado a ninguna (pendiente).</p>
      {CODIGOS_DIA_JCON.map((c) => <p key={c.codigo}><Codigo c={c.codigo} /> {c.texto}</p>)}
      <p>No aplican a JC-ON: tiempo en clase, Zoom limit (ZL), Seguimiento congelado ni confianza de captura; por eso no se muestran.</p>
    </details>
  </div>;
}
