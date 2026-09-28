"use client";
import { useMemo, useState } from "react";
import { crearCorteVisual } from "../lib/agregados";
import type { DemoData, ParticipanteVisual } from "../lib/types";

const nombreDia = (fecha: string) => new Intl.DateTimeFormat("es-CO", {
  weekday: "long", timeZone: "UTC",
}).format(new Date(`${fecha}T12:00:00Z`));
const icono = { propia: "✓", otra: "↗", sin_ingreso: "·" } as const;

export default function ResumenSemanaVisual({ data, demo }: { data: DemoData; demo: boolean }) {
  const [franja, setFranja] = useState("");
  const [fecha, setFecha] = useState("");
  const slots = data.franjas_con_clase;
  const corte = useMemo(() => crearCorteVisual(data.participantes, slots, { fecha, franja }),
    [data.participantes, slots, fecha, franja]);
  const cortesDia = useMemo(() => data.dias_visibles
    .filter((d) => !franja || slots.some((slot) => slot.slot_id === franja && slot.fecha === d.fecha))
    .map((d) => ({ fecha: d.fecha,
      corte: crearCorteVisual(data.participantes, slots, { fecha: d.fecha, franja }),
    })), [data.participantes, data.dias_visibles, slots, franja]);
  const etiquetas = useMemo(() => new Map(data.participantes.map((p, index) => [p.key,
    demo ? `Participante ${String(index + 1).padStart(3, "0")}` : p.nombre ?? "Participante",
  ])), [data.participantes, demo]);
  const ficha = (p: ParticipanteVisual) => <article key={p.key}
    className={`participant-tile ${p.estado_visual}`} title={p.estado_visual.replace("_", " ")}>
    <span aria-hidden="true" className="participant-icon">{icono[p.estado_visual]}</span>
    <span className="participant-name">{etiquetas.get(p.key)}</span>
    {p.por_revisar && <span className="review-mark">Por revisar</span>}
    <span className="sr-only">{p.estado_visual === "propia" ? "Entró a su clase" :
      p.estado_visual === "otra" ? "Entró a otra sala" : "Sin ingreso"}</span>
  </article>;
  const tituloCorte = franja || (fecha ? `${nombreDia(fecha)} · ${fecha}` : "Toda la semana");
  const resumen = (titulo: string, actual: typeof corte, principal = false) =>
    <article className={principal ? "week-day-card current-cut" : "week-day-card"}>
      <h3>{titulo}</h3><p>No ingresaron <b>{actual.noIngresaron}</b></p>
      <p>Rescataron <b>{actual.rescataron}</b> <small>(entraron a otra clase)</small></p>
      <p>Sin ingresar hasta hoy <b>{actual.sinIngresarHastaHoy}</b></p>
    </article>;
  return <>
    <section className="panel week-visual" aria-label="Resumen visual de la semana">
      <div className="week-visual-heading">
        <div><h2>La semana, de un vistazo</h2><p className="nota">Una ficha por persona. Solo aparecen clases que ya tuvieron actividad.</p></div>
        <div className="week-filters">
          <label>Día <select className="control" value={fecha} onChange={(e) => {
            const next = e.target.value; setFecha(next);
            if (franja && next && !slots.some((s) => s.slot_id === franja && s.fecha === next)) setFranja("");
          }}><option value="">Toda la semana</option>{data.dias_visibles.map((d) => <option key={d.fecha} value={d.fecha}>{nombreDia(d.fecha)} · {d.fecha}</option>)}</select></label>
          <label>Franja <select className="control" value={franja} onChange={(e) => {
            const next = e.target.value; setFranja(next);
            if (next) setFecha(slots.find((s) => s.slot_id === next)?.fecha ?? "");
          }}><option value="">Todas las franjas</option>{slots.filter((s) => !fecha || s.fecha === fecha).map((s) => <option key={s.slot_id} value={s.slot_id}>{s.slot_id}</option>)}</select></label>
        </div>
      </div>
      <div className="week-day-cards">
        {resumen(tituloCorte, corte, true)}
        {!fecha && !franja && cortesDia.map(({ fecha: fechaDia, corte: corteDia }) =>
          <div key={fechaDia}>{resumen(`${nombreDia(fechaDia)} · ${fechaDia}`, corteDia)}</div>)}
      </div>
      <div className="week-legend" aria-label="Leyenda de estados">
        <span><i className="week-swatch propia" /> ✓ Propia</span>
        <span><i className="week-swatch otra" /> ↗ Otra sala</span>
        <span><i className="week-swatch sin_ingreso" /> · Sin ingreso</span>
      </div>
      {corte.grupos.length === 0 ? <p className="nota">No hay roster con clase ocurrida en este corte.</p> :
        <div className="participant-groups">{corte.grupos.map((grupo) => <section className="participant-group" key={grupo.slot_id}>
          <h3>{grupo.slot_id} <small>{grupo.participantes.length}</small></h3>
          <div className="participant-grid">{grupo.participantes.map(ficha)}</div>
        </section>)}</div>}
    </section>
    <section className="panel missing-panel"><h2>Faltaron <small>{corte.sinIngresarHastaHoy}</small></h2>
      {corte.grupos_faltantes.length === 0 ? <p className="nota">Nadie quedó sin ingresar en este corte.</p> :
        corte.grupos_faltantes.map((grupo) => <section className="missing-group" key={grupo.slot_id}>
          <h3>{grupo.slot_id} <small>{grupo.participantes.length}</small></h3>
          <div className="participant-grid">{grupo.participantes.map(ficha)}</div>
        </section>)}
    </section>
  </>;
}
