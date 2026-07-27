import { db } from '@/db';
import { registrosPi } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { FARMACIA } from '@/lib/config';
import { fechaAR, fechaHoraAR, formatoLotePI } from '@/lib/utils';
import BotonImprimir from '@/components/BotonImprimir';

export const dynamic = 'force-dynamic';

export default async function PrintRegistroPI({ params }: { params: { id: string } }) {
  const [r] = await db.select().from(registrosPi).where(eq(registrosPi.id, Number(params.id)));
  if (!r) return <p className="p-8">Registro no encontrado.</p>;

  return (
    <div className="mx-auto max-w-[820px] bg-white p-10 text-[13px] leading-relaxed text-black">
      <BotonImprimir />

      <header className="mb-6 text-center">
        <h1 className="text-lg font-bold">{FARMACIA.nombre}</h1>
        <h2 className="text-base font-bold uppercase">{FARMACIA.tituloDocumentoPI}</h2>
      </header>

      <div className="space-y-1">
        <p><b>NOMBRE DEL PRODUCTO:</b> {r.nombreProducto}</p>
        <p><b>LOTE:</b> {formatoLotePI(r.poe, r.loteNumero)}</p>
        <p><b>CANTIDAD DE UNIDADES INDIVIDUALES A PRODUCIR:</b> {r.jeringas} jeringas plásticas de {r.volumenJeringaMl} ml</p>
        <p><b>MASA O VOLUMEN DE LAS UNIDADES INDIVIDUALES:</b> {r.volumenJeringaMl} ml</p>
        <p><b>CANTIDAD DE PRODUCTO:</b> {r.cantidadProductoG} g</p>
        <p><b>FECHA Y HORA DE INICIO DE PRODUCCIÓN:</b> {fechaHoraAR(r.fechaHoraInicio) || '-'}</p>
        <p><b>FECHA Y HORA DE FINALIZACIÓN DE PRODUCCIÓN:</b> {fechaHoraAR(r.fechaHoraFin) || '-'}</p>
        <p><b>NOMBRE Y APELLIDO DEL OPERADOR:</b> {r.operador}</p>
        <p><b>CANTIDAD DE ENVASES:</b> {r.jeringas} jeringas plásticas de {r.volumenJeringaMl} ml</p>
      </div>

      <div className="mt-4">
        <p className="font-bold">FÓRMULA CUALI-CUANTITATIVA:</p>
        <ul className="ml-6 list-disc">
          {r.materiasPrimas.map((m, i) => (
            <li key={i}>{m.nombre} ……………………… {m.cantidadTeorica} g</li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="font-bold">MODO DE PREPARACIÓN: (VER POE N° {r.poe})</p>
        <ul className="ml-6 list-disc">
          <li><b>Pesar los componentes activos</b> de acuerdo con la fórmula establecida para la concentración deseada.</li>
          <li><b>Transferir los componentes a un vaso de precipitados o recipiente de mezcla</b> resistente a temperatura, si el proceso requiere calentamiento (ej. PEG fundido, oleogel).</li>
          <li><b>Agitar o malaxar</b> utilizando agitador magnético, mecánico o espátula hasta lograr una mezcla homogénea. En caso de fundidos, mantener a baño maría o sobre placa calefactora a temperatura controlada (ej. 50–60 °C) durante el proceso.</li>
          <li><b>Verificar la homogeneidad visual</b> de la tinta, asegurándose de que no haya grumos, zonas no dispersas ni fases separadas.</li>
          <li><b>Cargar la mezcla en una jeringa estéril y rotulada</b>, por succión o utilizando embudo, pipeta o espátula según la viscosidad de la tinta.</li>
          <li><b>En caso de usar múltiples tintas</b>, repetir el proceso para cada una y mantenerlas identificadas.</li>
          <li><b>Registrar los datos del lote</b>, incluyendo peso total, concentración final, fecha de elaboración, responsable y observaciones.</li>
        </ul>
      </div>

      <div className="mt-4">
        <table className="w-full border-collapse border border-black text-center">
          <thead>
            <tr>
              {['Nª REF', 'PRINCIPIO ACTIVO', 'PUREZA', 'Nº LOTE', 'CANTIDAD TEÓRICA', 'PESADA REAL'].map((h) => (
                <th key={h} className="border border-black p-1 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.materiasPrimas.map((m, i) => (
              <tr key={i}>
                <td className="border border-black p-1 font-bold">{m.ref}</td>
                <td className="border border-black p-1">{m.nombre}</td>
                <td className="border border-black p-1">{m.pureza || '-'}</td>
                <td className="border border-black p-1">{m.lote}</td>
                <td className="border border-black p-1">{m.cantidadTeorica} g</td>
                <td className="border border-black p-1">{m.pesadaReal}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 6 - r.materiasPrimas.length) }).map((_, i) => (
              <tr key={`v${i}`}>
                <td className="border border-black p-1 font-bold">{r.materiasPrimas.length + i + 1}</td>
                {[1, 2, 3, 4, 5].map((j) => <td key={j} className="border border-black p-1">&nbsp;</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <p className="mb-1 font-bold">DATOS DEL PROCESO:</p>
        <table className="w-full border-collapse border border-black text-center">
          <tbody>
            {[
              ['TEMPERATURA', r.proceso.temperatura, 'ºC'],
              ['TIEMPO DE MEZCLADO', r.proceso.tiempoMezclado, 'Min'],
              ['ORDEN DE AGREGADO DE COMPONENTES (SEGÚN Nº REFERENCIA)',
                r.materiasPrimas.length > 1 ? `1 a ${r.materiasPrimas.length}` : '1', ''],
              ['TIEMPO DE REPOSO', r.proceso.tiempoReposo, 'Min'],
              ['OTROS', r.proceso.otros, ''],
            ].map(([nombre, valor, unidad], i) => (
              <tr key={i}>
                <td className="border border-black p-1 text-left font-bold">{nombre}</td>
                <td className="border border-black p-1">{valor === '' || valor == null ? '-' : valor}</td>
                <td className="border border-black p-1">{unidad === '' ? '-' : unidad}</td>
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
              <tr><td className="border border-black p-1 text-left">Ausencia de material organoléptico</td>
                <td className="border border-black p-1">{r.controles.organoleptico ? 'X' : ''}</td>
                <td className="border border-black p-1">{r.controles.organoleptico ? '' : 'X'}</td></tr>
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

      <div className="mt-10 w-64">
        <div className="border-t border-black pt-1">
          <p className="font-bold">FIRMA DEL OPERADOR</p>
          <p>{r.operador}</p>
        </div>
      </div>
    </div>
  );
}
