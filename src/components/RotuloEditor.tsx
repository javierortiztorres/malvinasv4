'use client';
import { useState, useMemo } from 'react';
import type { DatosRotulo, RotuloOverrides } from '@/lib/rotulo';
import { ddlDesdeDatos, tipoRotuloPorCaps } from '@/lib/rotulo';

type Props = {
  id: number;
  paciente: string;
  lote: string;
  datosBase: DatosRotulo;
  overridesIniciales: RotuloOverrides | null;
  tipoAuto: 'chico' | 'grande';
  tipoUrl?: 'chico' | 'grande';
};

export default function RotuloEditor({
  id, paciente, lote, datosBase, overridesIniciales, tipoAuto, tipoUrl,
}: Props) {
  const [ovr, setOvr] = useState<RotuloOverrides>(overridesIniciales ?? {});
  const [tipo, setTipo] = useState<'chico' | 'grande'>(tipoUrl ?? overridesIniciales?.tipo ?? tipoAuto);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const datos = useMemo((): DatosRotulo => ({
    ...datosBase,
    titulo: ovr.titulo ?? datosBase.titulo,
    indicacion: ovr.indicacion ?? datosBase.indicacion,
    composicion: ovr.composicion ?? datosBase.composicion,
  }), [datosBase, ovr]);

  const ddlUri = useMemo(() => {
    const xml = ddlDesdeDatos(datos, tipo);
    return `data:application/xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }, [datos, tipo]);

  const tienePersonalizacion = !!(
    ovr.titulo != null || ovr.indicacion != null || ovr.composicion != null || ovr.tipo != null
  );

  async function guardar() {
    setGuardando(true);
    setMsg('');
    try {
      const res = await fetch(`/api/registros/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotuloOverrides: { ...ovr, tipo } }),
      });
      setMsg(res.ok ? '✔ Personalización guardada' : '✘ Error al guardar');
    } catch {
      setMsg('✘ Error de red');
    } finally {
      setGuardando(false);
    }
  }

  async function resetear() {
    if (!confirm('¿Borrar personalización y volver al texto automático?')) return;
    const res = await fetch(`/api/registros/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotuloOverrides: null }),
    });
    if (res.ok) {
      setOvr({});
      setTipo(tipoAuto);
      setMsg('✔ Restablecido');
    } else {
      setMsg('✘ Error al restablecer');
    }
  }

  const comp = ovr.composicion ?? datosBase.composicion;

  const esGrande = tipo === 'grande';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #f4f5f7; }
        .toolbar {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
          padding: 10px 16px; background: #fff; border-bottom: 1px solid #d0d5dd;
          position: sticky; top: 0; z-index: 10;
        }
        .pedido-info {
          font-family: 'JetBrains Mono', monospace; font-size: 13px;
          background: #f2f4f7; padding: 4px 10px; border-radius: 6px;
        }
        .btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px; font-size: 13px; font-weight: 500; border-radius: 8px;
          border: 1px solid transparent; cursor: pointer; text-decoration: none;
          background: #1d2939; color: #fff;
        }
        .btn:hover { background: #344054; }
        .btn-outline { background: transparent; color: #1d2939; border-color: #98a2b3; }
        .btn-outline:hover { background: #f2f4f7; }
        .btn-active { background: #344054; color: #fff; }
        .btn-edit { background: #f9f5ff; color: #6941c6; border-color: #d6bbfb; }
        .btn-edit:hover { background: #f4ebff; }
        .btn-edit.activo { background: #6941c6; color: #fff; border-color: transparent; }
        .btn-guardar { background: #027a48; color: #fff; }
        .btn-guardar:hover { background: #05603a; }
        .btn-reset { background: transparent; color: #b42318; border-color: #fda29b; font-size: 12px; }
        .btn-reset:hover { background: #fff1f3; }
        .msg { font-size: 12px; color: #344054; }
        .formato-label { font-size: 12px; color: #667085; font-weight: 500; }

        /* ── Panel editor ── */
        .editor-panel {
          background: #fff; border-bottom: 1px solid #e4e7ec;
          padding: 16px 20px; display: flex; flex-wrap: wrap; gap: 16px;
        }
        .editor-group { display: flex; flex-direction: column; gap: 4px; flex: 1 1 220px; }
        .editor-label { font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .05em; color: #667085; }
        .editor-input {
          width: 100%; padding: 6px 10px; border: 1px solid #d0d5dd; border-radius: 8px;
          font-size: 13px; font-family: inherit; resize: vertical; line-height: 1.4;
          background: #f9fafb;
        }
        .editor-input:focus { outline: 2px solid #7f56d9; border-color: transparent; background: #fff; }
        .comp-item { display: flex; gap: 6px; align-items: center; }
        .comp-item input { flex: 1; }
        .btn-rm { background: none; border: none; color: #b42318; cursor: pointer; font-size: 15px;
          padding: 0 4px; line-height: 1; }
        .btn-add { font-size: 12px; color: #6941c6; background: none; border: none;
          cursor: pointer; padding: 4px 0; text-align: left; }
        .btn-add:hover { text-decoration: underline; }
        .editor-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 12px 20px; background: #f9fafb; border-bottom: 1px solid #e4e7ec; }

        /* ── Preview ── */
        .wrapper-etiqueta {
          display: flex; justify-content: center; overflow-x: auto;
          padding: 50px 20px; min-height: 400px;
        }
        .rotulo {
          width: 32mm; height: 64mm; flex-shrink: 0;
          background: #fff; border: 1px dashed #98a2b3;
          display: flex; flex-direction: column; overflow: hidden;
          transform: scale(3); transform-origin: top center;
          font-family: Arial, Helvetica, sans-serif; line-height: 1.2; color: #111;
        }
        .rotulo .row { padding: 0.7mm; overflow: hidden; border-bottom: 0.15mm solid #555; }
        .rotulo .row:last-child { border-bottom: none; }
        .row-titulo      { flex: 0 0 10mm; }
        .row-medico      { flex: 0 0 10mm; }
        .row-composicion { flex: 1 1 0; }
        .row-indicacion  { flex: 0 0 7mm; }
        .row-farmacia    { flex: 0 0 7mm; }
        .row-regulatoria { flex: 0 0 10mm; }
        .txt-titulo { font-family: 'Arial Black', Arial, sans-serif; font-weight: 900;
          font-size: 7pt; line-height: 1.1; white-space: pre-line; word-break: break-word; }
        .txt-medico { font-weight: 700; font-size: 5pt; white-space: pre-line; word-break: break-word; }
        .txt-composicion { font-size: 5pt; line-height: 1.15; word-break: break-word; }
        .txt-composicion .comp-header { font-weight: 700; }
        .txt-indicacion { font-size: 5pt; line-height: 1.15; word-break: break-word; }
        .txt-farmacia { font-weight: 700; font-size: 5pt; white-space: pre-line; word-break: break-word; }
        .txt-regulatoria { font-size: 4.2pt; line-height: 1.25; word-break: break-word; white-space: pre-line; }

        /* ── Rótulo grande apaisado 100×60mm ──
           Layout: título centrado arriba (ancho completo) /
           col izq (0-50mm): médico+paciente · farmacia+lote+fechas /
           col der (50-100mm): composición · indicación              */
        .rotulo-grande {
          width: 100mm; height: 60mm; flex-shrink: 0;
          background: #fff; border: 1px dashed #98a2b3;
          display: flex; flex-direction: column; overflow: hidden;
          transform: scale(2); transform-origin: top center;
          font-family: Arial, Helvetica, sans-serif; line-height: 1.2; color: #111;
        }
        .rg-titulo {
          flex: 0 0 12mm; border-bottom: 0.15mm solid #555;
          display: flex; align-items: center; justify-content: center;
          padding: 0.7mm; overflow: hidden;
        }
        .rg-cuerpo { flex: 1 1 0; display: flex; flex-direction: row; overflow: hidden; }
        .col-izq {
          flex: 0 0 50mm; border-right: 0.15mm solid #555;
          display: flex; flex-direction: column; overflow: hidden;
        }
        .col-der { flex: 1 1 0; display: flex; flex-direction: column; overflow: hidden; }
        .col-izq .row, .col-der .row {
          padding: 0.7mm; overflow: hidden; border-bottom: 0.15mm solid #555;
        }
        .col-izq .row:last-child, .col-der .row:last-child { border-bottom: none; }
        .row-g-medico      { flex: 0 0 13mm; }
        .row-g-regulatoria { flex: 1 1 0; }
        .row-g-composicion { flex: 1 1 0; }
        .row-g-indicacion  { flex: 0 0 11mm; }
        .txt-g-titulo { font-family: 'Arial Black', Arial, sans-serif; font-weight: 900;
          font-size: 10pt; line-height: 1.1; white-space: pre-line; word-break: break-word; text-align: center; }
        .txt-g-medico { font-weight: 700; font-size: 7pt; white-space: pre-line; word-break: break-word; }
        .txt-g-regulatoria { font-size: 4.5pt; line-height: 1.25; word-break: break-word; white-space: pre-line; }
        .txt-g-composicion { font-size: 6pt; line-height: 1.2; word-break: break-word; }
        .txt-g-composicion .comp-header { font-weight: 700; }
        .txt-g-indicacion { font-size: 6.5pt; font-weight: 700; line-height: 1.2; word-break: break-word; }

        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          .wrapper-etiqueta { padding: 0; min-height: 0; display: block; overflow: visible; }
          .rotulo, .rotulo-grande { border: none !important; transform: none !important; margin: 0; }
        }
      `}} />

      {/* Toolbar */}
      <div className="no-print toolbar">
        <button className="btn btn-outline" onClick={() => history.back()}>← Volver</button>
        <span className="pedido-info">{paciente} — {lote}</span>
        <div style={{ flex: 1 }} />
        {tienePersonalizacion && (
          <span className="msg">✏ Personalizado</span>
        )}
        <span className="formato-label">Formato:</span>
        <button
          className={`btn ${tipo === 'chico' ? 'btn-active' : 'btn-outline'}`}
          onClick={() => setTipo('chico')}
        >
          📏 Chico (32×64){tipoAuto === 'chico' ? ' ★' : ''}
        </button>
        <button
          className={`btn ${tipo === 'grande' ? 'btn-active' : 'btn-outline'}`}
          onClick={() => setTipo('grande')}
        >
          📐 Grande (100×60){tipoAuto === 'grande' ? ' ★' : ''}
        </button>
        <button
          className={`btn btn-edit${editando ? ' activo' : ''}`}
          onClick={() => setEditando((v) => !v)}
        >
          ✏ {editando ? 'Cerrar editor' : 'Editar rótulo'}
        </button>
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
        <a className="btn btn-outline" href={ddlUri} download={`rotulo-${lote}-${tipo}.ddl`}>
          Descargar .ddl
        </a>
      </div>

      {/* Panel de edición */}
      {editando && (
        <>
          <div className="no-print editor-panel">
            {/* Título */}
            <div className="editor-group" style={{ flex: '0 0 260px' }}>
              <label className="editor-label">Título</label>
              <textarea
                className="editor-input"
                rows={3}
                value={ovr.titulo ?? datosBase.titulo}
                onChange={(e) => setOvr((o) => ({ ...o, titulo: e.target.value }))}
              />
              {ovr.titulo != null && ovr.titulo !== datosBase.titulo && (
                <button className="btn-add" onClick={() => setOvr((o) => { const n = { ...o }; delete n.titulo; return n; })}>
                  ↺ Restaurar automático
                </button>
              )}
            </div>

            {/* Indicación */}
            <div className="editor-group" style={{ flex: '0 0 260px' }}>
              <label className="editor-label">Indicación</label>
              <textarea
                className="editor-input"
                rows={3}
                value={ovr.indicacion ?? datosBase.indicacion}
                onChange={(e) => setOvr((o) => ({ ...o, indicacion: e.target.value }))}
              />
              {ovr.indicacion != null && ovr.indicacion !== datosBase.indicacion && (
                <button className="btn-add" onClick={() => setOvr((o) => { const n = { ...o }; delete n.indicacion; return n; })}>
                  ↺ Restaurar automático
                </button>
              )}
            </div>

            {/* Composición */}
            <div className="editor-group" style={{ flex: '1 1 300px' }}>
              <label className="editor-label">Composición</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {comp.map((item, i) => (
                  <div key={i} className="comp-item">
                    <input
                      className="editor-input"
                      style={{ resize: 'none' }}
                      value={item}
                      onChange={(e) => {
                        const next = [...comp];
                        next[i] = e.target.value;
                        setOvr((o) => ({ ...o, composicion: next }));
                      }}
                    />
                    <button
                      className="btn-rm"
                      title="Eliminar línea"
                      onClick={() => setOvr((o) => ({ ...o, composicion: comp.filter((_, j) => j !== i) }))}
                    >✕</button>
                  </div>
                ))}
                <button
                  className="btn-add"
                  onClick={() => setOvr((o) => ({ ...o, composicion: [...comp, ''] }))}
                >
                  + Agregar línea
                </button>
                {ovr.composicion != null && (
                  <button className="btn-add" onClick={() => setOvr((o) => { const n = { ...o }; delete n.composicion; return n; })}>
                    ↺ Restaurar automático
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Acciones de guardado */}
          <div className="no-print editor-actions">
            <button className="btn btn-guardar" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : '💾 Guardar personalización'}
            </button>
            {tienePersonalizacion && (
              <button className="btn btn-reset" onClick={resetear}>
                ↺ Resetear a automático
              </button>
            )}
            {msg && <span className="msg">{msg}</span>}
          </div>
        </>
      )}

      {/* Preview del rótulo */}
      <div className="wrapper-etiqueta">
        {esGrande ? (
          <div className="rotulo-grande">
            {/* Título — ancho completo */}
            <div className="rg-titulo">
              <div className="txt-g-titulo">{datos.titulo}</div>
            </div>
            <div className="rg-cuerpo">
              {/* Columna izquierda: médico/paciente + farmacia+lote+fechas */}
              <div className="col-izq">
                <div className="row row-g-medico">
                  <div className="txt-g-medico">{datos.medicoPaciente}</div>
                </div>
                <div className="row row-g-regulatoria">
                  <div className="txt-g-regulatoria">{datos.farmacia}{'\n'}{datos.regulatoria}</div>
                </div>
              </div>
              {/* Columna derecha: composición + indicación */}
              <div className="col-der">
                <div className="row row-g-composicion">
                  <div className="txt-g-composicion">
                    <div className="comp-header">Composicion:</div>
                    {datos.composicion.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
                <div className="row row-g-indicacion">
                  <div className="txt-g-indicacion">{datos.indicacion}</div>
                </div>
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
                {datos.composicion.map((l, i) => <div key={i}>{l}</div>)}
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
    </>
  );
}
