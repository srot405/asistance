"use client";
import { useMemo } from "react";
import type { DemoData } from "../lib/types";

// Pedido de Samuel (2026-09-21): "es vital saber por horarios la gente que entra
// que sí era de esos horarios y de la gente que se cuela a otros horarios".
// El dato ya se capturaba; lo que faltaba era mostrarlo.
//
// Para cada clase, sobre SU roster y SU día:
//   entró    celda `V` — vino a su propia franja
//   a otra   celda `A` — era de ese horario, faltó, pero apareció en otro
//   colados  `personas_visita` de la sesión — entraron sin ser de ese horario
//   faltó    celda semanal `NO` — no apareció en ningún momento de la semana
const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function nombreDia(fecha: string) {
  // `fecha` es YYYY-MM-DD: se parte a mano para no depender de la zona horaria
  // del navegador, que con `new Date("2026-09-19")` puede devolver el día previo.
  const [a, m, d] = fecha.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[fin.getUTCDay()]} ${d}`;
}

export default function ResumenPorFranja({ data }: { data: DemoData }) {
  const filas = useMemo(() => {
    const franjaDe = new Map(data.roster.map((p) => [p.persona_id, p.franja]));
    const fechaDe = new Map(data.franjas.map((f) => [f.slot_id, f.fecha]));
    const porFranja = new Map<string, { V: number; A: number }>();
    for (const celda of data.celdas_dia) {
      const slot = franjaDe.get(celda.persona_id);
      // Solo cuentan las celdas del día de SU clase: las de otros días
      // describen visitas, no su asistencia.
      if (!slot || fechaDe.get(slot) !== celda.fecha) continue;
      const acc = porFranja.get(slot) ?? { V: 0, A: 0 };
      if (celda.estado === "V") acc.V += 1;
      if (celda.estado === "A") acc.A += 1;
      porFranja.set(slot, acc);
    }
    const faltó = new Map<string, number>();
    const semanal = new Map(
      data.celdas_semana.map((c) => [c.persona_id, c.estado]),
    );
    for (const [persona, slot] of franjaDe) {
      const estado = semanal.get(persona);
      if (estado === "NO" || estado === "NO?")
        faltó.set(slot, (faltó.get(slot) ?? 0) + 1);
    }
    return data.franjas.map((f) => {
      const acc = porFranja.get(f.slot_id) ?? { V: 0, A: 0 };
      return {
        slot: f.slot_id,
        fecha: f.fecha,
        etiqueta: f.slot_id.replace(/^backend-/, "").replace(/-/g, " "),
        roster: f.roster_n ?? 0,
        entro: acc.V,
        aOtra: acc.A,
        colados: f.personas_visita ?? 0,
        falto: faltó.get(f.slot_id) ?? 0,
      };
    });
  }, [data]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, typeof filas>();
    for (const fila of filas) {
      const lista = mapa.get(fila.fecha) ?? [];
      lista.push(fila);
      mapa.set(fila.fecha, lista);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filas]);

  const total = filas.reduce(
    (acc, f) => ({
      roster: acc.roster + f.roster,
      entro: acc.entro + f.entro,
      aOtra: acc.aOtra + f.aOtra,
      colados: acc.colados + f.colados,
      falto: acc.falto + f.falto,
    }),
    { roster: 0, entro: 0, aOtra: 0, colados: 0, falto: 0 },
  );
  const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);

  return (
    <section className="panel">
      <h2>Asistencia por horario</h2>
      <div className="cards">
        <div className="card">
          <span>Entraron a su clase</span>
          <b>
            {total.entro} <small>de {total.roster}</small>
          </b>
          <span>{pct(total.entro, total.roster)}%</span>
        </div>
        <div className="card">
          <span>Se recuperaron en otro horario</span>
          <b>{total.aOtra}</b>
        </div>
        <div className="card">
          <span>Entraron sin ser de esa clase</span>
          <b>{total.colados}</b>
        </div>
        <div className="card">
          <span>No aparecieron en la semana</span>
          <b>{total.falto}</b>
        </div>
      </div>
      {porDia.map(([fecha, clases]) => (
        <div key={fecha} className="dia-bloque">
          <h3>
            {nombreDia(fecha)} <small>{fecha}</small>
          </h3>
          <table className="tabla-franjas">
            <thead>
              <tr>
                <th>Clase</th>
                <th>Roster</th>
                <th>Entró</th>
                <th>A otra</th>
                <th>Colados</th>
                <th>Faltó</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {clases.map((c) => (
                <tr key={c.slot}>
                  <td>{c.etiqueta}</td>
                  <td>{c.roster}</td>
                  <td className="cell V">{c.entro}</td>
                  <td className="cell A">{c.aOtra}</td>
                  <td className="cell N">{c.colados}</td>
                  <td className="cell NO">{c.falto}</td>
                  <td>
                    <span className="barra">
                      <i style={{ width: `${pct(c.entro, c.roster)}%` }} />
                    </span>
                    {pct(c.entro, c.roster)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="nota">
        <b>Entró</b>: vino a su propia clase. <b>A otra</b>: era de ese horario,
        faltó, pero apareció en otro. <b>Colados</b>: entraron a esa clase sin
        ser de ese horario. <b>Faltó</b>: no apareció en ningún momento de la
        semana.
      </p>
    </section>
  );
}
