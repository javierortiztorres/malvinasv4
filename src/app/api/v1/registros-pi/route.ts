import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq, desc, gte, lte, and } from 'drizzle-orm';
import { checkApiKey } from '../_auth';

export async function GET(req: NextRequest) {
  const deny = checkApiKey(req);
  if (deny) return deny;

  const { searchParams } = req.nextUrl;
  const estado = searchParams.get('estado');
  const tinta = searchParams.get('tinta');
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  const conditions = [];
  if (estado) conditions.push(eq(registrosPi.estado, estado));
  if (desde) conditions.push(gte(registrosPi.createdAt, new Date(desde)));
  if (hasta) conditions.push(lte(registrosPi.createdAt, new Date(hasta)));

  let rows = await db
    .select()
    .from(registrosPi)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(registrosPi.createdAt));

  if (tinta) {
    const q = tinta.toLowerCase();
    rows = rows.filter((r) => r.tintaNombre.toLowerCase().includes(q));
  }

  return NextResponse.json({ data: rows, total: rows.length });
}
