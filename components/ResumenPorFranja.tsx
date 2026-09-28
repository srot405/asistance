import type { CorteResumen, DemoData, FranjaResumen } from "../lib/types";
import type { Filters } from "./Filtros";
import { yaOcurrio } from "../lib/conteos";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const SIN_DATO = new Set(["zoom_limit_pendiente", "sin_captura", "dudosa"]);
function nombreDia(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}
function porcentaje(n: number, de: number) { return de ? Math.round((n / de) * 100) : 0; }
// Con 0 medibles no hay 0% de asistencia: no hay porcentaje. Mostrar "0%" invita
// a leer un dato donde no lo hay.
function pctTexto(n: number, de: number) { return de ? `${Math.round((n / de) * 100)}%` : "—"; }


function TablaCorte({ filas, titulo, nota }: { filas: CorteResumen[]; titulo: string; nota?: string }) {
  return <section className="panel">
    <h3>{titulo}</h3>
    {nota && <p className="nota">{nota}</p>}
    <div className="table-scroll"><table><thead><tr><th>Corte</th><th>Roster</th><th>Medible</th><th>Fuera de dato (ZL)</th><th>Aún no ocurre</th><th>Propia</th><th>A otra</th><th>Faltó</th><th>Asistencia</th></tr></thead>
      <tbody>{filas.map((f) => <tr key={f.etiqueta}><td>{f.etiqueta}</td><td>{f.roster}</td><td>{f.medible}</td><td>{f.fueraDato}</td><td>{f.pendiente}</td><td>{f.entro} ({pctTexto(f.entro, f.medible)})</td><td>{f.aOtra} ({pctTexto(f.aOtra, f.medible)})</td><td>{f.falto} ({pctTexto(f.falto, f.medible)})</td><td><b>{f.si}/{f.medible} ({pctTexto(f.si, f.medible)})</b></td></tr>)}</tbody>
    </table></div>
  </section>;
}

// Cada persona pertenece a UNA franja, asi que sumar las franjas no cuenta a nadie
// dos veces y el total filtrado cuadra con el de la semana cuando no hay filtro.
function sumar(filas: FranjaResumen[], etiqueta: string): CorteResumen {
  const t = (k: keyof FranjaResumen) => filas.reduce((a, f) => a + (f[k] as number), 0);
  const si = t("entro") + t("aOtra");
  const medible = t("medible");
  return { etiqueta, roster: t("roster"), medible, fueraDato: t("fueraDato"), pendiente: t("pendiente"),
           entro: t("entro"), aOtra: t("aOtra"), falto: t("falto"), si,
           asistenciaPct: porcentaje(si, medible) };
}

export default function ResumenPorFranja({ data, weeks = [], filters }: { data: DemoData; weeks?: DemoData[]; filters?: Filters }) {
  // La cuenta Zoom vive en `franjas`, no en `por_franja`: se une por slot_id.
  const cuentaDe = new Map(data.franjas.map((f) => [f.slot_id, f.cuenta_zoom]));
  const activos = [filters?.franja && `franja ${filters.franja}`, filters?.cuenta && `cuenta ${filters.cuenta}`,
                   filters?.ciudad && `ciudad ${filters.ciudad}`].filter(Boolean) as string[];
  const filas = data.por_franja
    .filter((f) => !filters?.franja || f.slot_id === filters.franja)
    .filter((f) => !filters?.cuenta || cuentaDe.get(f.slot_id) === filters.cuenta)
    .map((f) => ({ ...f, slot: f.slot_id, etiqueta: f.slot_id.replace(/^(backend|js)-/, "").replace(/-/g, " ") }));
  const porDia = new Map<string, typeof filas>();
  for (const fila of filas) porDia.set(fila.fecha, [...(porDia.get(fila.fecha) ?? []), fila]);
  // El total y el diario se recalculan desde las franjas visibles, para que al
  // filtrar no quede un encabezado con las cifras de toda la semana.
  const hayFiltro = Boolean(filters?.franja || filters?.cuenta);
  const total = hayFiltro ? sumar(filas, "Total filtrado") : data.resumen;
  const diarios: CorteResumen[] = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, clases]) => sumar(clases, nombreDia(fecha)));
  // En los modulos JS la Programacion cubria 680 de las 726 personas del canon.
  // Las otras 46 no tenian clase asignada, asi que no entran en el roster ni en
  // la ausencia; se nombran para que nadie las busque en las tablas.
  const avisoSinHorario = data.sinHorario > 0
    ? `${data.sinHorario} personas del canon no tienen horario asignado esta semana: quedan fuera del roster y no cuentan como ausencia.`
    : undefined;
  // Una sola fila: la semana elegida en el selector. La comparación entre semanas
  // vive abajo, en "Evolución"; tenerla también aquí duplicaba la misma tabla e
  // ignoraba el filtro activo.
  const semanales = [{ ...total, etiqueta: `Semana ${data.semana}` }];
  return <>
    <section className="panel">
      <h2>Asistencia por horario · semana {data.semana}{data.materia ? ` · ${data.materia}` : ""}</h2>
      {activos.length > 0 && <p className="nota"><b>Filtrado por {activos.join(" y ")}.</b> Las cifras de abajo son solo de lo filtrado, no de la semana completa.</p>}
      {avisoSinHorario && <p className="nota">{avisoSinHorario}</p>}
      <p className="nota">Los porcentajes usan como denominador la población medible. Las personas fuera de dato por ZL nunca cuentan como ausencia.</p>
      {!yaOcurrio(data) && <div className="status"><b>Esta semana todavía no ha empezado.</b> Las {data.franjas.length} clases están programadas y el roster ({total.roster} personas) ya está congelado; las cifras se llenan a medida que ocurren.</div>}
      {yaOcurrio(data) && <div className="cards">
        <div className="card"><span>Entraron a su clase</span><b>{total.entro}</b><span>{porcentaje(total.entro, total.medible)}% de {total.medible} medibles</span></div>
        <div className="card"><span>Se recuperaron en otro horario</span><b>{total.aOtra}</b><span>{porcentaje(total.aOtra, total.medible)}%</span></div>
        <div className="card"><span>No aparecieron</span><b>{total.falto}</b><span>{porcentaje(total.falto, total.medible)}%</span></div>
      </div>}
      {yaOcurrio(data) && <div className="status"><b>Asistencia total: {total.si}/{total.medible} ({total.asistenciaPct}%)</b> · fuera de dato por ZL: {total.fueraDato} de {total.roster} · sesiones sin dato: {data.franjas.filter((s) => SIN_DATO.has(s.estado_captura)).length}</div>}
    </section>
    <TablaCorte titulo="Roster semanal" filas={semanales} nota="Propia + a otra = SI." />
    <TablaCorte titulo="Roster diario" filas={diarios} nota={avisoSinHorario} />
    <section className="panel">
      <h3>Evolución entre semanas</h3>
      <p className="nota">Asistencia = SI / población medible. El denominador visible evita confundir cobertura de captura con mejora real.</p>
      {weeks.filter(yaOcurrio).map((w) => <div className="series-row" key={w.semana}>
        <span>{w.semana}<small> · {w.materia || "?"}</small></span><div className="series-track"><i style={{ width: `${w.resumen.asistenciaPct}%` }} /></div><b>{w.resumen.asistenciaPct}% · {w.resumen.si}/{w.resumen.medible} · ZL {w.resumen.fueraDato}</b>
      </div>)}
      {weeks.some((w) => !yaOcurrio(w)) && <p className="nota">Fuera del gráfico: {weeks.filter((w) => !yaOcurrio(w)).map((w) => w.semana).join(", ")} — sus clases todavía no han ocurrido.</p>}
    </section>
    <TablaCorte titulo="Corte por ciudad" filas={data.por_ciudad.filter((c) => !filters?.ciudad || c.etiqueta === filters.ciudad)} />
    <TablaCorte titulo="Corte por cuenta Zoom" filas={data.por_cuenta.filter((c) => !filters?.cuenta || c.etiqueta === filters.cuenta)} />
    <section className="panel">
      <h3>Detalle agregado por horario</h3>
      {avisoSinHorario && <p className="nota">{avisoSinHorario}</p>}
      {[...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, clases]) => <div key={fecha} className="dia-bloque">
        <h3>{nombreDia(fecha)} <small>{fecha}</small></h3>
        <table className="tabla-franjas"><thead><tr><th>Clase</th><th>Roster</th><th>Medible</th><th>Entró</th><th>A otra</th><th>Faltó</th><th>% SI</th></tr></thead>
          <tbody>{clases.map((c) => <tr key={c.slot}><td>{c.etiqueta}</td><td>{c.roster}</td><td>{c.medible}</td><td className="cell V">{c.entro}</td><td className="cell A">{c.aOtra}</td><td className="cell NO">{c.falto}</td><td>{pctTexto(c.entro + c.aOtra, c.medible)}</td></tr>)}</tbody>
        </table>
      </div>)}
    </section>
  </>;
}
