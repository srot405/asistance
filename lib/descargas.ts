"use client";
import { sesionActual } from "./auth";
import { aplicarRolDemo } from "./rolUi";

// Descarga autenticada compartida por el botón "Exportar resumen CSV" (Dashboard)
// y los botones de CSV nominal (CalendarioSemana): agrega el Bearer real o
// ?demo=1 según el modo, dispara la descarga del navegador y libera el blob.
export async function descargarCsv(url: URL, modo: "demo" | "real", nombreArchivo: string): Promise<string | null> {
  const headers: Record<string, string> = {};
  if (modo === "demo") { url.searchParams.set("demo", "1"); aplicarRolDemo(url.searchParams); }
  else {
    const sesion = await sesionActual();
    if (!sesion?.access_token) return "Tu sesión expiró. Vuelve a iniciar sesión para descargar el archivo.";
    headers.Authorization = `Bearer ${sesion.access_token}`;
  }
  try {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión para descargar el archivo.";
    if (!response.ok) {
      // Mensaje claro del servidor (400/404: semana sin roster, sin resumen; 403: sin permiso nominal o ciudad ajena) en vez del genérico.
      if (response.status === 400 || response.status === 403 || response.status === 404) {
        const cuerpo = await response.json().catch(() => null) as { error?: string } | null;
        if (cuerpo?.error) return cuerpo.error;
      }
      throw new Error();
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = nombreArchivo;
    link.click();
    URL.revokeObjectURL(blobUrl);
    return null;
  } catch {
    return "No se pudo descargar el archivo. Revisa tu conexión e inténtalo de nuevo.";
  }
}
