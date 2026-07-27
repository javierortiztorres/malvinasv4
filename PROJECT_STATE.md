# Estado del Proyecto — MALVINAS 2.0 (PILL.AR)

> Snapshot generado: 2026-07-27  
> Última confirmación: bb58808 — Primer commit

## Qué es este proyecto
Sistema de gestión de producción farmacéutica magistral para Nueva Farmacia Badra. Fusiona el motor de cálculo MALVINAS (extrusiones por IP para impresión 3D de cápsulas multicapa) con un sistema de registros legales de Producto Terminado y Producto Intermedio.

## Stack
Next.js 14 · React 18 · TypeScript · Tailwind CSS · Drizzle ORM · Neon (PostgreSQL serverless) · Vercel

## Fase actual
v2.0.8 — estable en producción, feature completa

## Completado ✓
- Lector de recetas PDF (parser CFC) con extracción automática de fórmulas
- Motor de cálculo de extrusiones por capa (engine.ts) con división automática de cápsulas
- Flujo PT completo: Pendientes → En producción → Terminados con documento legal y rótulo
- Solapa Producto Intermedio con lotes automáticos, pesadas teóricas y diluciones correctas
- Dashboard Necesidades: suma de activo por tinta en Pendientes + En producción, botón «Hacer»
- «Hacer» con 45% de merma y campo primario de carga por gramos de principio activo
- «Hacer» reversible (undo inmediato tras crear el lote)
- Gestión de 65 tintas: excipientes como %, keywords de mapeo, alertas químicas, POE
- Buscadores en PT / PI / Terminados; estadística mensual con columna Activo (g)
- Semáforo de deadline en tarjetas (≤5d amarillo, ≤3d/vencida rojo)

## En progreso →
- (sin datos — repo en estado limpio, sin cambios pendientes)

## Próximos pasos
1. Evaluar necesidades de v2.0.9 según feedback de farmacia
2. Correr `migration-v2.0.7.sql` en Neon si no se hizo aún (limpia nombres viejos de PI)
3. Verificar que `migration-v2.0.4.sql` y `migration-v2.0.6.sql` estén aplicadas en prod

## Decisiones vigentes
- Cápsulas multicapa: capacidad 0.95 mL (cuerpo 0.9 + tapa 0.1), mínimo imprimible 0.03 mL
- Excipientes como % del total de tinta (activo + excipientes = 100%)
- 45% de merma fija al crear lote desde Necesidades (activo_lote = necesidad × 1,45)
- Las recetas PDF nunca se guardan en base — solo se procesan en memoria
- Lotes PT numerados desde el último real cargado en neon-setup-malvinas2.sql (ajustar al instalar)

## Archivos clave
- `src/lib/engine.ts` — motor: IP, división, dilución, capacidades, mapeo de tintas
- `src/lib/parser.ts` — parser de recetas CFC (probado con recetas reales)
- `src/db/schema.ts` — esquema completo: tintas, registros PT y PI
- `src/components/Necesidades.tsx` — dashboard de necesidades con botón «Hacer»
- `src/components/ProductoIntermedio.tsx` — gestión de lotes PI con pesadas teóricas
- `src/components/RegistroEditor.tsx` — editor PT con motor en vivo y validación
- `migration-v2.0.7.sql` — última migración de esquema (agregar campos, limpiar nombres PI)
- `scripts/tintas-seed.json` — las 65 tintas extraídas de MALVINAS

## Advertencias activas
- Las migraciones `v2.0.3`, `v2.0.4`, `v2.0.6`, `v2.0.7` deben correrse **en orden** en Neon SQL Editor antes de usar la app en producción; son idempotentes gracias a tabla `_migraciones`
- `neon-setup-malvinas2.sql` requiere editar manualmente el número del último lote PT real antes del primer Run
- No existe `.env` en repo — requiere `DATABASE_URL` y `APP_PASSWORD` en Vercel o `.env` local
