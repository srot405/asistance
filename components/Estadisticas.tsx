"use client";
import { useEffect, useMemo, useState } from "react";
import { descargarTexto } from "../lib/descargas";
import { CHIPS_CONFIANZA } from "../lib/confianzaClase.mjs";
import {
  SEMAFORO, SIN_DATO, TEXTO_SUPRIMIDO, barrasCiudades, cifrasDelCorte, construirCsvEstadisticas, explicarVacio, filtrosActivos,
  nivelParaFiltros, opcionesFiltros, pctEntro, tablaCiudadDia, tablaClases, tendenciaPorCiudad,
} from "../lib/estadisticasCalculo.mjs";
import type { CeldaCorte, Cifras, DatosEstadisticas, FiltrosEstadisticas } from "../lib/estadisticasCalculo.d.mts";
import { useEstadisticas } from "../lib/useTiempo";
import type { ResumenHistorico } from "../lib/types";

const ICONO_SEMAFORO: Record<string, string> = { verde: "✓", amarillo: "▲", rojo: "✕", sin_dato: "◌" };
const TEXTO_SEMAFORO: Record<string, string> = { verde: "alto", amarillo: "medio", rojo: "bajo", sin_dato: "sin dato" };
const pct = (v: number | null | undefined) => (v == null ? SIN_DATO : `${v.toFixed(1)} %`);
// null = suprimido por la vista (menos de 5 personas): «<5», nunca 0 ni vacío.
const num = (v: number | null | undefined, suprimido: boolean) => (suprimido ? TEXTO_SUPRIMIDO : v == null ? SIN_DATO : String(v));
const COLORES = ["#406c9e", "#2e9e5b", "#d6893a", "#7a4fb5", "#b3261e", "#16838f"];
const FORMAS = ["circulo", "cuadrado", "rombo", "triangulo", "circulo", "cuadrado"];

function Celda({ c }: { c: CeldaCorte }) {
  if (c.estado === "vacia") return <td className="est-celda est-vacia" title="Sin clases en este cruce"><span aria-label="sin clases">—</span></td>;
  if (c.estado === "suprimida") return <td className="est-celda est-supr" title="Menos de 5 personas: no se publica el número"><b>{TEXTO_SUPRIMIDO}</b></td>;
  const s = c.semaforo ?? "sin_dato";
  return <td className={`est-celda est-${s}`} title={`${c.cifras?.entraron_a_su_clase ?? 0} de ${(c.cifras?.roster ?? 0) - (c.cifras?.no_medibles ?? 0)} medibles entraron a su clase`}>
    <b aria-hidden="true">{ICONO_SEMAFORO[s]}</b> {pct(c.pct)} <span className="est-sr">({TEXTO_SEMAFORO[s]})</span></td>;
}

function Tarjetas({ datos, filtros }: { datos: DatosEstadisticas; filtros: FiltrosEstadisticas }) {
  const t = cifrasDelCorte(datos, filtros);
  const origen = t.fuente === "nivel" ? `total publicado a nivel «${t.nivel}»` : t.fuente === "clases" ? `suma exacta de ${t.clases} clases (ninguna con menos de 5)` : "";
  if (t.fuente === "ninguna") return <p className="historical-notice weekly-notice" role="status" data-testid="est-sin-cifras">{explicarVacio(datos, filtros)}</p>;
  if (t.suprimido) return <p className="historical-notice weekly-notice" role="status" data-testid="est-suprimido">
    Este corte tiene menos de 5 personas ({TEXTO_SUPRIMIDO}): no se publican las cifras para no identificar a nadie.
    {t.fuente === "clases" ? " Con filtros de clase el total solo se muestra si ninguna clase del corte tiene menos de 5 personas." : ""}</p>;
  const c = t.cifras as Cifras;
  const total = pctEntro(c);
  return <>
    <div className="tiempo-grid est-tarjetas" aria-label="Cifras del corte">
      <div className="tiempo-card t-cumple"><span>✓ Entraron a su clase</span><strong>{c.entraron_a_su_clase}</strong><small>{pct(total)} de los medibles</small></div>
      <div className="tiempo-card t-mediana"><span>↗ Fueron a otra clase</span><strong>{c.fueron_a_otra}</strong><small>entraron solo a una clase distinta de la propia</small></div>
      <div className="tiempo-card t-rojo"><span>✕ No aparecieron</span><strong>{c.no_aparecieron}</strong><small>su clase se capturó y no entraron</small></div>
      <div className="tiempo-card t-mediana"><span>Roster</span><strong>{c.roster}</strong><small>personas con clase propia en este corte</small></div>
    </div>
    <div className="tiempo-grid est-aparte" aria-label="Cifras aparte">
      <div className="tiempo-card t-sindato"><span>◌ No medibles (aparte)</span><strong>{c.no_medibles}</strong><small>su clase no tiene captura confiable: NO es ausencia y no se suma a «no aparecieron»</small></div>
      <div className="tiempo-card t-mediana"><span>Visitas recibidas</span><strong>{c.visitas_recibidas}</strong><small>personas de otra clase que entraron a estas clases</small></div>
    </div>
    <p className="nota">Fuente: {origen}.</p>
  </>;
}

function TablaCiudadDia({ datos, filtros }: { datos: DatosEstadisticas; filtros: FiltrosEstadisticas }) {
  const t = tablaCiudadDia(datos, filtros);
  if (t.filas.length === 0 || t.dias.length === 0) return <p className="nota" data-testid="est-vacio-cd">{explicarVacio(datos, filtros)}</p>;
  return <div className="class-table-wrap" role="region" aria-label="Ciudad por día" tabIndex={0}>
    <table className="class-table tiempo-tabla est-tabla"><caption>% que entró a su clase, por ciudad y día</caption>
      <thead><tr><th>Ciudad</th>{t.dias.map((d) => <th key={d} scope="col">{d}</th>)}<th scope="col">Total ciudad</th></tr></thead>
      <tbody>{t.filas.map((f) => <tr key={f.ciudad}><th scope="row">{f.ciudad}</th>{f.celdas.map((c, i) => <Celda key={t.dias[i]} c={c} />)}<Celda c={f.total} /></tr>)}</tbody>
      {!filtros.ciudad && <tfoot><tr><th scope="row">Total día</th>{t.totalesDia.map((c, i) => <Celda key={t.dias[i]} c={c} />)}
        {t.totalSemana ? <Celda c={t.totalSemana} /> : <td />}</tr></tfoot>}
    </table></div>;
}

function TablaClases({ datos, filtros }: { datos: DatosEstadisticas; filtros: FiltrosEstadisticas }) {
  const filas = tablaClases(datos, filtros);
  if (filas.length === 0) return <p className="nota" data-testid="est-vacio-clases">{explicarVacio(datos, filtros)}</p>;
  return <div className="class-table-wrap" role="region" aria-label="Clases por ciudad" tabIndex={0}>
    <table className="class-table tiempo-tabla est-tabla"><caption>Cada clase por ciudad, con el estado de la captura</caption>
      <thead><tr><th>Clase</th><th>Ciudad</th><th>Roster</th><th>Entraron</th><th>A otra</th><th>No aparecieron</th><th>No medibles</th><th>Visitas</th><th>Mediana % tiempo</th><th>Captura</th></tr></thead>
      <tbody>{filas.map((f) => {
        const chip = (CHIPS_CONFIANZA as Record<string, { icono: string; texto: string; ayuda: string }>)[f.confianza];
        const s = f.suprimido; const c = f.cifras;
        return <tr key={f.clave}>
          <th scope="row">{f.clase}<small className="est-sub">{[f.materia, f.cuenta_zoom, f.tipo].filter(Boolean).join(" · ")}</small></th>
          <td>{f.ciudad}</td><td>{num(c?.roster, s)}</td><td>{num(c?.entraron_a_su_clase, s)}</td><td>{num(c?.fueron_a_otra, s)}</td>
          <td>{num(c?.no_aparecieron, s)}</td><td>{num(c?.no_medibles, s)}</td><td>{num(c?.visitas_recibidas, s)}</td>
          <td title={!s && f.mediana == null ? "Menos de 5 personas con tiempo medido: no se publica la mediana" : undefined}>{s ? TEXTO_SUPRIMIDO : f.mediana == null ? SIN_DATO : pct(f.mediana)}</td>
          <td><span className="chips-conf"><span className={`chip-conf chip-conf-${f.confianza}`} title={chip?.ayuda} aria-label={`Captura: ${chip?.texto}. ${chip?.ayuda}`} data-testid="chip-captura">
            <b aria-hidden="true">{chip?.icono}</b> {chip?.texto}</span></span></td>
        </tr>;
      })}</tbody></table></div>;
}

function Barras({ datos, filtros }: { datos: DatosEstadisticas; filtros: FiltrosEstadisticas }) {
  const barras = barrasCiudades(datos, filtros);
  if (barras.length === 0) return <p className="nota">{explicarVacio(datos, filtros)}</p>;
  return <ul className="est-barras" aria-label="Comparación entre ciudades">{barras.map((b) => <li key={b.ciudad}>
    <span className="est-barra-nombre">{b.ciudad}</span>
    <span className="est-barra-pista" aria-hidden="true">{b.estado === "ok" && b.pct != null &&
      <span className={`est-barra est-barra-${b.semaforo}`} style={{ width: `${Math.max(2, Math.min(100, b.pct))}%` }} />}</span>
    <span className="est-barra-valor">{b.estado === "suprimida" ? <b title="Menos de 5 personas">{TEXTO_SUPRIMIDO}</b>
      : b.estado === "vacia" ? SIN_DATO : <><b aria-hidden="true">{ICONO_SEMAFORO[b.semaforo ?? "sin_dato"]}</b> {pct(b.pct)}</>}</span>
  </li>)}</ul>;
}

const ALTO = 190, ML = 36, MS = 12, MI = 40, PASO = 70;
function Marca({ x, y, forma, color }: { x: number; y: number; forma: string; color: string }) {
  if (forma === "cuadrado") return <rect x={x - 3.6} y={y - 3.6} width={7.2} height={7.2} fill={color} />;
  if (forma === "rombo") return <polygon points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} fill={color} />;
  if (forma === "triangulo") return <polygon points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} fill={color} />;
  return <circle cx={x} cy={y} r={4} fill={color} />;
}
function Tendencia({ datos, filtros }: { datos: DatosEstadisticas; filtros: FiltrosEstadisticas }) {
  const t = tendenciaPorCiudad(datos.serie, filtros);
  if (t.series.length === 0 || t.semanas.length < 1) return <p className="nota" data-testid="est-sin-tendencia">Aún no hay semanas con corte por ciudad para comparar.</p>;
  const ancho = ML + Math.max(1, t.semanas.length - 1) * PASO + 24, util = ALTO - MS - MI;
  const x = (i: number) => ML + i * PASO, y = (v: number) => MS + util * (1 - v / 100);
  return <div className="est-tendencia">
    <div className="trend-chart-scroll"><svg className="trend-chart-svg" viewBox={`0 0 ${ancho} ${ALTO}`} width={ancho} height={ALTO} role="img" aria-labelledby="est-tend-titulo" aria-describedby="est-tend-tabla">
      <title id="est-tend-titulo">% que entró a su clase por semana, una línea por ciudad</title>
      {[0, 25, 50, 75, 100].map((l) => <g key={l}><line x1={ML} x2={ancho - 12} y1={y(l)} y2={y(l)} className="trend-chart-grid" />
        <text x={ML - 8} y={y(l) + 3} className="trend-chart-eje-y" textAnchor="end">{l}%</text></g>)}
      {t.semanas.map((s, i) => <text key={s} x={x(i)} y={ALTO - MI + 16} textAnchor="middle" className="trend-chart-eje-y">{s.slice(5)}</text>)}
      {t.series.map((serie, k) => {
        const color = COLORES[k % COLORES.length]; const forma = FORMAS[k % FORMAS.length];
        // La línea se corta en los huecos (semana suprimida o sin dato): no se interpola ni se baja a 0.
        const tramos: { i: number; v: number }[][] = []; let actual: { i: number; v: number }[] = [];
        serie.puntos.forEach((p, i) => { if (p.pct == null) { if (actual.length) tramos.push(actual); actual = []; } else actual.push({ i, v: p.pct }); });
        if (actual.length) tramos.push(actual);
        return <g key={serie.ciudad}>
          {tramos.map((tr, j) => tr.length > 1 && <polyline key={j} fill="none" stroke={color} strokeWidth={2} points={tr.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />)}
          {serie.puntos.map((p, i) => p.pct != null && <Marca key={i} x={x(i)} y={y(p.pct)} forma={forma} color={color} />)}
          {serie.puntos.map((p, i) => p.estado === "suprimida" && <text key={`s${i}`} x={x(i)} y={y(0) - 4} textAnchor="middle" className="est-supr-svg">{TEXTO_SUPRIMIDO}</text>)}
        </g>;
      })}
    </svg></div>
    <ul className="est-leyenda-tend" aria-label="Ciudades">{t.series.map((s, k) => <li key={s.ciudad}>
      <svg width="14" height="14" aria-hidden="true"><Marca x={7} y={7} forma={FORMAS[k % FORMAS.length]} color={COLORES[k % COLORES.length]} /></svg> {s.ciudad}</li>)}</ul>
    <details className="panel definitions" id="est-tend-tabla"><summary>Ver la tendencia como tabla</summary>
      <div className="class-table-wrap"><table className="class-table tiempo-tabla"><thead><tr><th>Ciudad</th>{t.semanas.map((s) => <th key={s}>{s}</th>)}</tr></thead>
        <tbody>{t.series.map((s) => <tr key={s.ciudad}><th scope="row">{s.ciudad}</th>{s.puntos.map((p) => <td key={p.semana}>{p.estado === "suprimida" ? TEXTO_SUPRIMIDO : pct(p.pct)}</td>)}</tr>)}</tbody></table></div>
    </details>
  </div>;
}

// Pestaña «Estadísticas» (TOC-150): el mismo corte (semana · materia · ciudad · día · cuenta Zoom · tipo de clase) en cinco bloques y un CSV.
// Solo agregados sin PII, disponibles para cualquier rol. Las celdas con menos de 5 personas llegan suprimidas desde la base y aquí
// se ven como «<5»; los totales vienen de la vista, nunca de sumar celdas (lib/estadisticasCalculo.mjs).
export default function Estadisticas({ actual, modo, filtros, setFiltros }: {
  actual: ResumenHistorico; modo: "demo" | "real"; filtros: FiltrosEstadisticas; setFiltros: (f: FiltrosEstadisticas) => void;
}) {
  const { estado, datos, recargar } = useEstadisticas(actual.semana, modo, true);
  const d = datos && datos.disponible ? datos : null;
  const [falloCsv, setFalloCsv] = useState("");
  const op = useMemo(() => opcionesFiltros(d), [d]);
  // Los filtros persisten al cambiar de pestaña o de semana; si una opción ya no existe en la semana elegida se suelta.
  useEffect(() => {
    if (!d) return;
    const limpio = { ...filtros };
    if (limpio.ciudad && !op.ciudades.some((c) => c.toLowerCase() === limpio.ciudad.toLowerCase())) limpio.ciudad = "";
    if (limpio.dia && !op.dias.includes(limpio.dia)) limpio.dia = "";
    if (limpio.cuenta && !op.cuentas.includes(limpio.cuenta)) limpio.cuenta = "";
    if (limpio.tipo && !op.tipos.includes(limpio.tipo)) limpio.tipo = "";
    if (JSON.stringify(limpio) !== JSON.stringify(filtros)) setFiltros(limpio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, op]);
  const cambiar = (k: keyof FiltrosEstadisticas, v: string) => setFiltros({ ...filtros, [k]: v });
  const select = (k: keyof FiltrosEstadisticas, etiqueta: string, opciones: string[]) => <label>{etiqueta} <select className="control" value={filtros[k]} onChange={(e) => cambiar(k, e.target.value)}>
    <option value="">Todos</option>{opciones.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;

  function exportar() {
    if (!d) return;
    setFalloCsv("");
    const csv = construirCsvEstadisticas(d, filtros);
    const err = descargarTexto(csv.contenido, `asistencia_${d.semana}_${csv.archivo}.csv`);
    if (err) setFalloCsv(err);
  }

  return <section className="panel tiempo-panel est-panel" aria-label="Estadísticas" aria-busy={estado === "cargando"}>
    <div className="section-heading"><div><h2>Estadísticas</h2>
      <p>Qué estoy viendo: cuántas personas entraron a SU clase, cuántas fueron a otra y cuántas no aparecieron, repartidas por ciudad, día y clase.
        Solo cifras, sin nombres. «{TEXTO_SUPRIMIDO}» = menos de 5 personas (no se publica el número).</p></div></div>

    {estado === "cargando" && <p className="nota" role="status" aria-live="polite">Cargando estadísticas…</p>}
    {estado === "no_disponible" && <p className="historical-notice missing-notice" role="status" data-testid="est-no-disponible">
      Las estadísticas por ciudad y día aún no están disponibles en esta base (faltan las vistas del corte). El resto del panel sigue igual.</p>}
    {estado === "no_detalle" && <p className="historical-notice missing-notice">Esta semana no tiene corte por clase.</p>}
    {estado === "error" && <p className="historical-notice missing-notice" role="alert">No se pudieron cargar las estadísticas.{" "}
      <button type="button" className="control" onClick={recargar}>Reintentar</button></p>}

    {estado === "ok" && d && <>
      <div className="tiempo-filtros est-filtros" aria-label="Filtros del corte">
        <label>Semana y materia <output className="control est-fija">{d.semana} · {d.materia ?? actual.materia}</output></label>
        {select("ciudad", "Ciudad", op.ciudades)}{select("dia", "Día", op.dias)}{select("cuenta", "Cuenta Zoom", op.cuentas)}{select("tipo", "Tipo de clase", op.tipos)}
        {filtrosActivos(filtros) && <button type="button" className="control" onClick={() => setFiltros({ ciudad: "", dia: "", cuenta: "", tipo: "" })}>Quitar filtros</button>}
      </div>
      <p className="nota">La semana y la materia se eligen arriba (selector del panel). Los filtros valen para todos los bloques.
        {` Nivel de totales: ${nivelParaFiltros(filtros)}.`}</p>

      <h3>Cifras del corte</h3>
      <Tarjetas datos={d} filtros={filtros} />

      <h3>Ciudad × día</h3>
      <p className="nota">Semáforo del % que entró a su clase (de los medibles): ✓ {SEMAFORO.verde} % o más · ▲ {SEMAFORO.amarillo}–{SEMAFORO.verde - 1} % · ✕ menos de {SEMAFORO.amarillo} %.
        Es una ayuda de lectura, no una meta oficial. «—» = ese día no hubo clase en esa ciudad.</p>
      <TablaCiudadDia datos={d} filtros={filtros} />

      <h3>Clase × ciudad</h3>
      <TablaClases datos={d} filtros={filtros} />

      <h3>Comparación entre ciudades</h3>
      <Barras datos={d} filtros={filtros} />

      <h3>Tendencia entre semanas, por ciudad</h3>
      <p className="nota">Una línea por ciudad con el % que entró a su clase. Una semana con menos de 5 personas deja un hueco («{TEXTO_SUPRIMIDO}»), no un cero. No usa el filtro de día.</p>
      <Tendencia datos={d} filtros={filtros} />

      <button className="control" type="button" onClick={exportar}>Exportar este corte a CSV{modo === "demo" && " (práctica)"}</button>
      <p className="nota">El CSV trae solo los números que ves (sin nombres), con la leyenda y la nota de supresión.</p>
      {falloCsv && <p className="status" role="alert">{falloCsv}</p>}
    </>}
  </section>;
}
