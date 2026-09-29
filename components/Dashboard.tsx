"use client";
import { useEffect, useMemo, useState } from "react";
import type { HistoricoData } from "../lib/types";
import CalendarioSemana from "./CalendarioSemana";
import Encabezado from "./Encabezado";
import ResumenSemanaVisual from "./ResumenSemanaVisual";
import TendenciaHistorica from "./TendenciaHistorica";
import { authConfigurada, clienteAuth, iniciarSesionGoogle, sesionActual } from "../lib/auth";
import { descargarCsv } from "../lib/descargas";

const clave = (semana: string, materia: string) => `${semana}|${materia}`;
const PESTANAS = ["Semana", "Historial"] as const;
type Pestana = (typeof PESTANAS)[number];

export default function Dashboard() {
  const [dark, setDark] = useState(false);
  const [data, setData] = useState<HistoricoData | null>(null);
  const [seleccion, setSeleccion] = useState("");
  const [modo, setModo] = useState<"cargando" | "demo" | "real" | "login" | "error">("cargando");
  const [fallo, setFallo] = useState("");
  const [falloExport, setFalloExport] = useState("");
  const [pestana, setPestana] = useState<Pestana>("Semana");

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        let response = await fetch("/api/datos?demo=1", { cache: "no-store" });
        let siguienteModo: "demo" | "real" = "demo";
        if (!response.ok) {
          const sesion = await sesionActual();
          if (!sesion?.access_token) {
            if (!cancelado) setModo("login");
            return;
          }
          response = await fetch("/api/datos", { cache: "no-store",
            headers: { Authorization: `Bearer ${sesion.access_token}` } });
          siguienteModo = "real";
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const recibido = await response.json() as HistoricoData;
        if (!Array.isArray(recibido.resultados)) throw new Error("respuesta inesperada");
        if (!cancelado) {
          setData(recibido);
          const ultima = recibido.resultados.at(-1);
          setSeleccion(ultima ? clave(ultima.semana, ultima.materia) : "");
          setModo(siguienteModo);
        }
      } catch (error) {
        if (!cancelado) {
          setFallo(error instanceof Error ? error.message : String(error));
          setModo("error");
        }
      }
    }
    cargar();
    const { data: auth } = clienteAuth().auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED") cargar();
    });
    return () => { cancelado = true; auth.subscription.unsubscribe(); };
  }, []);

  const actual = useMemo(() => data?.resultados.find((fila) =>
    clave(fila.semana, fila.materia) === seleccion) ?? null, [data, seleccion]);

  async function exportar() {
    if (!actual) return;
    setFalloExport("");
    const query = new URLSearchParams({ semana: actual.semana, materia: actual.materia, vista: "Resumen" });
    const url = new URL(`/api/exportar?${query}`, window.location.origin);
    const error = await descargarCsv(url, modo === "demo" ? "demo" : "real", `asistencia_${actual.semana}_resumen.csv`);
    if (error) setFalloExport(error);
  }

  if (modo === "login") return <main className="main"><div className="empty">
    <h2>Panel de ingresos · Jóvenes creaTIvos</h2><p>Entra con tu cuenta <b>@tocaunavida.org</b>.</p>
    <button className="tab active" onClick={() => iniciarSesionGoogle()}>Entrar con Google</button>
    {!authConfigurada() && <p>Falta configurar el acceso del panel.</p>}
  </div></main>;
  if (modo === "error") return <main className="main"><div className="empty">
    <h2>No se pudieron cargar los datos</h2><p>{fallo}</p>
    <button className="tab" onClick={() => window.location.reload()}>Reintentar</button>
  </div></main>;
  if (!data || !actual) return <main className="main"><div className="empty">Cargando panel…</div></main>;

  return <div className={dark ? "shell dark" : "shell"}>
    <Encabezado dark={dark} setDark={setDark} demo={modo === "demo"} />
    <main className="main historical-main">
      <section className="historical-toolbar" aria-label="Controles del histórico">
        <label>Semana y materia <select className="control" value={seleccion}
          onChange={(event) => setSeleccion(event.target.value)}>
          {[...data.resultados].reverse().map((fila) => <option
            key={clave(fila.semana, fila.materia)} value={clave(fila.semana, fila.materia)}>
            {fila.semana} · {fila.materia} · {fila.nivel}
          </option>)}
        </select></label>
        <button className="control" onClick={exportar}>Exportar resumen CSV</button>
      </section>
      {falloExport && <p className="status" role="alert">{falloExport}</p>}

      <div className="tabs" role="tablist" aria-label="Vistas del panel">
        {PESTANAS.map((nombre) => <button key={nombre} type="button" role="tab"
          aria-selected={pestana === nombre} className={`tab${pestana === nombre ? " active" : ""}`}
          onClick={() => setPestana(nombre)}>{nombre}</button>)}
      </div>

      {pestana === "Semana" ? <>
        <ResumenSemanaVisual actual={actual} nuncaPeriodo={data.nunca_periodo} />
        <CalendarioSemana actual={actual} modo={modo === "demo" ? "demo" : "real"} />
      </> : <TendenciaHistorica resultados={data.resultados} />}
    </main>
  </div>;
}
