import { db } from '@/db';
import { registros } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { armarDatosRotulo, generarDdl, tipoRotuloPorCaps } from '@/lib/rotulo';
import { formatoLote } from '@/lib/utils';

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
  const tipo =
    searchParams?.tipo === 'grande' || searchParams?.tipo === 'chico'
      ? (searchParams.tipo as 'grande' | 'chico')
      : tipoAuto;

  const datos = armarDatosRotulo(r);
  const lote = formatoLote(r.lotePrefijo, r.loteNumero);
  const ddlXml = generarDdl(r, undefined, tipo);
  const ddlUri = `data:application/xml;charset=utf-8,${encodeURIComponent(ddlXml)}`;
  const baseUrl = `/registro/${params.id}/rotulo`;

  const esGrande = tipo === 'grande';

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
        .btn-active { background: #344054; color: #fff; border-color: transparent; }
        .formato-label { font-size: 12px; color: #667085; font-weight: 500; }
        .wrapper-etiqueta {
          display: flex; justify-content: center; overflow-x: auto;
          padding: 50px 20px; min-height: 500px;
        }

        /* ── Rótulo chico vertical 32×64mm ── */
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

        /* ── Rótulo grande apaisado 100×60mm ── */
        .rotulo-grande {
          width: 100mm; height: 60mm; flex-shrink: 0;
          background: #fff; border: 1px dashed #98a2b3;
          display: flex; flex-direction: row; overflow: hidden;
          transform: scale(2); transform-origin: top center;
          font-family: Arial, Helvetica, sans-serif; line-height: 1.2; color: #111;
        }
        .rotulo-grande .col {
          display: flex; flex-direction: column; overflow: hidden;
          border-right: 0.15mm solid #555;
        }
        .rotulo-grande .col:last-child { border-right: none; }
        .rotulo-grande .row {
          padding: 0.7mm; overflow: hidden;
          border-bottom: 0.15mm solid #555;
        }
        .rotulo-grande .row:last-child { border-bottom: none; }
        .col-izq { flex: 0 0 49mm; }
        .col-der { flex: 1 1 0; }
        .row-g-titulo      { flex: 0 0 10mm; }
        .row-g-medico      { flex: 0 0 12mm; }
        .row-g-composicion { flex: 1 1 0; }
        .row-g-indicacion  { flex: 0 0 12mm; }
        .row-g-farmacia    { flex: 0 0 10mm; }
        .row-g-regulatoria { flex: 1 1 0; }
        .txt-g-titulo {
          font-family: 'Arial Black', Arial, sans-serif; font-weight: 900;
          font-size: 8pt; line-height: 1.1; white-space: pre-line; word-break: break-word;
        }
        .txt-g-medico { font-weight: 700; font-size: 5.5pt; white-space: pre-line; word-break: break-word; }
        .txt-g-composicion { font-size: 5pt; line-height: 1.2; word-break: break-word; }
        .txt-g-composicion .comp-header { font-weight: 700; }
        .txt-g-indicacion { font-size: 5.5pt; line-height: 1.2; word-break: break-word; }
        .txt-g-farmacia { font-weight: 700; font-size: 5.5pt; white-space: pre-line; word-break: break-word; }
        .txt-g-regulatoria { font-size: 4.5pt; line-height: 1.25; word-break: break-word; white-space: pre-line; }

        @page { size: ${esGrande ? '100mm 60mm' : '32mm 64mm'}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          .wrapper-etiqueta { padding: 0; min-height: 0; display: block; overflow: visible; }
          .rotulo, .rotulo-grande { border: none !important; transform: none !important; margin: 0; }
        }
      `}</style>

      <div className="no-print toolbar">
        <button id="btn-volver" className="btn btn-outline">← Volver</button>
        <span className="pedido-info">{r.paciente} — {lote}</span>
        <div style={{ flex: 1 }} />
        <span className="formato-label">Formato:</span>
        <a
          href={`${baseUrl}?tipo=chico`}
          className={`btn ${tipo === 'chico' ? 'btn-active' : 'btn-outline'}`}
        >
          📏 Chico (32×64){tipoAuto === 'chico' ? ' ★' : ''}
        </a>
        <a
          href={`${baseUrl}?tipo=grande`}
          className={`btn ${tipo === 'grande' ? 'btn-active' : 'btn-outline'}`}
        >
          📐 Grande (100×60){tipoAuto === 'grande' ? ' ★' : ''}
        </a>
        <button id="btn-imprimir" className="btn">Imprimir</button>
        <a className="btn btn-outline" href={ddlUri} download={`rotulo-${lote}-${tipo}.ddl`}>
          Descargar .ddl
        </a>
      </div>

      <div className="wrapper-etiqueta">
        {esGrande ? (
          <div className="rotulo-grande">
            <div className="col col-izq">
              <div className="row row-g-titulo">
                <div className="txt-g-titulo">{datos.titulo}</div>
              </div>
              <div className="row row-g-medico">
                <div className="txt-g-medico">{datos.medicoPaciente}</div>
              </div>
              <div className="row row-g-composicion">
                <div className="txt-g-composicion">
                  <div className="comp-header">Composicion:</div>
                  {datos.composicion.map((linea, i) => <div key={i}>{linea}</div>)}
                </div>
              </div>
            </div>
            <div className="col col-der">
              <div className="row row-g-indicacion">
                <div className="txt-g-indicacion">{datos.indicacion}</div>
              </div>
              <div className="row row-g-farmacia">
                <div className="txt-g-farmacia">{datos.farmacia}</div>
              </div>
              <div className="row row-g-regulatoria">
                <div className="txt-g-regulatoria">{datos.regulatoria}</div>
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('btn-volver').addEventListener('click', () => history.back());
        document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
      `}} />
    </>
  );
}
