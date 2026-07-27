import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros, medicos, pacientes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const estado = req.nextUrl.searchParams.get('estado');
  const q = estado
    ? db.select().from(registros).where(eq(registros.estado, estado)).orderBy(desc(registros.createdAt))
    : db.select().from(registros).orderBy(desc(registros.createdAt));
  return NextResponse.json(await q);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];
  const creados = [];
  for (const item of items) {
    const [row] = await db.insert(registros).values(item).returning();
    creados.push(row);
    if (item.medico) {
      const ya = await db.select().from(medicos).where(eq(medicos.nombre, item.medico));
      if (ya.length === 0)
        await db.insert(medicos).values({ nombre: item.medico, matricula: item.matricula ?? '' });
    }
    if (item.paciente) {
      const ya = await db.select().from(pacientes).where(eq(pacientes.nombre, item.paciente));
      if (ya.length === 0)
        await db.insert(pacientes).values({ nombre: item.paciente, dni: item.dni ?? '' });
    }
  }
  return NextResponse.json(creados);
}
