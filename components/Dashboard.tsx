"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DemoData } from "../lib/types";
import { isWeekOverdue } from "../lib/conteos";
import Encabezado from "./Encabezado";
import Filtros, { type Filters } from "./Filtros";
import Resumen from "./Resumen";
import ResumenPorFranja from "./ResumenPorFranja";
import ResumenSemanaVisual from "./ResumenSemanaVisual";
import ZoomLimit from "./ZoomLimit";
import {
  authConfigurada,
  clienteAuth,
  iniciarSesionGoogle,
  sesionActual,
} from "../lib/auth";

const defaultFilters: Filters = {
  // La fecha inicial se calcula en el servidor según el lunes COT vigente.
  // No fijar aquí una semana histórica: el panel debe abrir el lunes actual.
  semana: "",
  ciudad: "",
  franja: "",
  cuenta: "",
};

export default function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const vistaInicial = params.get("vista");
  const [tab, setTab] = useState(
    vistaInicial === "Asistencia por horario" || vistaInicial === "Resumen" || vistaInicial?.startsWith("ZOOM")
      ? vistaInicial
      : "Semana visual",
  );
  const [dark, setDark] = useState(false);
  const [filters, setFiltersState] = useState<Filters>({
    ...defaultFilters,
    ...Object.fromEntries(
      Object.keys(defaultFilters).map((key) => [
        key,
        params.get(key) ?? defaultFilters[key as keyof Filters],
      ]),
    ),
  } as Filters);
  const [weeks, setWeeks] = useState<DemoData[]>([]);
  const [semanaActual, setSemanaActual] = useState("");
  // `modo` distingue tres situaciones que antes se confundían en un "Cargando…"
  // eterno (2026-09-21): el panel se construyó solo para el demo, con `demo=1`
  // incrustado en cada llamada y sin login. Con datos reales el servidor
  // respondía 401 y el cliente reventaba en `rows.map`.
  const [modo, setModo] = useState<"cargando" | "demo" | "real" | "login" | "error">(
    "cargando",
  );
  const [fallo, setFallo] = useState("");
  const [falloExport, setFalloExport] = useState("");
  const current = weeks.find((week) => week.semana === filters.semana) ?? null;
  const setFilters = (next: Filters) => {
    setFiltersState(next);
    const query = new URLSearchParams();
    if (params.get("demo") === "1") query.set("demo", "1");
    Object.entries(next).forEach(([key, value]) => {
      if (value && value !== defaultFilters[key as keyof Filters])
        query.set(key, value);
    });
    if (tab !== "Resumen") query.set("vista", tab);
    router.replace(`${pathname}?${query}`, { scroll: false });
  };
  useEffect(() => {
    let cancelado = false;

    async function traerSemanas(sufijo: string, cabeceras: HeadersInit) {
      const lista = await fetch(`/api/semanas${sufijo}`, { headers: cabeceras });
      if (!lista.ok) throw new Error(`semanas: HTTP ${lista.status}`);
      const indice = await lista.json();
      if (!indice || !Array.isArray(indice.semanas) || typeof indice.semanaActual !== "string")
        throw new Error("respuesta inesperada");
      setSemanaActual(indice.semanaActual);
      const fechas = [...new Set([...indice.semanas.map((f: { semana: string }) => f.semana), indice.semanaActual])];
      const datos = await Promise.all(
        fechas.map(async (semana: string) => {
          const r = await fetch(
            `/api/datos?semana=${semana}${sufijo ? "&demo=1" : "&detalle=1"}`,
            { headers: cabeceras },
          );
          if (!r.ok) throw new Error(`datos ${semana}: HTTP ${r.status}`);
          return r.json();
        }),
      );
      return { datos: datos as DemoData[], semanaActual: indice.semanaActual as string };
    }

    function elegirSemana(datos: DemoData[], actual: string) {
      const preferida = params.get("semana");
      const elegida = preferida && datos.some((d) => d.semana === preferida) ? preferida : actual;
      setFiltersState((previos) =>
        ({ ...previos, semana: datos.some((d) => d.semana === previos.semana)
          ? previos.semana : elegida }),
      );
    }

    async function cargar() {
      try {
        // 1) ¿el servidor corre en modo demo? Solo entonces sirve sin sesión.
        const prueba = await fetch("/api/semanas?demo=1");
        if (prueba.ok) {
          const { datos, semanaActual: actual } = await traerSemanas("?demo=1", {});
          if (!cancelado) {
            setWeeks(datos);
            elegirSemana(datos, actual);
            setModo("demo");
          }
          return;
        }
        // 2) Datos reales: hace falta la sesión de Google del dominio.
        const sesion = await sesionActual();
        if (!sesion?.access_token) {
          if (!cancelado) setModo("login");
          return;
        }
        const { datos, semanaActual: actual } = await traerSemanas("", {
          Authorization: `Bearer ${sesion.access_token}`,
        });
        if (!cancelado) {
          setWeeks(datos);
          elegirSemana(datos, actual);
          setModo("real");
        }
      } catch (e) {
        if (!cancelado) {
          setFallo(e instanceof Error ? e.message : String(e));
          setModo("error");
        }
      }
    }

    cargar();
    // Tras volver del login de Google la sesión aparece de forma asíncrona.
    const { data } = clienteAuth().auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED") cargar();
    });
    return () => {
      cancelado = true;
      data.subscription.unsubscribe();
    };
  }, []);
  const overdue = useMemo(
    () => (current ? isWeekOverdue(current) : false),
    [current],
  );
  if (modo === "login")
    return (
      <main className="main">
        <div className="empty">
          <h2>Panel de ingresos · Jóvenes creaTIvos</h2>
          <p>
            Este panel contiene datos de estudiantes. Entra con tu cuenta{" "}
            <b>@tocaunavida.org</b>.
          </p>
          <button className="tab active" onClick={() => iniciarSesionGoogle()}>
            Entrar con Google
          </button>
          {!authConfigurada() && (
            <p>
              Falta configurar <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </p>
          )}
        </div>
      </main>
    );
  if (modo === "error")
    return (
      <main className="main">
        <div className="empty">
          <h2>No se pudieron cargar los datos</h2>
          <p>{fallo}</p>
          <button className="tab" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  if (!current)
    return (
      <main className="main">
        <div className="empty">Cargando panel…</div>
      </main>
    );
  const changeTab = (next: string) => {
    setTab(next);
    const query = new URLSearchParams(window.location.search);
    query.set("vista", next);
    router.replace(`${pathname}?${query}`, { scroll: false });
  };
  const limitCount = current.franjas.filter((slot) =>
    ["zoom_limit_pendiente", "dudosa", "sin_captura"].includes(
      slot.estado_captura,
    ),
  ).length;
  async function exportar() {
    setFalloExport("");
    const vista = tab === "Asistencia por horario" ? tab : "Resumen";
    const query = new URLSearchParams({ semana: filters.semana, vista });
    const cabeceras: Record<string, string> = {};
    if (modo === "demo") query.set("demo", "1");
    else {
      const sesion = await sesionActual();
      if (!sesion?.access_token) {
        setFalloExport("Tu sesión expiró. Vuelve a iniciar sesión para descargar el CSV.");
        return;
      }
      cabeceras.Authorization = `Bearer ${sesion.access_token}`;
    }
    try {
      const response = await fetch(`/api/exportar?${query}`, { headers: cabeceras, cache: "no-store" });
      if (response.status === 401) {
        setFalloExport("Tu sesión expiró. Vuelve a iniciar sesión para descargar el CSV.");
        return;
      }
      if (!response.ok) throw new Error("No se pudo preparar el archivo. Inténtalo de nuevo.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `asistencia_${filters.semana}_${vista === "Resumen" ? "resumen" : "asistencia_por_horario"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFalloExport("No se pudo descargar el CSV. Revisa tu conexión e inténtalo de nuevo.");
    }
  }
  const sinFilaSemanaActual = current.semana === semanaActual && !current.semana_registrada;
  const semanaSinClases = current.franjas_con_clase.length === 0;
  return (
    <div className={dark ? "shell dark" : "shell"}>
      <Encabezado dark={dark} setDark={setDark} demo={modo === "demo"} />
      <main className="main">
        <Filtros
          data={current}
          weeks={weeks}
          semanaActual={semanaActual}
          filters={filters}
          setFilters={setFilters}
          tab={tab}
          onExport={exportar}
        />
        {falloExport && <p className="status" role="alert">{falloExport} <button className="link-button" onClick={() => iniciarSesionGoogle()}>Iniciar sesión</button></p>}
        {sinFilaSemanaActual && <p className="warning" role="status">El roster de esta semana todavía no se ha congelado (se hace el lunes a las 06:00).</p>}
        <nav className="tabs" role="tablist" aria-label="Vistas">
          {[
            "Semana visual",
            "Resumen",
            "Asistencia por horario",
            `ZOOM-LIMIT (${limitCount})`,
          ].map((name) => (
            <button
              className={
                tab === name ||
                (name.startsWith("ZOOM") && tab.startsWith("ZOOM"))
                  ? "tab active"
                  : "tab"
              }
              key={name}
              role="tab"
          aria-selected={tab === name || (name.startsWith("ZOOM") && tab.startsWith("ZOOM"))}
              onClick={() => changeTab(name)}
            >
              {name}
              {name.startsWith("ZOOM") && overdue && (
                <span className="alert-badge">VENCIDA</span>
              )}
            </button>
          ))}
        </nav>
        {tab !== "ZOOM" && semanaSinClases && <section className="empty week-empty">
          <h2>La semana arrancó; los datos se llenan al terminar cada clase</h2>
          {sinFilaSemanaActual && <p>El roster y el horario aparecerán cuando el equipo congele la semana.</p>}
        </section>}
        {tab === "Semana visual" && !semanaSinClases && (
          <ResumenSemanaVisual data={current} demo={modo === "demo"} />
        )}
        {tab === "Resumen" && !semanaSinClases && (
          <Resumen data={current} weeks={weeks} filters={filters} />
        )}
        {tab === "Asistencia por horario" && !semanaSinClases && (
          <ResumenPorFranja data={current} weeks={weeks} filters={filters} />
        )}
        {tab.startsWith("ZOOM") && <ZoomLimit data={current} weeks={weeks} />}
      </main>
    </div>
  );
}
