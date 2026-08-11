import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { LineaCotizacion } from '@/db/schema';
import { type Envio } from '@/lib/cotizador';
import { cotizarLineas } from '@/lib/cotizadorServer';

// SIMULADOR (pedido de Tomi 11-ago): cotizar una consulta suelta —"che,
// ¿cuánto me saldría hacer esto?" de un médico— SIN paciente, SIN
// registros y SIN guardar nada. Calcula con las drogas y parámetros
// vigentes y devuelve el desglose; no queda ningún rastro en el sistema.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.rol !== 'admin' && session.rol !== 'atencion') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const envio: Envio = body?.envio === 'largo' || body?.envio === 'corto' ? body.envio : 'sin';
  const descCrudo = Number(body?.descuentoExtraPct);
  const descuentoExtraPct = Number.isFinite(descCrudo) ? Math.min(Math.max(descCrudo, 0), 100) : 0;

  const crudas = Array.isArray(body?.lineas) ? body.lineas : [];
  const lineas: LineaCotizacion[] = crudas.slice(0, 5).map((l: Record<string, unknown>, i: number) => ({
    registroId: null,
    titulo: `Simulada ${i + 1}`,
    nCapsulas: Number(l?.nCapsulas) > 0 ? Math.floor(Number(l.nCapsulas)) : null,
    activos: (Array.isArray(l?.activos) ? l.activos : []).slice(0, 15).map((a: Record<string, unknown>) => ({
      nombre: String(a?.nombre ?? ''),
      dosis: Number(a?.dosis) || 0,
      unidad: String(a?.unidad ?? 'mg'),
      costo: null,
      drogaId: Number.isInteger(Number(a?.drogaId)) && Number(a?.drogaId) > 0 ? Number(a.drogaId) : null,
    })),
    costoCapsulas: null,
    costoEnvase: null,
    costoTiempo: null,
    costoExtra: null,
    precioSugerido: null,
    precioComercial: null,
  }));

  if (lineas.length === 0 || lineas.every((l) => l.activos.length === 0)) {
    return NextResponse.json({ error: 'Cargá al menos un activo' }, { status: 400 });
  }

  const calc = await cotizarLineas(lineas, envio, descuentoExtraPct);
  return NextResponse.json({ lineas: calc.lineas, faltantes: calc.faltantes, totales: calc.totales });
}
