import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { configuracion } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/configuracion?clave=openrouter_api_key
// Devuelve el valor enmascarado (últimos 4 chars visibles).
export async function GET(req: NextRequest) {
  const clave = req.nextUrl.searchParams.get('clave');
  if (!clave) return NextResponse.json({ error: 'Falta parámetro clave' }, { status: 400 });

  const [row] = await db.select().from(configuracion).where(eq(configuracion.clave, clave));
  if (!row) return NextResponse.json({ valor: null, configurado: false });

  const val = row.valor;
  const enmascarado = val.length > 4 ? '•'.repeat(val.length - 4) + val.slice(-4) : '••••';
  return NextResponse.json({ valor: enmascarado, configurado: true });
}

// POST /api/configuracion { clave, valor }
export async function POST(req: NextRequest) {
  const { clave, valor } = await req.json();
  if (!clave || !valor) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });

  await db
    .insert(configuracion)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: configuracion.clave, set: { valor } });

  return NextResponse.json({ ok: true });
}

// DELETE /api/configuracion?clave=openrouter_api_key
export async function DELETE(req: NextRequest) {
  const clave = req.nextUrl.searchParams.get('clave');
  if (!clave) return NextResponse.json({ error: 'Falta parámetro clave' }, { status: 400 });
  await db.delete(configuracion).where(eq(configuracion.clave, clave));
  return NextResponse.json({ ok: true });
}
