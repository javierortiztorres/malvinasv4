import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { registros, medicos, pacientes } from '@/db/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { hoyISO, addDiasISO, addDiasHabilesISO, inicioSemanaISO } from '@/lib/utils';

// Capacidad real del laboratorio (B-31.1): 2 recetas/día, 10 recetas/semana
// (Lun-Dom, mismo corte que Agenda). Arranca en 5 días hábiles desde hoy y
// va corriendo +1 día hábil mientras el día o la semana estén completos.
// Nunca bloquea: siempre devuelve una fecha, por lejana que sea.
const CAPACIDAD_POR_DIA = 2;
const CAPACIDAD_POR_SEMANA = 10;

async function calcularDeadlineAuto(): Promise<string> {
  let candidato = addDiasHabilesISO(hoyISO(), 5);
  for (;;) {
    const delDia = await db.select({ id: registros.id }).from(registros).where(eq(registros.deadline, candidato));
    if (delDia.length >= CAPACIDAD_POR_DIA) {
      candidato = addDiasHabilesISO(candidato, 1);
      continue;
    }
    const inicioSem = inicioSemanaISO(candidato);
    const finSem = addDiasISO(inicioSem, 6);
    const deLaSemana = await db
      .select({ id: registros.id })
      .from(registros)
      .where(and(gte(registros.deadline, inicioSem), lte(registros.deadline, finSem)));
    if (deLaSemana.length + 1 > CAPACIDAD_POR_SEMANA) {
      candidato = addDiasHabilesISO(candidato, 1);
      continue;
    }
    return candidato;
  }
}

// Producto terminado (PT): Formulación no lo usa en ninguna solapa y no
// debe poder verlo ni de este lado (B-30b) — no alcanza con ocultarlo en
// el cliente.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const estado = req.nextUrl.searchParams.get('estado');
  const q = estado
    ? db.select().from(registros).where(eq(registros.estado, estado)).orderBy(desc(registros.createdAt))
    : db.select().from(registros).orderBy(desc(registros.createdAt));
  return NextResponse.json(await q);
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol === 'formulacion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];
  const creados = [];
  for (const item of items) {
    // Flujo aclarado por Tomi (11-ago): TODA receta —también las que lee
    // Atención— entra a PENDIENTES, ahí se revisa/corrige, y recién después
    // se pasa a Pendiente de pago (botón 💰) donde se cotiza. Nada nace
    // cotizado: la revisión va primero porque "si la receta se leyó mal,
    // va a cotizar mal".
    if (!item.deadline) {
      item.deadline = await calcularDeadlineAuto();
    }
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
