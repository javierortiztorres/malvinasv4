#!/bin/sh
set -e

echo "==> Creando/actualizando tablas..."
npx drizzle-kit push

echo "==> Cargando datos iniciales (idempotente)..."
npx tsx scripts/seed.ts

echo "==> Iniciando app..."
exec npm run dev
