-- v2.2.0 — Solapa 📒 Seguimiento (solo Admin) + guardado de recetas
-- Idempotente. Correr en la consola de Neon ANTES de deployar el código
-- (una sentencia por vez). Columnas nuevas con DEFAULT: el código viejo
-- sigue funcionando igual mientras tanto.

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS celular text NOT NULL DEFAULT '';

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS direccion_envio text NOT NULL DEFAULT '';

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS medio_pago text NOT NULL DEFAULT '';

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS monto_cobrado real;

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS envio_monto real;

ALTER TABLE registros ADD COLUMN IF NOT EXISTS receta_id integer;

CREATE TABLE IF NOT EXISTS recetas (
  id serial PRIMARY KEY,
  cotizacion_id integer,
  nombre_archivo text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT '',
  tamano_bytes integer NOT NULL DEFAULT 0,
  datos_base64 text NOT NULL DEFAULT '',
  subido_por text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);
