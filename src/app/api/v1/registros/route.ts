import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq, desc, gte, lte, and } from 'drizzle-orm';
import { checkApiKey } from '../_auth';

export async function GET(req: NextRequest) {
  const deny = checkApiKey(req);
  if (deny) return deny;

  const { searchParams } = req.nextUrl;
  const estado = searchParams.get('estado');
  const paciente = searchParams.get('paciente');
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  const conditions = [];
  if (estado) conditions.push(eq(registros.estado, estado));
  if (desde) conditions.push(gte(registros.createdAt, new Date(desde)));
  if (hasta) conditions.push(lte(registros.createdAt, new Date(hasta)));

  let rows = await db
    .select()
    .from(registros)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(registros.createdAt));

  if (paciente) {
    const q = paciente.toLowerCase();
    rows = rows.filter((r) => r.paciente.toLowerCase().includes(q));
  }

  return NextResponse.json({ data: rows, total: rows.length });
}
