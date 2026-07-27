import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tintas, medicos, pacientes, operadores } from '@/db/schema';
import { checkApiKey } from '../_auth';

export async function GET(req: NextRequest) {
  const deny = checkApiKey(req);
  if (deny) return deny;

  const { searchParams } = req.nextUrl;
  const recurso = searchParams.get('recurso');

  if (recurso === 'tintas') {
    const rows = await db.select().from(tintas).orderBy(tintas.nombre);
    return NextResponse.json({ data: rows, total: rows.length });
  }
  if (recurso === 'medicos') {
    const rows = await db.select().from(medicos).orderBy(medicos.nombre);
    return NextResponse.json({ data: rows, total: rows.length });
  }
  if (recurso === 'pacientes') {
    const rows = await db.select().from(pacientes).orderBy(pacientes.nombre);
    return NextResponse.json({ data: rows, total: rows.length });
  }
  if (recurso === 'operadores') {
    const rows = await db.select().from(operadores).orderBy(operadores.nombre);
    return NextResponse.json({ data: rows, total: rows.length });
  }

  // Sin filtro: devuelve todo
  const [t, m, p, o] = await Promise.all([
    db.select().from(tintas).orderBy(tintas.nombre),
    db.select().from(medicos).orderBy(medicos.nombre),
    db.select().from(pacientes).orderBy(pacientes.nombre),
    db.select().from(operadores).orderBy(operadores.nombre),
  ]);
  return NextResponse.json({ data: { tintas: t, medicos: m, pacientes: p, operadores: o } });
}
