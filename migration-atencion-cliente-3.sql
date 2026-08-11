-- ============================================================
-- Migración 3 del branch atencion-cliente (11-ago): descuento extra
-- por cotización (pedido de Tomi: "un descuento adicional en caso que
-- quiera"). ADITIVA e IDEMPOTENTE.
-- ============================================================

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS descuento_extra_pct real NOT NULL DEFAULT 0;
