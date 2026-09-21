"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DemoData } from "../lib/types";
import { isWeekOverdue } from "../lib/conteos";
import Encabezado from "./Encabezado";
import Filtros, { type Filters } from "./Filtros";
import Resumen from "./Resumen";
import ResumenPorFranja from "./ResumenPorFranja";
import ZoomLimit from "./ZoomLimit";
import {
  authConfigurada,
  clienteAuth,
  iniciarSesionGoogle,
  sesionActual,
} from "../lib/auth";

const defaultFilters: Filters = {
  semana: "2026-09-14",
  ciudad: "",
  franja: "",
  cuenta: "",
  codigo: "",
};

export default function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const vistaInicial = params.get("vista");
  const [tab, setTab] = useState(
    vistaInicial === "Asistencia por horario" || vistaInicial?.startsWith("ZOOM")
      ? vistaInicial
      : "Resumen",
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
  // `modo` distingue tres situaciones que antes se confundían en un "Cargando…"
  // eterno (2026-09-21): el panel se construyó solo para el demo, con `demo=1`
  // incrustado en cada llamada y sin login. Con datos reales el servidor
  // respondía 401 y el cliente reventaba en `rows.map`.
  const [modo, setModo] = useState<"cargando" | "demo" | "real" | "login" | "error">(
    "cargando",
  );
  const [fallo, setFallo] = useState("");
  const current = weeks.find((week) => week.semana === filters.semana) ?? null;
  const setFilters = (next: Filters) => {
    setFiltersState(next);
    const query = new URLSearchParams();
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
      const filas = await lista.json();
      // El 401 devuelve un objeto {error}, no un arreglo: sin esta guarda el
      // `.map` de abajo rompe la página entera con un TypeError.
      if (!Array.isArray(filas)) throw new Error("respuesta inesperada");
      const datos = await Promise.all(
        filas.map(async (fila: { semana: string }) => {
          const r = await fetch(
            `/api/datos?semana=${fila.semana}${sufijo ? "&demo=1" : ""}`,
            { headers: cabeceras },
          );
          if (!r.ok) throw new Error(`datos ${fila.semana}: HTTP ${r.status}`);
          return r.json();
        }),
      );
      return datos as DemoData[];
    }

    async function cargar() {
      try {
        // 1) ¿el servidor corre en modo demo? Solo entonces sirve sin sesión.
        const prueba = await fetch("/api/semanas?demo=1");
        if (prueba.ok) {
          const datos = await traerSemanas("?demo=1", {});
          if (!cancelado) {
            setWeeks(datos);
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
        const datos = await traerSemanas("", {
          Authorization: `Bearer ${sesion.access_token}`,
        });
        if (!cancelado) {
          setWeeks(datos);
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
  return (
    <div className={dark ? "shell dark" : "shell"}>
      <Encabezado dark={dark} setDark={setDark} demo={modo === "demo"} />
      <main className="main">
        <Filtros
          data={current}
          weeks={weeks}
          filters={filters}
          setFilters={setFilters}
          tab={tab}
          onExport={() => {
            window.location.href = `/api/exportar?semana=${filters.semana}&vista=${encodeURIComponent(tab)}${modo === "demo" ? "&demo=1" : ""}`;
          }}
        />
        <nav className="tabs" role="tablist" aria-label="Vistas">
          {[
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
              aria-selected={tab === name}
              onClick={() => changeTab(name)}
            >
              {name}
              {name.startsWith("ZOOM") && overdue && (
                <span className="alert-badge">VENCIDA</span>
              )}
            </button>
          ))}
        </nav>
        {tab === "Resumen" && (
          <Resumen data={current} weeks={weeks} filters={filters} />
        )}
        {tab === "Asistencia por horario" && (
          <ResumenPorFranja data={current} weeks={weeks} />
        )}
        {tab.startsWith("ZOOM") && <ZoomLimit data={current} weeks={weeks} />}
      </main>
    </div>
  );
}
