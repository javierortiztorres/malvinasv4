-- Tabla de configuración editable del sistema
-- Correr una sola vez en Neon SQL Editor

INSERT INTO _migraciones (nombre) VALUES ('configuracion-v1')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
