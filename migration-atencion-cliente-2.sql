-- ============================================================
-- Migración 2 del branch atencion-cliente: MOTOR DEL COTIZADOR
-- (lista de costos de drogas + parámetros generales, portados del
-- Excel "NUEVO COTIZADOR"). ADITIVA e IDEMPOTENTE, como la primera.
-- Se aplica en la consola Query de Neon (todo junto va envuelto en
-- DO $$ ... $$ porque la consola corre UNA sentencia por vez).
-- El SEED de las 53 drogas NO va acá: se carga por API una vez
-- deployado (POST /api/cotizador/drogas con la lista del Excel).
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizador_drogas (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  -- para matchear el nombre que viene en la receta (como tintas.keywords):
  -- sinónimos separados por coma, editable desde la pantalla del Admin
  keywords text NOT NULL DEFAULT '',
  unidad text NOT NULL DEFAULT 'mg', -- mg | ug | UI (unidad del precio)
  costo_unitario real,               -- costo real por unidad (col E del Excel)
  precio_comercial_unitario real,    -- tope comercial por unidad (col D)
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotizador_drogas_nombre
  ON cotizador_drogas (lower(nombre));

-- Parámetros generales del cotizador: UNA fila (id=1) con jsonb, para
-- poder sumar parámetros sin migrar. La crea la API si no existe.
CREATE TABLE IF NOT EXISTS cotizador_config (
  id integer PRIMARY KEY,
  datos jsonb NOT NULL DEFAULT '{}',
  updated_at timestamp NOT NULL DEFAULT now()
);
