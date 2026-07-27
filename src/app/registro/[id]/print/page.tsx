import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { FARMACIA } from '@/lib/config';
import { fechaAR, fechaHoraAR, formatoLote } from '@/lib/utils';
import { poeDesdeLote } from '@/lib/engine';
import BotonImprimir from '@/components/BotonImprimir';

// Nombre con validez documental para el PI: "Tinta de {activo}".
// El nombre interno de la tinta (con concentración/apodos) queda para la app.
function nombreDocumental(activoReceta: string, tintaInterna: string): string {
  const a = (activoReceta ?? '').trim();
  if (!a) return tintaInterna || '-';
  return `Tinta de ${a.charAt(0).toUpperCase()}${a.slice(1)}`;
}

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------
// Documento legal del lote (uno por paciente), replicando el
// formato del registro Word original. Se imprime o guarda como
// PDF desde el navegador (Ctrl+P → Guardar como PDF).
// ---------------------------------------------------------------

export default async function PrintRegistro({ params }: { params: { id: string } }) {
  const [r] = await db.select().from(registros).where(eq(registros.id, Number(params.id)));
  if (!r) return <p className="p-8">Registro no encontrado.</p>;

  const NOMBRES_N: Record<number, string> = { 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis' };
  const cadaN =
    r.capsulasPorToma > 1
      ? `Cada ${NOMBRES_N[r.capsulasPorToma] ?? r.capsulasPorToma} cápsulas contienen`
      : 'Cada cápsula contiene';

  return (
    <div className="mx-auto max-w-[820px] bg-white p-10 text-[13px] leading-relaxed text-black">
      <BotonImprimir />

      <header className="mb-6 text-center">
        <h1 className="text-lg font-bold">{FARMACIA.nombre}</h1>
        <h2 className="text-base font-bold uppercase">{FARMACIA.tituloDocumentoPT}</h2>
      </header>

      <div className="space-y-1">
        <p><b>NOMBRE DEL PACIENTE:</b> {r.paciente}</p>
        <p><b>NOMBRE DEL PRODUCTO:</b> {r.producto}</p>
        <p><b>LOTE:</b> {formatoLote(r.lotePrefijo, r.loteNumero)}</p>
        <p><b>CANTIDAD DE UNIDADES INDIVIDUALES A PRODUCIR:</b> {r.capsulasTotales}</p>
        <p><b>MASA O VOLUMEN DE LAS UNIDADES INDIVIDUALES:</b> {r.masaVolumen}</p>
        <p><b>CANTIDAD DE PRODUCTO:</b> {r.envases} envase{(r.envases ?? 0) !== 1 && 's'} con {r.capsulasPorEnvase} cápsulas</p>
        <p><b>FECHA Y HORA DE INICIO DE PRODUCCIÓN:</b> {fechaHoraAR(r.fechaHoraInicio) || '-'}</p>
        <p><b>FECHA Y HORA DE FINALIZACIÓN DE PRODUCCIÓN:</b> {fechaHoraAR(r.fechaHoraFin) || '-'}</p>
        <p><b>NOMBRE Y APELLIDO DEL OPERADOR:</b> {r.operador}</p>
        <p><b>CANTIDAD DE ENVASES:</b> {r.envases} {r.tipoEnvase}</p>
      </div>

      <div className="mt-4">
        <p className="font-bold">FÓRMULA CUALI-CUANTITATIVA:</p>
        <p className="font-bold">{cadaN}:</p>
        <ul className="ml-6 list-disc">
          {r.formula.map((a, i) => (
            <li key={i}>{a.activo}: {a.dosis} {a.unidad}</li>
          ))}
        </ul>
        {(r.excipientes ?? []).length > 0 && (
          <p className="mt-1">Excipientes: {r.excipientes.join(', ')} c.s.p.</p>
        )}
      </div>

      <div className="mt-4">
        <p className="font-bold">MODO DE PREPARACIÓN: (VER POE N° {r.lotePrefijo})</p>
        <ul className="ml-6 list-disc">
          <li><b>Seleccionar las jeringas de producto intermedio</b> correspondientes a las necesarias para formular lo prescripto (VER POEs de productos intermedios)</li>
          <li><b>Precalentar las jeringas de producto intermedio</b> a su temperatura de fusión</li>
          <li><b>Llenar el capsulero de cuerpos y de tapas</b> con las cápsulas correspondientes, siguiendo buenas prácticas</li>
          <li><b>Verificar la homogeneidad visual</b> de la tinta, asegurándose de que no haya grumos, zonas no dispersas ni fases separadas</li>
          <li><b>Realizar las extrusiones correspondientes a cada capa de material</b>, ajustadas a las dosis necesarias</li>
          <li><b>Realizar el pesado de las cápsulas</b> una vez concluida la extrusión de cada capa</li>
          <li><b>Completar las extrusiones</b> hasta llevar las cápsulas a volumen</li>
          <li><b>Cerrar las cápsulas y acondicionarlas en su envase final inactínico</b></li>
          <li><b>Registrar los datos del lote</b>, incluyendo peso total, concentración final, fecha de elaboración, responsable y observaciones</li>
        </ul>
      </div>

      <div className="mt-4">
        <p className="mb-1 font-bold">PRODUCTOS INTERMEDIOS</p>
        <table className="w-full border-collapse border border-black text-center">
          <thead>
            <tr>
              {['Nº REF', 'PRODUCTO INTERMEDIO', 'Nº LOTE', 'Nº POE', 'EXTRUSIÓN POR CÁPSULA (ml)'].map((h) => (
                <th key={h} className="border border-black p-1 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.capas.map((c, i) => (
              <tr key={i}>
                <td className="border border-black p-1 font-bold">{i + 1}</td>
                <td className="border border-black p-1">{nombreDocumental(c.activoReceta, c.tinta)}</td>
                <td className="border border-black p-1">{c.lote}</td>
                <td className="border border-black p-1">{poeDesdeLote(c.lote) || c.poe || '-'}</td>
                <td className="border border-black p-1">{c.extrusionMl != null ? c.extrusionMl.toFixed(3) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <p className="mb-1 font-bold">DATOS DEL PROCESO:</p>
        <table className="w-full border-collapse border border-black text-center">
          <thead>
            <tr>
              <th className="border border-black p-1"></th>
              {r.capas.map((_, i) => (
                <th key={i} className="border border-black p-1">Valor CAPA {i + 1}</th>
              ))}
              <th className="border border-black p-1">Unidad</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['TEMPERATURA', r.proceso.temperatura, 'ºC'],
              ['TIEMPO DE MEZCLADO', r.proceso.tiempoMezclado, 'Min'],
              ['ORDEN DE AGREGADO DE COMPONENTES (SEGÚN Nº REFERENCIA)', 'ORDEN', '-'],
              ['TIEMPO DE REPOSO', r.proceso.tiempoReposo, 'Min'],
              ['OTROS', r.proceso.otros, '-'],
            ].map(([nombre, valor, unidad], fila) => (
              <tr key={fila}>
                <td className="border border-black p-1 text-left font-bold">{nombre}</td>
                {r.capas.map((_, i) => (
                  <td key={i} className="border border-black p-1">
                    {valor === 'ORDEN' ? i + 1 : valor === '' || valor == null ? '-' : valor}
                  </td>
                ))}
                <td className="border border-black p-1">{unidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 font-bold">CONTROLES FÍSICO-QUÍMICOS</p>
          <table className="w-full border-collapse border border-black text-center">
            <thead>
              <tr>
                <th className="border border-black p-1">CONTROL</th>
                <th className="border border-black p-1">CUMPLE</th>
                <th className="border border-black p-1">NO CUMPLE</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-black p-1 text-left">Peso</td>
                <td className="border border-black p-1">{r.controles.peso ? 'X' : ''}</td>
                <td className="border border-black p-1">{r.controles.peso ? '' : 'X'}</td></tr>
              <tr><td className="border border-black p-1 text-left">Visual</td>
                <td className="border border-black p-1">{r.controles.visual ? 'X' : ''}</td>
                <td className="border border-black p-1">{r.controles.visual ? '' : 'X'}</td></tr>
              <tr><td className="border border-black p-1 text-left">Otro: {r.controles.otroControl}</td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <p className="mb-1 font-bold">CONTROL DEL PERSONAL</p>
          <table className="w-full border-collapse border border-black text-center">
            <thead>
              <tr>
                <th className="border border-black p-1">CONTROL</th>
                <th className="border border-black p-1">CUMPLE</th>
                <th className="border border-black p-1">NO CUMPLE</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-black p-1 text-left">Vestimenta</td>
                <td className="border border-black p-1">{r.controles.vestimenta ? 'X' : ''}</td>
                <td className="border border-black p-1">{r.controles.vestimenta ? '' : 'X'}</td></tr>
              <tr><td className="border border-black p-1 text-left">Higiene</td>
                <td className="border border-black p-1">{r.controles.higiene ? 'X' : ''}</td>
                <td className="border border-black p-1">{r.controles.higiene ? '' : 'X'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 font-bold">CANTIDAD DE UNIDADES APROBADAS - RECHAZADAS</p>
        <table className="w-64 border-collapse border border-black">
          <tbody>
            <tr><td className="border border-black p-1 font-bold">APROBADO</td>
              <td className="border border-black p-1 text-center">{r.aprobadas}</td></tr>
            <tr><td className="border border-black p-1 font-bold">RECHAZADO</td>
              <td className="border border-black p-1 text-center">{r.rechazadas}</td></tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4"><b>FECHA DE VENCIMIENTO ESTIMADA:</b> {fechaAR(r.fechaVto)}</p>

      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <div className="border-t border-black pt-1">
            <p className="font-bold">FIRMA DEL OPERADOR</p>
            <p>{r.operador}</p>
          </div>
        </div>
        <div>
          <div className="border-t border-black pt-1">
            <p className="font-bold">FIRMA FARMACÉUTICO SUPERVISOR</p>
            <p>{r.supervisor}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
