import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { armarDatosRotulo, generarDdl } from '@/lib/rotulo';
import { formatoLote } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RotuloPage({ params }: { params: { id: string } }) {
  const [r] = await db.select().from(registros).where(eq(registros.id, Number(params.id)));
  if (!r) return <p style={{ padding: '2rem' }}>Registro no encontrado.</p>;

  const datos = armarDatosRotulo(r);
  const lote = formatoLote(r.lotePrefijo, r.loteNumero);
  const ddlXml = generarDdl(r);
  const ddlUri = `data:application/xml;charset=utf-8,${encodeURIComponent(ddlXml)}`;

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #f4f5f7; }
        .toolbar {
          display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
          padding: 12px 20px; background: #fff; border-bottom: 1px solid #d0d5dd;
          position: sticky; top: 0; z-index: 10;
        }
        .pedido-info {
          font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 13px;
          background: #f2f4f7; padding: 4px 10px; border-radius: 6px;
        }
        .btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 16px; font-size: 13px; font-weight: 500; border-radius: 8px;
          border: 1px solid transparent; cursor: pointer; text-decoration: none;
          background: #1d2939; color: #fff;
        }
        .btn:hover { background: #344054; }
        .btn-outline { background: transparent; color: #1d2939; border-color: #98a2b3; }
        .btn-outline:hover { background: #f2f4f7; }
        .wrapper-etiqueta {
          display: flex; justify-content: center;
          padding: 50px 20px; min-height: 660px;
        }
        .rotulo {
          width: 32mm; height: 64mm; flex-shrink: 0;
          background: #fff; border: 1px dashed #98a2b3;
          display: flex; flex-direction: column; overflow: hidden;
          transform: scale(3); transform-origin: top center;
          font-family: Arial, Helvetica, sans-serif; line-height: 1.2; color: #111;
        }
        .rotulo .row {
          padding: 0.7mm; overflow: hidden;
          border-bottom: 0.15mm solid #555;
        }
        .rotulo .row:last-child { border-bottom: none; }
        .row-titulo      { flex: 0 0 10mm; }
        .row-medico      { flex: 0 0 10mm; }
        .row-composicion { flex: 1 1 0; }
        .row-indicacion  { flex: 0 0 7mm; }
        .row-farmacia    { flex: 0 0 7mm; }
        .row-regulatoria { flex: 0 0 10mm; }
        .txt-titulo {
          font-family: 'Arial Black', Arial, sans-serif; font-weight: 900;
          font-size: 7pt; line-height: 1.1; white-space: pre-line; word-break: break-word;
        }
        .txt-medico { font-weight: 700; font-size: 5pt; white-space: pre-line; word-break: break-word; }
        .txt-composicion { font-size: 5pt; line-height: 1.15; word-break: break-word; }
        .txt-composicion .comp-header { font-weight: 700; }
        .txt-indicacion { font-size: 5pt; line-height: 1.15; word-break: break-word; }
        .txt-farmacia { font-weight: 700; font-size: 5pt; white-space: pre-line; word-break: break-word; }
        .txt-regulatoria { font-size: 4.2pt; line-height: 1.25; word-break: break-word; white-space: pre-line; }
        @page { size: 32mm 64mm; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          .wrapper-etiqueta { padding: 0; min-height: 0; display: block; overflow: visible; }
          .rotulo { border: none !important; transform: none !important; margin: 0; }
        }
      `}</style>

      <div className="no-print toolbar">
        <button id="btn-volver" className="btn btn-outline">← Volver</button>
        <span className="pedido-info">{r.paciente} — {lote}</span>
        <div style={{ flex: 1 }} />
        <button id="btn-imprimir" className="btn">Imprimir</button>
        <a className="btn btn-outline" href={ddlUri} download={`rotulo-${lote}.ddl`}>
          Descargar .ddl
        </a>
      </div>

      <div className="wrapper-etiqueta">
        <div className="rotulo">
          <div className="row row-titulo">
            <div className="txt-titulo">{datos.titulo}</div>
          </div>
          <div className="row row-medico">
            <div className="txt-medico">{datos.medicoPaciente}</div>
          </div>
          <div className="row row-composicion">
            <div className="txt-composicion">
              <div className="comp-header">Composicion:</div>
              {datos.composicion.map((linea, i) => <div key={i}>{linea}</div>)}
            </div>
          </div>
          <div className="row row-indicacion">
            <div className="txt-indicacion">{datos.indicacion}</div>
          </div>
          <div className="row row-farmacia">
            <div className="txt-farmacia">{datos.farmacia}</div>
          </div>
          <div className="row row-regulatoria">
            <div className="txt-regulatoria">{datos.regulatoria}</div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('btn-volver').addEventListener('click', () => history.back());
        document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
      `}} />
    </>
  );
}
