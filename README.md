# Panel de asistencia

Frontend F3 para revisión semanal de asistencia. Usa Next.js 14, TypeScript, Tailwind y una grilla virtualizada.

## Desarrollo

1. Copia `.env.example` a `.env.local` y completa las variables con secretos locales.
2. Para revisión visual local: `MODO_DEMO=1 npm run dev` (en PowerShell: `$env:MODO_DEMO='1'; npm run dev`).
3. El demo usa únicamente datos sintéticos de `data/demo/`; queda bloqueado si `VERCEL_ENV` es `production` o `preview` (solo corre en local o con `vercel dev`).

## Verificación

```text
npm run build
npm run test:acceso
npm run test:demo
npm run test:bloqueo
node scripts/verificar-acceso.mjs http://localhost:3000
```

Las APIs reales exigen sesión Google verificada de `@tocaunavida.org`, aplican headers privados y leen Supabase solo desde módulos server-only. La exportación real registra la corrida en `asist_corridas`; no hay `--aplicar`, migraciones ni cambios de n8n en este frontend.

## Seguridad de despliegue

- **`MODO_DEMO` NO debe existir en ningún entorno de Vercel** (Production, Preview ni Development): abre las rutas `/api/*` sin login. `lib/demo.js` hace fallar el arranque en `production` y `preview`, pero la defensa real es no definir la variable. Verificación manual (no la ejecuta ningún script): `vercel env ls` y confirmar que `MODO_DEMO` no aparece en ningún entorno; si aparece, `vercel env rm MODO_DEMO`.
- **No empaquetar ni subir `.next` prearmado** (ni en zip, ni en `vercel deploy --prebuilt` desde una carpeta compartida): su caché local (`.next/cache`) puede contener la service key de Supabase leída en el build. `.next/` está en `.gitignore`; comprobar con `git check-ignore .next` (debe imprimir `.next`). Desplegar siempre desde el repo, dejando que Vercel compile.
- **Egress de Supabase**: `/api/tiempo` guarda en memoria del servidor, 60 s por semana, solo las filas crudas sin nombre ni `persona_id`; cambiar de filtro no relee la vista por persona. La tarjeta de la pestaña Semana usa `?ligero=1` (solo conteos por clase) y la lectura completa solo ocurre al abrir la pestaña Tiempo.
