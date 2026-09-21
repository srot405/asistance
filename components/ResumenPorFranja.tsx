import type { DemoData } from "../lib/types";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function nombreDia(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}

export default function ResumenPorFranja({ data }: { data: DemoData }) {
  const filas = data.por_franja.map((f) => ({
    ...f, slot: f.slot_id, etiqueta: f.slot_id.replace(/^backend-/, "").replace(/-/g, " "),
  }));
  const porDia = new Map<string, typeof filas>();
  for (const fila of filas) porDia.set(fila.fecha, [...(porDia.get(fila.fecha) ?? []), fila]);
  const total = filas.reduce((acc, f) => ({ roster: acc.roster + f.roster, entro: acc.entro + f.entro, aOtra: acc.aOtra + f.aOtra, colados: acc.colados + f.colados, falto: acc.falto + f.falto }), { roster: 0, entro: 0, aOtra: 0, colados: 0, falto: 0 });
  const pct = (n: number, de: number) => de ? Math.round((n / de) * 100) : 0;
  return <section className="panel">
    <h2>Asistencia por horario</h2>
    <div className="cards">
      <div className="card"><span>Entraron a su clase</span><b>{total.entro} <small>de {total.roster}</small></b><span>{pct(total.entro, total.roster)}%</span></div>
      <div className="card"><span>Se recuperaron en otro horario</span><b>{total.aOtra}</b></div>
      <div className="card"><span>Entraron sin ser de esa clase</span><b>{total.colados}</b></div>
      <div className="card"><span>No aparecieron en la semana</span><b>{total.falto}</b></div>
    </div>
    {[...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, clases]) => <div key={fecha} className="dia-bloque">
      <h3>{nombreDia(fecha)} <small>{fecha}</small></h3>
      <table className="tabla-franjas"><thead><tr><th>Clase</th><th>Roster</th><th>Entró</th><th>A otra</th><th>Colados</th><th>Faltó</th><th>%</th></tr></thead>
        <tbody>{clases.map((c) => <tr key={c.slot}><td>{c.etiqueta}</td><td>{c.roster}</td><td className="cell V">{c.entro}</td><td className="cell A">{c.aOtra}</td><td className="cell N">{c.colados}</td><td className="cell NO">{c.falto}</td><td><span className="barra"><i style={{ width: `${pct(c.entro, c.roster)}%` }} /></span>{pct(c.entro, c.roster)}%</td></tr>)}</tbody>
      </table>
    </div>)}
    <p className="nota"><b>Entró</b>: vino a su propia clase. <b>A otra</b>: era de ese horario, faltó, pero apareció en otro. <b>Colados</b>: entraron a esa clase sin ser de ese horario. <b>Faltó</b>: no apareció en ningún momento de la semana.</p>
  </section>;
}
