-- ============================================================
-- Migración: branch atencion-cliente (rol Atención + cotizaciones)
-- ADITIVA e IDEMPOTENTE: solo crea tablas/columnas nuevas, no toca
-- nada existente — main puede seguir corriendo con este esquema sin
-- enterarse. Se puede re-correr entera sin romper nada.
-- Aplicar en la consola Query de Neon (Vercel → Storage → malvinasv4
-- → Query) ANTES de probar el preview del branch.
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizaciones (
  id serial PRIMARY KEY,
  estado_pago text NOT NULL DEFAULT 'pendiente',
  paciente text NOT NULL DEFAULT '',
  dni text NOT NULL DEFAULT '',
  grupo_paciente text NOT NULL DEFAULT '',
  lineas jsonb NOT NULL DEFAULT '[]',
  parametros jsonb NOT NULL DEFAULT '{}',
  precio_total real,
  precio_transferencia real,
  link_pago text NOT NULL DEFAULT '',
  notas text NOT NULL DEFAULT '',
  historial jsonb NOT NULL DEFAULT '[]',
  enviada_sin_pago boolean NOT NULL DEFAULT false,
  cotizado_por text NOT NULL DEFAULT '',
  pagada_en timestamptz,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comprobantes (
  id serial PRIMARY KEY,
  cotizacion_id integer NOT NULL,
  nombre_archivo text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT '',
  tamano_bytes integer NOT NULL DEFAULT 0,
  datos_base64 text NOT NULL DEFAULT '',
  subido_por text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE registros ADD COLUMN IF NOT EXISTS cotizacion_id integer;

-- Agenda de Atención al cliente: entrega al paciente (azul) y marca de
-- "no se puede producir" (gris; cómo la setean Formulación/Impresión se
-- define después — la columna queda lista).
ALTER TABLE registros ADD COLUMN IF NOT EXISTS entregado_en timestamptz;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS entregado_por text;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS no_producible_motivo text;

-- Búsquedas frecuentes: historial de precios por paciente (DNI) y
-- comprobantes de una cotización.
CREATE INDEX IF NOT EXISTS ix_cotizaciones_dni ON cotizaciones (dni);
CREATE INDEX IF NOT EXISTS ix_comprobantes_cotizacion ON comprobantes (cotizacion_id);
CREATE INDEX IF NOT EXISTS ix_registros_cotizacion ON registros (cotizacion_id) WHERE cotizacion_id IS NOT NULL;
