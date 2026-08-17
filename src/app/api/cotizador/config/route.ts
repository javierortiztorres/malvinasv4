import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cargarConfig, guardarConfig } from '@/lib/cotizadorServer';
import { CONFIG_DEFAULT } from '@/lib/cotizador';

// Parámetros generales del cotizador (markup, tiempos, envases, envíos…).
// Atención los lee (los usa para calcular); los edita solo el Admin.

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin' && session.rol !== 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return NextResponse.json(await cargarConfig());
}

export async function PUT(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin edita los parámetros' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const datos: Record<string, number> = {};
  for (const clave of Object.keys(CONFIG_DEFAULT)) {
    const v = body?.[clave];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `Valor inválido en ${clave}` }, { status: 400 });
    }
    datos[clave] = n;
  }
  return NextResponse.json(await guardarConfig(datos));
}
