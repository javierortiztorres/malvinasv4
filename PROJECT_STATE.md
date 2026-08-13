# Estado del Proyecto — M.A.L.V.I.N.A.S 2.0 (PILL.AR)

> Snapshot generado: 2026-08-11  
> Última confirmación: v2.0.34 (04-ago-2026) — 3 correcciones en Estadística (B-19.6.2)

## Qué es este proyecto
Sistema de gestión de producción farmacéutica magistral para Nueva Farmacia Badra. Motor de cálculo de extrusiones por IP para impresión 3D de cápsulas multicapa (MALVINAS), combinado con registros legales de PT y PI, agenda de deadlines y estadísticas de producción.

## Stack
Next.js 14 · React 18 · TypeScript · Tailwind CSS · Drizzle ORM · Neon (PostgreSQL serverless) · Vercel

## Fase actual
v2.0.34 — estable en producción; backlog de v2.0.35+ según feedback de farmacia

## Completado ✓
- Lector de recetas PDF (parser CFC) con extracción automática de fórmulas
- Motor de cálculo de extrusiones por capa (`engine.ts`) con división automática de cápsulas
- Flujo PT completo: Pendientes → En producción → Terminados (con documento legal y rótulo)
- Solapa PI: lotes automáticos, pesadas teóricas, diluciones, malaxado, planilla de pesadas imprimible
- Solapa **📈 Estadística**: KPIs, Producción, Pacientes, Ranking, Evolución (gráficos SVG sin librerías), sección Extrusión/Activo por cápsula, Tiempo de producción
- Solapa **🗓️ Agenda**: vista Semana/Mes de deadlines, click para ir a la tarjeta, avisos de vencidas
- Dashboard Necesidades: suma activo por tinta, botón «Hacer» con 45% merma + undo inmediato
- Semáforo de deadline en tarjetas (≤5d amarillo, ≤3d/vencida rojo)
- Gestión de 65 tintas: excipientes %, keywords, alertas químicas, POE
- API REST v1 de solo lectura con autenticación por API Key

## En progreso →
- (repo limpio — sin tareas activas declaradas)

## Próximos pasos
1. Evaluar necesidades de v2.0.35+ según feedback de farmacia (campo de entrega real para Estadística)
2. Verificar que migraciones v2.0.3 → v2.0.7 + v2.0.47 estén aplicadas en Neon prod
3. Agregar conteo real de eventos de extrusión (pendiente de backlog, requiere campo nuevo en schema)

## Decisiones vigentes
- Cápsulas multicapa: capacidad 0.95 mL (cuerpo 0.9 + tapa 0.1), mínimo imprimible 0.03 mL
- Excipientes como % del total de tinta (activo + excipientes = 100%)
- 45% de merma fija al crear lote desde Necesidades (activo_lote = necesidad × 1.45)
- Las recetas PDF nunca se guardan en base — solo se procesan en memoria
- API v1 es de **solo lectura** y requiere API Key por header
- `extrusionMl` en schema es VOLUMEN (mL) por cápsula — no conteo de eventos de extrusión

## Archivos clave
- `src/lib/engine.ts` — motor: IP, división, dilución, mapeo, calcularExtrusionPeriodo, calcularActivoPeriodo
- `src/lib/parser.ts` — parser de recetas CFC (probado con recetas reales)
- `src/lib/utils.ts` — `fechaProduccion()`, `hoyISO()`, `fmtPctOpcional()`, `esPiPendiente()`
- `src/db/schema.ts` — esquema completo: tintas, registros PT y PI
- `src/app/api/` — endpoints API REST v1 + rutas internas
- `src/components/Estadistica.tsx` — dashboard estadístico completo
- `src/components/Agenda.tsx` — vista calendario de deadlines
- `src/components/Necesidades.tsx` — dashboard de necesidades + botón «Hacer»
- `scripts/tintas-seed.json` + `scripts/test-engine.ts` — seed y tests del motor

## Advertencias activas
- Migraciones `v2.0.3`, `v2.0.4`, `v2.0.6`, `v2.0.7` deben correrse **en orden** en Neon SQL Editor
- `neon-setup-malvinas2.sql` requiere editar el número del último lote PT real antes del primer Run
- No hay `.env` en repo — requiere `DATABASE_URL` y `APP_PASSWORD` en Vercel o `.env` local
- `neon-http` driver cachea `fetch()` — ya corregido con `cache: 'no-store'` en `src/db/index.ts`
- Campo de entrega real (`entregadoAt`) no existe en schema — Estadística usa `fechaHoraFin` como proxy
