import type { CorteResumen, DemoData } from "../lib/types";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const SIN_DATO = new Set(["zoom_limit_pendiente", "sin_captura", "dudosa"]);
function nombreDia(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}
function porcentaje(n: number, de: number) { return de ? Math.round((n / de) * 100) : 0; }

function TablaCorte({ filas, titulo, nota }: { filas: CorteResumen[]; titulo: string; nota?: string }) {
  return <section className="panel">
    <h3>{titulo}</h3>
    {nota && <p className="nota">{nota}</p>}
    <div className="table-scroll"><table><thead><tr><th>Corte</th><th>Roster</th><th>Medible</th><th>Fuera de dato (ZL)</th><th>Propia</th><th>A otra</th><th>Colados</th><th>Faltó</th><th>Asistencia</th></tr></thead>
      <tbody>{filas.map((f) => <tr key={f.etiqueta}><td>{f.etiqueta}</td><td>{f.roster}</td><td>{f.medible}</td><td>{f.fueraDato}</td><td>{f.entro} ({porcentaje(f.entro, f.medible)}%)</td><td>{f.aOtra} ({porcentaje(f.aOtra, f.medible)}%)</td><td>{f.colados} ({porcentaje(f.colados, f.medible)}%)</td><td>{f.falto} ({porcentaje(f.falto, f.medible)}%)</td><td><b>{f.si}/{f.medible} ({f.asistenciaPct}%)</b></td></tr>)}</tbody>
    </table></div>
  </section>;
}

export default function ResumenPorFranja({ data, weeks = [] }: { data: DemoData; weeks?: DemoData[] }) {
  const filas = data.por_franja.map((f) => ({ ...f, slot: f.slot_id, etiqueta: f.slot_id.replace(/^backend-/, "").replace(/-/g, " ") }));
  const porDia = new Map<string, typeof filas>();
  for (const fila of filas) porDia.set(fila.fecha, [...(porDia.get(fila.fecha) ?? []), fila]);
  const total = data.resumen;
  const diarios: CorteResumen[] = data.por_dia.map((d) => ({ etiqueta: nombreDia(d.fecha), roster: d.roster, medible: d.medible, fueraDato: d.fueraDato, entro: d.entro, aOtra: d.aOtra, colados: d.colados, falto: d.falto, si: d.entro + d.aOtra, asistenciaPct: porcentaje(d.entro + d.aOtra, d.medible) }));
  const evolucion = weeks.map((w) => w.resumen);
  const semanales = evolucion.length ? evolucion : [total];
  return <>
    <section className="panel">
      <h2>Asistencia por horario · semana {data.semana}</h2>
      <p className="nota">Los porcentajes usan como denominador la población medible. Las personas fuera de dato por ZL nunca cuentan como ausencia.</p>
      <div className="cards">
        <div className="card"><span>Entraron a su clase</span><b>{total.entro}</b><span>{porcentaje(total.entro, total.medible)}% de {total.medible} medibles</span></div>
        <div className="card"><span>Se recuperaron en otro horario</span><b>{total.aOtra}</b><span>{porcentaje(total.aOtra, total.medible)}%</span></div>
        <div className="card"><span>Entraron sin ser de esa clase</span><b>{total.colados}</b><span>{porcentaje(total.colados, total.medible)}%</span></div>
        <div className="card"><span>No aparecieron</span><b>{total.falto}</b><span>{porcentaje(total.falto, total.medible)}%</span></div>
      </div>
      <div className="status"><b>Asistencia total: {total.si}/{total.medible} ({total.asistenciaPct}%)</b> · fuera de dato por ZL: {total.fueraDato} de {total.roster} · sesiones sin dato: {data.franjas.filter((s) => SIN_DATO.has(s.estado_captura)).length}</div>
    </section>
    <TablaCorte titulo="Roster semanal" filas={semanales} nota="Propia + a otra = SI. Colados son visitas ajenas y no se suman al roster ni a la asistencia." />
    <TablaCorte titulo="Roster diario" filas={diarios} />
    <section className="panel">
      <h3>Evolución entre semanas</h3>
      <p className="nota">Asistencia = SI / población medible. El denominador visible evita confundir cobertura de captura con mejora real.</p>
      {evolucion.map((w) => <div className="series-row" key={w.etiqueta}>
        <span>{w.etiqueta}</span><div className="series-track"><i style={{ width: `${w.asistenciaPct}%` }} /></div><b>{w.asistenciaPct}% · {w.si}/{w.medible} · ZL {w.fueraDato}</b>
      </div>)}
    </section>
    <TablaCorte titulo="Corte por ciudad" filas={data.por_ciudad} nota="Colados se atribuyen a la ciudad de origen de la persona visitante; no son roster adicional de la ciudad." />
    <TablaCorte titulo="Corte por cuenta Zoom" filas={data.por_cuenta} />
    <section className="panel">
      <h3>Detalle agregado por horario</h3>
      {[...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, clases]) => <div key={fecha} className="dia-bloque">
        <h3>{nombreDia(fecha)} <small>{fecha}</small></h3>
        <table className="tabla-franjas"><thead><tr><th>Clase</th><th>Roster</th><th>Medible</th><th>Entró</th><th>A otra</th><th>Colados</th><th>Faltó</th><th>% SI</th></tr></thead>
          <tbody>{clases.map((c) => <tr key={c.slot}><td>{c.etiqueta}</td><td>{c.roster}</td><td>{c.medible}</td><td className="cell V">{c.entro}</td><td className="cell A">{c.aOtra}</td><td className="cell N">{c.colados}</td><td className="cell NO">{c.falto}</td><td>{porcentaje(c.entro + c.aOtra, c.medible)}%</td></tr>)}</tbody>
        </table>
      </div>)}
    </section>
  </>;
}
