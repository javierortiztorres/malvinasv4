-- ============================================================
-- MIGRACIÓN v2.0.3 — correr UNA VEZ en la base Neon existente
-- (SQL Editor de Neon → pegar → Run). No toca datos existentes.
-- ============================================================

-- Conversión de dosis por tinta (receta en UI, µg de elemento, etc.)
ALTER TABLE tintas ADD COLUMN IF NOT EXISTS conv_unidad text NOT NULL DEFAULT '';
ALTER TABLE tintas ADD COLUMN IF NOT EXISTS conv_mg_por_unidad real;

-- Levadura de selenio al 0,2% de Se:
-- 1 µg de selenio = 0,5 mg de levadura (100 µg Se → 50 mg de levadura)
UPDATE tintas
SET conv_unidad = 'µg', conv_mg_por_unidad = 0.5
WHERE lower(nombre) LIKE '%selenio%';

-- NOTA Vitamina D: la conversión UI → mg depende de la potencia de la
-- materia prima que usan (la "impura 13%"). Cargarla desde Gestión →
-- editar la tinta → "Conversión de dosis" cuando tengan el dato exacto
-- (mg de materia prima por 1 UI). Hasta entonces sigue el aviso ámbar.
