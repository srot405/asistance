"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sesionActual } from "./auth";
import { crearControlador, type EstadoVivo, type RespuestaVivo } from "./vivoControlador.mjs";

// Pestana "En vivo" (TOC-142): lectura de /api/vivo cada 45 s SOLO con la pestana En vivo abierta Y el navegador visible.
// Sin sondeo en segundo plano; 3 errores seguidos = pausa con "Reintentar". El ultimo dato se guarda en memoria para que
// volver a la pestana no deje la pantalla vacia; se borra al cerrar sesion o al entrar otro usuario (mismo navegador).
type Modo = "demo" | "real";
let ultimo: Partial<EstadoVivo> | null = null;
let usuarioDelCache: string | null = null;

export function vaciarCacheVivoCliente(): void { ultimo = null; usuarioDelCache = null; }
export function tamanoCacheVivo(): number { return ultimo ? 1 : 0; }
export function guardarCacheVivo(e: Partial<EstadoVivo>): void { ultimo = e; }
export function alCambiarSesionVivo(evento: string, userId: string | null | undefined): void {
  if (evento === "SIGNED_OUT") { vaciarCacheVivoCliente(); return; }
  if (userId && usuarioDelCache && userId !== usuarioDelCache) ultimo = null;
  if (userId) usuarioDelCache = userId;
}

async function pedirVivo(modo: Modo, signal: AbortSignal): Promise<RespuestaVivo> {
  if (modo === "demo") { // el demo no consulta ninguna API: usa los datos de ejemplo
    const { VIVO_DEMO } = await import("./vivo-demo.mjs");
    return { status: 200, body: VIVO_DEMO.sabado };
  }
  const sesion = await sesionActual();
  if (!sesion?.access_token) return { status: 401, body: null };
  const response = await fetch("/api/vivo", { headers: { Authorization: `Bearer ${sesion.access_token}` }, cache: "no-store", signal });
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

export function useVivo(modo: Modo, activa: boolean) {
  const [estado, setEstado] = useState<EstadoVivo>({ fase: "cargando", datos: null, leidoEn: 0, errores: 0, ...(ultimo ?? {}) });
  const ctl = useRef<ReturnType<typeof crearControlador> | null>(null);
  useEffect(() => {
    if (!activa) return;
    const c = crearControlador({
      pedir: (signal) => pedirVivo(modo, signal),
      alCambiar: (e) => { guardarCacheVivo({ datos: e.datos, aviso: e.aviso ?? null, leidoEn: e.leidoEn, fase: e.fase === "ok" ? "ok" : "cargando" }); setEstado(e); },
      visible: () => document.visibilityState === "visible",
      estadoInicial: ultimo,
    });
    ctl.current = c;
    const alVisibilidad = () => c.visibilidad();
    document.addEventListener("visibilitychange", alVisibilidad);
    c.iniciar();
    return () => { document.removeEventListener("visibilitychange", alVisibilidad); c.detener(); ctl.current = null; };
  }, [activa, modo]);
  const reintentar = useCallback(() => ctl.current?.reintentar(), []);
  return { ...estado, reintentar };
}
