import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { armarDatosRotulo, tipoRotuloPorCaps } from '@/lib/rotulo';
import { formatoLote } from '@/lib/utils';
import RotuloEditor from '@/components/RotuloEditor';

export const dynamic = 'force-dynamic';

export default async function RotuloPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tipo?: string };
}) {
  const [r] = await db.select().from(registros).where(eq(registros.id, Number(params.id)));
  if (!r) return <p style={{ padding: '2rem' }}>Registro no encontrado.</p>;

  const tipoAuto = tipoRotuloPorCaps(r.capsulasPorEnvase);
  const tipoUrl =
    searchParams?.tipo === 'grande' || searchParams?.tipo === 'chico'
      ? (searchParams.tipo as 'grande' | 'chico')
      : undefined;

  // datosBase: sin overrides — el editor los aplica en el cliente
  const datosBase = armarDatosRotulo(r);
  const lote = formatoLote(r.lotePrefijo, r.loteNumero);

  return (
    <RotuloEditor
      id={r.id}
      paciente={r.paciente}
      lote={lote}
      datosBase={datosBase}
      overridesIniciales={r.rotuloOverrides ?? null}
      tipoAuto={tipoAuto}
      tipoUrl={tipoUrl}
    />
  );
}
