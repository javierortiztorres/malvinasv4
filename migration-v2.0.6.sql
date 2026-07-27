-- ============================================================
-- MIGRACIÓN v2.0.6 — solapa "En producción" + deadline
-- Pegar SOLO ESTO en una ventana vacía del SQL Editor → Run.
-- Es inofensiva de correr varias veces (IF NOT EXISTS).
-- ============================================================

-- Los registros nacen en "Pendientes"; este flag los pasa a "En producción"
ALTER TABLE registros ADD COLUMN IF NOT EXISTS en_produccion boolean NOT NULL DEFAULT false;

-- Fecha límite de salida del producto (semáforo; no se imprime)
ALTER TABLE registros ADD COLUMN IF NOT EXISTS deadline text NOT NULL DEFAULT '';

-- Verificación: ambas columnas deben aparecer
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'registros' AND column_name IN ('en_produccion', 'deadline');
