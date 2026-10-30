"use client";
import { useEffect, useMemo, useState } from "react";
import { descargarCsv } from "../lib/descargas";
import { textoSinNominal, usePuedeNominal } from "../lib/rolUi";
import { urlListaVivo, useListaVivo } from "../lib/useListaVivo";
import { TEXTO_CERRADA, visibilidadClase } from "../lib/vivoVista.mjs";
import type { ClaseListaVivo, PersonaVivo, SenalAsistencia, SenalVivo } from "../lib/vivoNominal.d.mts";

// Pestana «Lista en vivo» (TOC-153): quien entro HOY a cada clase, con nombre, y con que senal. Nominal: el servidor decide
// que filas salen (monitor = su ciudad); ocultar la pestana nunca reemplaza esa validacion.
// Colores: verde roster, amarillo ausente (nunca entro), naranja no identificado, morado colados, azul personal. Siempre icono + texto.
const SENALES: SenalAsistencia[] = ["roster", "otra_franja", "no_identificado", "personal"];
const SENALES_FILTRO: SenalVivo[] = ["roster", "ausente", "otra_franja", "no_identificado", "personal"];
const ETIQUETA: Record<SenalVivo, string> = { roster: "De esta clase", otra_franja: "Colados (otra clase)", no_identificado: "No identificado", personal: "Personal",
  ausente: "No ha entrado" };
const ICONO: Record<SenalVivo, string> = { roster: "✓", otra_franja: "↔", no_identificado: "?", personal: "★", ausente: "○" };
const ESTADO: Record<string, string> = { abierta: "En curso", proxima: "Próxima", terminada: "Terminada", sin_sala: "Sin sala" };
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "—");
// Estado de la persona en la sala: nunca entro / sigue en sala / salio (hora de su ultima salida, si se registro).
function EstadoSala({ p }: { p: PersonaVivo }) {
  if (p.entradas === 0) return <span className="vivo-estado vivo-estado-ausente">—</span>;
  if (p.en_sala) return <span className="vivo-estado vivo-estado-en-sala"><b aria-hidden="true">●</b> En sala</span>;
  return <span className="vivo-estado vivo-estado-salio"><b aria-hidden="true">↩</b> {p.ultima_salida ? `Salió ${hora(p.ultima_salida)}` : "Salió (sin hora)"}</span>;
}
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Chip({ senal }: { senal: SenalVivo }) {
  return <span className={`chip-conf chip-senal-${senal}`}><b aria-hidden="true">{ICONO[senal]}</b>{ETIQUETA[senal]}</span>;
}

// (TOC-153) Cerrada = ya paso su hora de fin, mismo dia Bogota; las de dias anteriores no se muestran.
const estaCerrada = (c: ClaseListaVivo, ahora: number) => visibilidadClase(c, ahora) === "cerrada";
const etiquetaClase = (c: ClaseListaVivo, ahora: number) => (estaCerrada(c, ahora) ? `${c.etiqueta} · ${TEXTO_CERRADA}` : c.etiqueta);

function TablaCifras({ clases, ahora }: { clases: ClaseListaVivo[]; ahora: number }) {
  return <div className="class-table-wrap" role="region" aria-label="Cifras por clase" tabIndex={0}>
    <table className="class-table"><caption>Personas que entraron hoy, por clase (entre paréntesis: ahora en sala). «No ha entrado» va aparte: no es asistencia.</caption>
      <thead><tr><th>Clase</th><th>Estado</th><th>Inscritas</th>{SENALES.map((s) => <th key={s}>{ETIQUETA[s]}</th>)}<th>{ETIQUETA.ausente}</th></tr></thead>
      <tbody>{clases.map((c) => <tr key={c.slot_id} className={estaCerrada(c, ahora) ? "fila-cerrada" : undefined} data-visibilidad={estaCerrada(c, ahora) ? "cerrada" : "abierta"}>
        <td>{c.etiqueta}</td><td>{ESTADO[c.estado] ?? c.estado}{estaCerrada(c, ahora) && <> <span className="vivo-marca-cerrada">{TEXTO_CERRADA}</span></>}</td><td>{c.roster_total}</td>
        {SENALES.map((s) => <td key={s}>{c.cifras[s].total} <small>({c.cifras[s].en_sala})</small></td>)}
        <td>{c.estado === "abierta" || c.estado === "terminada" ? c.ausentes ?? 0 : "—"}</td>
      </tr>)}</tbody>
    </table></div>;
}

export default function EnVivoLista({ modo }: { modo: "demo" | "real" }) {
  const { puede, rol } = usePuedeNominal();
  if (!puede) return <section className="panel"><h3>Lista en vivo</h3>
    <p className="historical-notice missing-notice" role="status">{rol.nominal === "cargando" ? "Verificando permiso…" : textoSinNominal(rol)}</p></section>;
  return <ListaConPermiso modo={modo} />;
}

function ListaConPermiso({ modo }: { modo: "demo" | "real" }) {
  const { fase, datos, mensaje, leidoEn, actualizar, esperaActualizarMs } = useListaVivo(modo);
  const [clase, setClase] = useState("");
  const [senal, setSenal] = useState<"" | SenalVivo>("");
  const [texto, setTexto] = useState("");
  const [soloSala, setSoloSala] = useState(false);
  const [falloCsv, setFalloCsv] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id); }, []);

  // El reloj de 1 s repinta la marca «Cerrada»; las filas solo se recalculan al cambiar de minuto.
  const minuto = Math.floor(ahora / 60000);
  const clasesVisibles = useMemo(() => (datos ? datos.clases.filter((c) => visibilidadClase(c, minuto * 60000) !== "oculta") : []), [datos, minuto]);
  const filas = useMemo(() => {
    if (!datos) return [] as { c: ClaseListaVivo; p: PersonaVivo }[];
    const t = sinAcentos(texto.trim());
    return clasesVisibles.filter((c) => !clase || c.slot_id === clase)
      .flatMap((c) => c.personas.map((p) => ({ c, p })))
      .filter(({ p }) => (!senal || p.senal === senal) && (!soloSala || p.en_sala)
        && (!t || sinAcentos(`${p.nombre ?? ""} ${p.cedula ?? ""} ${p.correo ?? ""} ${p.ciudad ?? ""}`).includes(t)));
  }, [datos, clasesVisibles, clase, senal, texto, soloSala]);

  async function csv() {
    setFalloCsv("");
    const error = await descargarCsv(urlListaVivo(modo, "csv"), modo, `lista_en_vivo_${datos?.hora_servidor.slice(0, 10) ?? "hoy"}.csv`);
    if (error) setFalloCsv(error);
  }
  const edad = leidoEn ? Math.max(0, Math.round((ahora - leidoEn) / 1000)) : null;
  const puedeActualizar = !leidoEn || ahora - leidoEn >= esperaActualizarMs;

  return <section className="panel lista-vivo" aria-label="Lista en vivo" aria-busy={fase === "cargando"}>
    <h3>Lista en vivo</h3>
    <p className="nota">Quién entró hoy a cada clase y con qué señal. <b>Colados (otra clase)</b> = está en la lista de esta semana pero su horario es otro.
      <b>No ha entrado</b> = inscrita en esta clase y no ha entrado hoy (solo clases en curso o terminadas; no suma en las cifras).
      Identificación: primero el correo del roster; si no coincide, la cédula del registro de Zoom. Nunca se adivina por nombre.
      {datos?.alcance?.ciudad ? <> Ves solo personas de <b>{datos.alcance.ciudad}</b>.</> : null}</p>
    <div className="tiempo-filtros">
      <button type="button" className="control" onClick={actualizar} disabled={!puedeActualizar}>Actualizar</button>
      <button type="button" className="control" onClick={csv} disabled={!datos}>Descargar CSV</button>
      {edad != null && <span className="nota" role="status">Actualizado hace {edad} s · se refresca cada 45 s</span>}
    </div>
    {falloCsv && <p className="status" role="alert">{falloCsv}</p>}
    {fase === "cargando" && <p className="nota" role="status">Cargando lista…</p>}
    {fase === "sin_permiso" && <p className="historical-notice missing-notice" role="status">{mensaje}</p>}
    {fase === "no_disponible" && <p className="historical-notice weekly-notice" role="status">{mensaje}</p>}
    {fase === "error" && <p className="historical-notice missing-notice" role="alert">{mensaje}</p>}
    {datos && fase === "ok" && <>
      {mensaje && <p className="historical-notice missing-notice" role="alert">{mensaje}</p>}
      {datos.aviso_general && <p className="historical-notice missing-notice" role="status">{datos.aviso_general}</p>}
      {clasesVisibles.length === 0 ? <p className="historical-notice weekly-notice" role="status">No hay clases hoy en la ventana visible (desde una hora antes).</p> : <>
        <TablaCifras clases={clasesVisibles} ahora={ahora} />
        <div className="tiempo-filtros" role="group" aria-label="Filtros de la lista">
          <label>Clase <select className="control" value={clase} onChange={(e) => setClase(e.target.value)}>
            <option value="">Todas</option>{clasesVisibles.map((c) => <option key={c.slot_id} value={c.slot_id}>{etiquetaClase(c, ahora)}</option>)}</select></label>
          <label>Señal <select className="control" value={senal} onChange={(e) => setSenal(e.target.value as "" | SenalVivo)}>
            <option value="">Todas</option>{SENALES_FILTRO.map((s) => <option key={s} value={s}>{ETIQUETA[s]}</option>)}</select></label>
          <label>Buscar <input className="control" type="search" value={texto} placeholder="Nombre, cédula, correo o ciudad" onChange={(e) => setTexto(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={soloSala} onChange={(e) => setSoloSala(e.target.checked)} /> Solo ahora en sala</label>
        </div>
        <p className="nota">{filas.length} {filas.length === 1 ? "persona" : "personas"} con estos filtros. «En sala» es aproximado: el webhook de Zoom a veces pierde entradas o salidas.</p>
        <div className="class-table-wrap" role="region" aria-label="Personas" tabIndex={0}>
          <table className="class-table visitas-tabla lista-vivo-tabla"><caption>Personas en las clases de hoy</caption>
            <thead><tr><th>Nombre</th><th>Señal</th><th>Clase</th><th>Su clase</th><th>Cédula</th><th>Ciudad</th><th>Correo</th>
              <th>Entró</th><th>En sala / salió</th><th>Cómo se identificó</th></tr></thead>
            <tbody>{filas.map(({ c, p }, i) => <tr key={`${c.slot_id}|${p.cedula ?? p.correo ?? p.nombre}|${i}`} className={`fila-senal-${p.senal}${estaCerrada(c, ahora) ? " fila-cerrada" : ""}`}>
              <th scope="row">{p.nombre ?? "—"}</th><td><Chip senal={p.senal} /></td><td>{etiquetaClase(c, ahora)}</td>
              <td>{p.senal === "roster" || p.senal === "ausente" ? "Esta" : p.su_clase ?? "—"}</td><td>{p.cedula ?? "—"}</td><td>{p.ciudad ?? "—"}</td><td>{p.correo ?? "—"}</td>
              <td>{hora(p.primera_entrada)}{p.entradas > 1 ? <small> ({p.entradas} entradas)</small> : null}</td>
              <td><EstadoSala p={p} /></td><td>{p.como}</td>
            </tr>)}</tbody>
          </table></div>
      </>}
    </>}
  </section>;
}
