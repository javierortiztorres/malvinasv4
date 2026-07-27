-- ============================================================
-- MIGRACIÓN v2.0.7 — nombres limpios en registros de PI viejos
-- Pegar SOLO ESTO en una ventana vacía del SQL Editor → Run.
-- Es a prueba de Runs repetidos: la limpieza no encuentra nada
-- que limpiar la segunda vez, y queda marcada en _migraciones.
--
-- Qué hace: en los registros de Producto Intermedio ya creados
-- (antes de v2.0.5/v2.0.7) limpia el "PARA X MG", los apodos
-- (salvavidas, concentrada, diluida, impura) y el "%" final de:
--   1) nombre_producto  (ej: "TINTA DE MELATONINA PARA 1 MG 3%"
--                            → "TINTA DE MELATONINA")
--   2) la PRIMERA materia prima de la tabla (la fila del activo:
--      "Melatonina para 1 mg" → "Melatonina").
-- No toca los excipientes ni los PI usados como materia prima
-- (ej. "Oleogel 2,5%" conserva su concentración en el nombre).
-- Los registros nuevos ya salen limpios desde la app.
-- ============================================================

CREATE TABLE IF NOT EXISTS _migraciones (
  nombre      text PRIMARY KEY,
  aplicada_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migraciones WHERE nombre = 'v2.0.7-nombres-pi-limpios') THEN

    -- 1) Nombre del producto
    UPDATE registros_pi
    SET nombre_producto = btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(nombre_producto,
            '\s*\(\s*(salvavidas|concentrada|diluida|impura)\s*\)', '', 'gi'),
          '\s+para\s+[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|mcg|g|ui)\M', '', 'gi'),
        '\s*[0-9]+([.,][0-9]+)?\s*%\s*$', '', 'g')
    )
    WHERE nombre_producto ~* '\(\s*(salvavidas|concentrada|diluida|impura)\s*\)'
       OR nombre_producto ~* '\s+para\s+[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|mcg|g|ui)\M'
       OR nombre_producto ~* '\s*[0-9]+([.,][0-9]+)?\s*%\s*$';

    -- 2) Primera materia prima (la fila del activo) de cada registro
    UPDATE registros_pi
    SET materias_primas = jsonb_set(
      materias_primas, '{0,nombre}',
      to_jsonb(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(materias_primas->0->>'nombre',
              '\s*\(\s*(salvavidas|concentrada|diluida|impura)\s*\)', '', 'gi'),
            '\s+para\s+[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|mcg|g|ui)\M', '', 'gi'),
          '\s*[0-9]+([.,][0-9]+)?\s*%\s*$', '', 'g')
      ))
    )
    WHERE jsonb_array_length(materias_primas) > 0
      AND (materias_primas->0->>'nombre' ~* '\(\s*(salvavidas|concentrada|diluida|impura)\s*\)'
        OR materias_primas->0->>'nombre' ~* '\s+para\s+[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|mcg|g|ui)\M'
        OR materias_primas->0->>'nombre' ~* '\s*[0-9]+([.,][0-9]+)?\s*%\s*$');

    INSERT INTO _migraciones (nombre) VALUES ('v2.0.7-nombres-pi-limpios');
  END IF;
END $$;

-- ============================================================
-- VERIFICACIÓN (corre sola): tiene que devolver 0 filas.
-- Si aparece alguna, ese registro conserva "para X mg" u otro
-- sufijo — revisarlo a mano desde la app (el campo es editable).
-- ============================================================
SELECT id, nombre_producto, materias_primas->0->>'nombre' AS activo
FROM registros_pi
WHERE nombre_producto ~* '\s+para\s+[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|mcg|g|ui)\M'
   OR (jsonb_array_length(materias_primas) > 0
       AND materias_primas->0->>'nombre' ~* '\s+para\s+[0-9]+([.,][0-9]+)?\s*(mg|µg|ug|mcg|g|ui)\M');
