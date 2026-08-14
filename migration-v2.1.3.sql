-- v2.1.3 — Archivar en lugar de eliminar (registros PT y PI)
-- Motivo: los borrados físicos dejaban huecos que rompían la coincidencia de
-- datos al migrar desde el Malvinas viejo. Desde esta versión los registros
-- no se eliminan: se archivan (reversible, solo Admin desarchiva).
--
-- Idempotente. Correr en la consola de Neon ANTES de deployar el código
-- (una sentencia por vez, como siempre). Con las columnas ya creadas, el
-- código viejo sigue funcionando igual: son columnas nuevas con DEFAULT.

ALTER TABLE registros ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;

ALTER TABLE registros ADD COLUMN IF NOT EXISTS archivado_en timestamptz;

ALTER TABLE registros ADD COLUMN IF NOT EXISTS archivado_por text;

ALTER TABLE registros_pi ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;

ALTER TABLE registros_pi ADD COLUMN IF NOT EXISTS archivado_en timestamptz;

ALTER TABLE registros_pi ADD COLUMN IF NOT EXISTS archivado_por text;
