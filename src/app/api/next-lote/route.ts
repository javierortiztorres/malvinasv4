import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros } from '@/db/schema';
import { desc, eq, isNotNull, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const prefijo = req.nextUrl.searchParams.get('prefijo') ?? 'PT001';
  const rows = await db
    .select({ n: registros.loteNumero })
    .from(registros)
    .where(and(eq(registros.lotePrefijo, prefijo), isNotNull(registros.loteNumero)))
    .orderBy(desc(registros.loteNumero))
    .limit(1);
  const ultimo = rows[0]?.n ?? 0;
  return NextResponse.json({ prefijo, proximo: ultimo + 1, ultimo });
}
