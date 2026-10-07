"use client";
import { createContext, useContext } from "react";

// Rol del usuario para la INTERFAZ (TOC-148): solo decide que botones/tablas nominales se ofrecen. La seguridad real vive en cada
// ruta del servidor (403 sin rol, ciudad filtrada alli); ocultar un boton nunca reemplaza esa validacion.
export type RolUi = { nominal: "todo" | "ciudad" | "ninguno" | "error" | "cargando"; rol: string | null; ciudad: string | null; modo: string };
export const ROL_CARGANDO: RolUi = { nominal: "cargando", rol: null, ciudad: null, modo: "cargando" };
export const RolContext = createContext<RolUi>(ROL_CARGANDO);

export function usePuedeNominal(): { puede: boolean; rol: RolUi } {
  const rol = useContext(RolContext);
  return { puede: rol.nominal === "todo" || rol.nominal === "ciudad", rol };
}

export function textoSinNominal(rol: RolUi): string {
  if (rol.nominal === "ninguno") return "Tu cuenta no tiene permiso para ver ni descargar datos con nombres. Los agregados siguen disponibles; pide el rol de monitor o admin.";
  if (rol.nominal === "error") return "No se pudo verificar tu permiso para datos con nombres. Los agregados siguen disponibles; recarga en un momento.";
  return "";
}

// Rol de PRACTICA en demo local (?rol_demo=): vacio = compatibilidad. Solo se envia cuando modo === "demo".
let rolDemo = "";
export const fijarRolDemo = (valor: string): void => { rolDemo = valor; };
export const rolDemoActual = (): string => rolDemo;
export function aplicarRolDemo(params: URLSearchParams): void {
  if (rolDemo) { params.set("rol_demo", rolDemo); if (rolDemo === "monitor") params.set("ciudad_demo", "Cali"); }
}
