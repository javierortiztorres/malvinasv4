import type { Registro } from '@/db/schema';
import { SUCURSALES, LEYENDAS_ROTULO } from './config';
import { dosisPorCapsula, fechaAR, formatoLote } from './utils';

// Rótulo para la rotuladora: bloque de texto de 4 apartados, copiable.
export function generarRotulo(r: Registro, sucursalId: string): string {
  const suc = SUCURSALES.find((s) => s.id === sucursalId) ?? SUCURSALES[0];

  const ap1 = [
    `${r.capsulasPorEnvase ?? '—'} cápsulas`,
    `Paciente: ${r.paciente}`,
    `Médico: ${r.medico}${r.matricula ? ` - MP ${r.matricula}` : ''}`,
  ].join('\n');

  const activos = (r.formula ?? []).map(
    (a) => `${a.activo}: ${dosisPorCapsula(a, r.capsulasPorToma)}`
  );
  const exc =
    (r.excipientes ?? []).length > 0
      ? `Excipientes: ${(r.excipientes ?? []).join(', ')} c.s.p.`
      : 'Excipientes c.s.p.';
  const ap2 = ['Composición por cápsula:', ...activos, exc].join('\n');

  const ap3 = `Indicación: ${r.indicacion}`;

  const ap4 = [
    ...suc.lineas,
    `Lote: ${formatoLote(r.lotePrefijo, r.loteNumero)}`,
    `Fecha Elab: ${fechaAR(r.fechaElab)}`,
    `Fecha Vto: ${fechaAR(r.fechaVto)}`,
    ...LEYENDAS_ROTULO,
  ].join('\n');

  return [ap1, ap2, ap3, ap4].join('\n\n');
}
