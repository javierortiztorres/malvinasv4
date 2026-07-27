-- ============================================================
-- MIGRACIÓN v2.0.4 — excipientes como % del TOTAL de la tinta
-- (activo + excipientes = 100%)
-- Pegar SOLO ESTO en una ventana vacía del SQL Editor → Run.
-- Esta vez es a prueba de Runs repetidos: usa una tabla de marcas
-- (_migraciones) y solo se aplica la primera vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS _migraciones (
  nombre      text PRIMARY KEY,
  aplicada_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migraciones WHERE nombre = 'v2.0.4-excipientes-total') THEN

    -- Antes: la fracción de cada excipiente era sobre el total DE EXCIPIENTE
    -- (sumaban 100% entre sí). Ahora es sobre el total DE LA TINTA:
    -- fracción nueva = fracción vieja × (1 − concentración).
    -- Ej: OGAP 97% con Aerosil 100% del excipiente → Aerosil 3% del total.
    UPDATE tintas
    SET excipientes = (
      SELECT jsonb_agg(
               jsonb_set(
                 e, '{fraccion}',
                 to_jsonb(round((e->>'fraccion')::numeric * (1 - concentracion::numeric), 6))
               )
               ORDER BY ord
             )
      FROM jsonb_array_elements(excipientes) WITH ORDINALITY AS x(e, ord)
    )
    WHERE jsonb_array_length(excipientes) > 0;

    INSERT INTO _migraciones (nombre) VALUES ('v2.0.4-excipientes-total');
  END IF;
END $$;

-- ============================================================
-- VERIFICACIÓN (corre sola): tiene que devolver 0 filas.
-- Si aparece alguna tinta, es porque su activo + excipientes no
-- suman 100% — revisarla a mano en Gestión.
-- ============================================================
SELECT nombre,
       round(concentracion::numeric * 100, 2) AS activo_pct,
       round((SELECT COALESCE(sum((e->>'fraccion')::numeric), 0)
              FROM jsonb_array_elements(excipientes) e) * 100, 2) AS excipientes_pct
FROM tintas
WHERE jsonb_array_length(excipientes) > 0
  AND abs(concentracion::numeric
          + (SELECT COALESCE(sum((e->>'fraccion')::numeric), 0)
             FROM jsonb_array_elements(excipientes) e)
          - 1) > 0.005
ORDER BY nombre;
