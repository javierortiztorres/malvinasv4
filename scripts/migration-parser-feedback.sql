-- Migración: tabla de feedback pasivo del lector de recetas
-- Ejecutar en Neon SQL Editor

CREATE TABLE IF NOT EXISTS parser_feedback (
  id              SERIAL PRIMARY KEY,
  texto_original  TEXT NOT NULL DEFAULT '',
  resultado_parser JSONB NOT NULL,
  resultado_final  JSONB NOT NULL,
  hubo_correcciones BOOLEAN NOT NULL DEFAULT FALSE,
  fuente_ia        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas de análisis
CREATE INDEX IF NOT EXISTS idx_parser_feedback_correcciones
  ON parser_feedback (hubo_correcciones, created_at DESC);
