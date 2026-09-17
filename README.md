# Panel de asistencia

Frontend F3 para revisión semanal de asistencia. Usa Next.js 14, TypeScript, Tailwind y una grilla virtualizada.

## Desarrollo

1. Copia `.env.example` a `.env.local` y completa las variables con secretos locales.
2. Para revisión visual local: `MODO_DEMO=1 npm run dev` (en PowerShell: `$env:MODO_DEMO='1'; npm run dev`).
3. El demo usa únicamente datos sintéticos de `data/demo/`; queda bloqueado si `VERCEL_ENV=production`.

## Verificación

```text
npm run build
npm run test:acceso
npm run test:demo
npm run test:bloqueo
node scripts/verificar-acceso.mjs http://localhost:3000
```

Las APIs reales exigen sesión Google verificada de `@tocaunavida.org`, aplican headers privados y leen Supabase solo desde módulos server-only. La exportación real registra la corrida en `asist_corridas`; no hay `--aplicar`, migraciones ni cambios de n8n en este frontend.
