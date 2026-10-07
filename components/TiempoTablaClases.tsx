import type { ReactNode } from "react";
import type { ConfianzaClase } from "../lib/confianzaClase.d.mts";
import type { AgregadoTiempo, ClaseTiempo, DiaTiempo } from "../lib/tiempoContrato.d.mts";
import { ICONOS, porcentajeCumple, porcentajeRojo, porcentajeUnDecimal } from "../lib/tiempoVista.mjs";
import ChipConfianza from "./ChipConfianza";

const pct = porcentajeUnDecimal;
const cob = (a: AgregadoTiempo) => (a.cobertura == null ? "—" : `${porcentajeUnDecimal(a.cobertura * 100)}${a.nivel_cobertura === "baja" ? " ⚠" : ""}`);

function Fila({ titulo, a, extra, chip, fuerte }: { titulo: string; a: AgregadoTiempo; extra?: string; chip?: ReactNode; fuerte?: boolean }) {
  const sinMedicion = a.sin_medicion;
  const etiqueta = a.sin_ingresos ? "Sin ingresos" : sinMedicion ? "Sin medición de tiempo" : a.muestra_pequena ? "muestra pequeña (n<5)" : "";
  const aria = `${titulo}: ${a.n_cumplen} cumplen (50 % o más), ${a.n_rojo} rojo por tiempo (menos del 50 %), ${a.n_sin_dato} sin dato de tiempo, ` +
    `${a.n_ingresaron} ingresaron, ${a.n_medibles} con tiempo medido`;
  return <tr className={fuerte ? "fila-total" : undefined} aria-label={aria}>
    <th scope="row">{titulo}{extra && <small> {extra}</small>}{chip && <div>{chip}</div>}</th>
    <td>{a.roster ?? "—"}</td><td>{a.n_ingresaron}</td>
    <td>{a.n_ingresaron === 0 ? "—" : a.n_medibles}</td>
    <td>{sinMedicion || a.n_ingresaron === 0 ? "—" : `${a.n_cumplen} (${pct(porcentajeCumple(a))})`}</td>
    <td>{sinMedicion || a.n_ingresaron === 0 ? "—" : `${a.n_rojo} (${pct(porcentajeRojo(a))})`}</td>
    <td>{a.n_ingresaron === 0 ? "—" : a.n_sin_dato}</td>
    <td>{a.mediana == null ? "—" : pct(a.mediana)}</td>
    <td>{cob(a)}{etiqueta && <small className="t-estado"> {sinMedicion ? ICONOS.sin_dato_tiempo : ""} {etiqueta}</small>}</td>
  </tr>;
}

function Tabla({ titulo, filas }: { titulo: string; filas: { clave: string; titulo: string; a: AgregadoTiempo; extra?: string; chip?: ReactNode; fuerte?: boolean }[] }) {
  return <div className="class-table-wrap" role="region" aria-label={titulo} tabIndex={0}>
    <table className="class-table tiempo-tabla"><caption>{titulo}</caption>
      <thead><tr><th>Grupo</th><th>Roster</th><th>Ingresaron</th><th>Medidos</th>
        <th>{ICONOS.cumple} Cumplen</th><th>{ICONOS.rojo_tiempo} Rojo</th><th>{ICONOS.sin_dato_tiempo} Sin dato</th><th>Mediana %</th><th>Cobertura</th></tr></thead>
      <tbody>{filas.map((f) => <Fila key={f.clave} titulo={f.titulo} a={f.a} extra={f.extra} chip={f.chip} fuerte={f.fuerte} />)}</tbody>
    </table></div>;
}

export default function TiempoTablaClases({ clases, dias, semana, confianza }: { clases: ClaseTiempo[]; dias: DiaTiempo[]; semana: AgregadoTiempo;
  confianza?: Map<string, ConfianzaClase> }) {
  return <>
    <Tabla titulo="Por clase" filas={clases.map((c) => ({ clave: c.slot_id, titulo: c.horario_texto, extra: c.fin_confiable ? undefined : "· cierre dudoso", chip: <ChipConfianza c={confianza?.get(c.slot_id)} />, a: c }))} />
    <Tabla titulo="Por día (suma de las clases)" filas={dias.map((d) => ({ clave: d.fecha, titulo: d.fecha, a: d }))} />
    <Tabla titulo="Semana (suma de las clases)" filas={[{ clave: "semana", titulo: "Semana", a: semana, fuerte: true }]} />
  </>;
}
