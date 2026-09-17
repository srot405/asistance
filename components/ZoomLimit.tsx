import type { DemoData } from "../lib/types";
import { sessionsWithoutData } from "../lib/conteos";
export default function ZoomLimit({
  data,
  weeks,
}: {
  data: DemoData;
  weeks: DemoData[];
}) {
  const pending = sessionsWithoutData(data.franjas);
  return (
    <>
      <section className="panel">
        <h2>Sesiones sin dato</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Franja</th>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Afectados</th>
                <th>Estado</th>
                <th>Plazo</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((slot) => (
                <tr key={slot.slot_id}>
                  <td>{slot.fecha}</td>
                  <td>{slot.slot_id}</td>
                  <td>{slot.cuenta_zoom}</td>
                  <td>
                    {slot.cuenta_zoom === "soporte"
                      ? "Soporte"
                      : slot.estado_captura === "dudosa"
                        ? "dudosa"
                        : "n8n caído"}
                  </td>
                  <td>{slot.personas_afectadas}</td>
                  <td>{slot.estado_captura}</td>
                  <td>Lunes 23:59</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Historial por semana</h2>
        {weeks.map((week) => (
          <div className="status" key={week.semana}>
            {week.semana} · {sessionsWithoutData(week.franjas).length} sesiones
            sin dato
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>No identificados por motivo</h2>
        {data.no_identificados.map((row) => (
          <div key={row.motivo}>
            {row.motivo}: {row.cantidad}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Cómo llenar</h2>
        <p>Importa el CSV de Soporte y reconcilia la sesión con:</p>
        <code>
          python etl/importar_csv_zoom.py --semana AAAA-MM-DD --aplicar
        </code>
        <br />
        <code>
          python etl/reconciliar_participantes_zoom.py --semana AAAA-MM-DD
          --aplicar
        </code>
      </section>
    </>
  );
}
