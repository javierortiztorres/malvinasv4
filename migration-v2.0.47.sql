-- B-31: Pre-producción real + indicador de "devuelto para corrección".
--
-- Solo agrega 2 columnas nuevas. NO reescribe filas existentes ni agrega
-- CHECK constraint: `estado` ya era texto libre sin restricción en la base
-- (a diferencia de usuarios.rol), así que sumar valores nuevos ('pendiente',
-- 'pre_produccion', 'en_produccion') no requiere ALTER de la columna — el
-- código nuevo los reconoce vía estadoPT() en src/lib/estadoPT.ts, que
-- también sigue entendiendo las filas viejas ('en_proceso' + en_produccion
-- boolean) sin tocarlas. Cada fila se "migra" sola, de forma perezosa, la
-- primera vez que se mueve con los controles nuevos — no hace falta un
-- UPDATE masivo. Esto es deliberado: como este código se despliega vía PR
-- (background job, sin push directo), no se puede asumir que el deploy
-- ocurra inmediatamente después de correr esta migración, y una reescritura
-- masiva de `estado` rompería el código viejo mientras siga en producción.
--
-- Idempotente: se puede re-correr sin romper nada.

ALTER TABLE registros ADD COLUMN IF NOT EXISTS devuelto_por text;
ALTER TABLE registros ADD COLUMN IF NOT EXISTS devuelto_en timestamptz;

-- Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'registros' AND column_name IN ('devuelto_por', 'devuelto_en')
ORDER BY column_name;
