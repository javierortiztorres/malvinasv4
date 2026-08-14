import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { db } from '@/db';
import { cotizaciones, registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { primerNombre } from '@/lib/cotizador';
import { cargarConfig } from '@/lib/cotizadorServer';

function sinPermiso(rol: string): boolean {
  return rol !== 'admin' && rol !== 'atencion';
}

// Genera el LINK FIRMADO del checkout propio (pillar-checkout) y lo deja
// en linkPago — chau depender del CEO para cada link. El payload lleva
// nombre, nº de cotización, precios SIN envío y los precios de envío
// vigentes; la firma HMAC (CHECKOUT_SECRET, el mismo secreto en los dos
// proyectos) hace que nadie pueda fabricar ni retocar un precio.
//
// ⚠️ Los precios de la cotización viajan como el precio del TRATAMIENTO:
// para el checkout la cotización se calcula con "Sin envío" — el
// paciente elige el envío en el link y se suma allá.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sinPermiso(session.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const secreto = process.env.CHECKOUT_SECRET;
  const urlBase = (process.env.CHECKOUT_URL ?? '').replace(/\/$/, '');
  if (!secreto || !urlBase) {
    return NextResponse.json(
      { error: 'Faltan CHECKOUT_SECRET y/o CHECKOUT_URL en las variables de entorno de Vercel' },
      { status: 500 }
    );
  }

  const id = Number(params.id);
  const [cot] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cot) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (cot.precioTotal == null || cot.precioTransferencia == null) {
    return NextResponse.json(
      { error: 'La cotización necesita precio total y transferencia antes de generar el link' },
      { status: 400 }
    );
  }

  const [cfg, regs] = await Promise.all([
    cargarConfig(),
    db.select({ deadline: registros.deadline }).from(registros).where(eq(registros.cotizacionId, id)),
  ]);
  const deadline = regs.map((r) => r.deadline).filter(Boolean).sort().pop();

  const payload = {
    v: 1,
    o: cot.id,
    n: primerNombre(cot.paciente) || cot.paciente || '',
    tr: Math.round(cot.precioTransferencia),
    li: Math.round(cot.precioTotal),
    ec: cfg.envioCorto,
    el: cfg.envioLargo,
    ...(deadline ? { d: deadline } : {}),
  };
  const p64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const t = createHmac('sha256', secreto).update(p64).digest('hex').slice(0, 32);
  const link = `${urlBase}/cotizacion?p=${p64}&t=${t}`;

  const [row] = await db
    .update(cotizaciones)
    .set({ linkPago: link, updatedAt: new Date() })
    .where(eq(cotizaciones.id, id))
    .returning();

  return NextResponse.json({ cotizacion: row, link });
}
