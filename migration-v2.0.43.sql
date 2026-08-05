-- ============================================================
-- MIGRACIÓN v2.0.43 — tabla de usuarios (login real con roles)
-- Pegar SOLO ESTO en una ventana vacía del SQL Editor → Run.
-- Es a prueba de Runs repetidos.
--
-- Qué hace: crea la tabla `usuarios` para el login real de la
-- app (usuario + contraseña hasheada + rol: admin | impresion |
-- formulacion). NO toca `operadores` ni ninguna otra tabla —
-- son sistemas totalmente aparte.
--
-- Después de correr esto y desplegar la app: entrar a /setup en
-- el navegador para crear la primera cuenta admin. La contraseña
-- se escribe ahí mismo, nunca queda en este archivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS _migraciones (
  nombre      text PRIMARY KEY,
  aplicada_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migraciones WHERE nombre = 'v2.0.43-tabla-usuarios') THEN

    CREATE TABLE IF NOT EXISTS usuarios (
      id            serial PRIMARY KEY,
      nombre        text NOT NULL,
      usuario       text NOT NULL,
      password_hash text NOT NULL,
      rol           text NOT NULL CHECK (rol IN ('admin', 'impresion', 'formulacion')),
      activo        boolean NOT NULL DEFAULT true,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_usuario ON usuarios (usuario);

    INSERT INTO _migraciones (nombre) VALUES ('v2.0.43-tabla-usuarios');
  END IF;
END $$;

-- ============================================================
-- VERIFICACIÓN (corre sola): tiene que devolver 1 fila con la
-- tabla creada y 0 usuarios (todavía nadie se registró).
-- ============================================================
SELECT to_regclass('public.usuarios') AS tabla_usuarios,
       (SELECT count(*) FROM usuarios) AS usuarios_existentes;
