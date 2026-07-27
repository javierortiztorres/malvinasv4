'use client';
import { useState } from 'react';
import type { Registro, RegistroPi } from '@/db/schema';
import { colorDeGrupo } from '@/lib/colors';
import { formatoLote, formatoLotePI, fechaAR, coincideFiltro } from '@/lib/utils';
import { limpiarNombreTinta, fmtPct } from '@/lib/engine';
import { generarRotulo } from '@/lib/rotulo';
import { SUCURSALES } from '@/lib/config';

export default function Terminados({
  registros,
  registrosPi,
  onCambio,
}: {
  registros: Registro[];
  registrosPi: RegistroPi[];
  onCambio: () => void;
}) {
  const [rotuloDe, setRotuloDe] = useState<Registro | null>(null);
  const [filtro, setFiltro] = useState('');

  const ptVisibles = registros.filter((r) =>
    coincideFiltro(
      filtro,
      r.paciente, r.medico, r.tituloFormula, r.indicacion, r.producto,
      formatoLote(r.lotePrefijo, r.loteNumero), r.fechaElab && fechaAR(r.fechaElab),
      (r.formula ?? []).map((a) => a.activo).join(' ')
    )
  );
  const piVisibles = registrosPi.filter((r) =>
    coincideFiltro(filtro, r.nombreProducto, r.operador, r.poe,
      formatoLotePI(r.poe, r.loteNumero), r.fechaElab && fechaAR(r.fechaElab))
  );
  const [sucursal, setSucursal] = useState(SUCURSALES[0].id);
  const [copiado, setCopiado] = useState(false);

  async function reabrir(url: string, r: any) {
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...r, estado: 'en_proceso' }),
    });
    onCambio();
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="space-y-6">
      <input className="input max-w-md" placeholder="🔍 Buscar por paciente, médico, lote, tinta, fecha…"
        value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      {/* -------- Producto terminado -------- */}
      <div>
        <h2 className="section-title">💊 Producto terminado{filtro && ` · ${ptVisibles.length} de ${registros.length}`}</h2>
        {registros.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Todavía no hay lotes de producto terminado.</div>
        ) : ptVisibles.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Ningún lote coincide con la búsqueda.</div>
        ) : (
          <div className="space-y-3">
            {ptVisibles.map((r) => {
              const color = colorDeGrupo(r.grupoPaciente || r.paciente);
              return (
                <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"
                  style={{ borderLeft: `6px solid ${color.border}` }}>
                  <div>
                    <p className="text-lg font-black uppercase leading-tight">{r.paciente}</p>
                    <p className="text-sm text-slate-600">
                      Fórmula {r.tituloFormula} · Lote <b>{formatoLote(r.lotePrefijo, r.loteNumero)}</b> ·
                      Elab {fechaAR(r.fechaElab)} · Vto {fechaAR(r.fechaVto)} ·
                      {' '}{r.capsulasTotales} cáps en {r.envases} envase{(r.envases ?? 0) !== 1 && 's'}
                      {r.capsulasPorToma > 1 && (
                        <span className="ml-2 badge bg-red-100 text-red-700">{r.capsulasPorToma} cáps/toma</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <a className="btn-primary" href={`/registro/${r.id}/print`} target="_blank">📄 Documento</a>
                    <button className="btn-ghost" onClick={() => setRotuloDe(r)}>🏷️ Rótulo</button>
                    <button className="btn-ghost" onClick={() => reabrir(`/api/registros/${r.id}`, r)}>↩ Reabrir</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* -------- Producto intermedio -------- */}
      <div>
        <h2 className="section-title">🧪 Producto intermedio{filtro && ` · ${piVisibles.length} de ${registrosPi.length}`}</h2>
        {registrosPi.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Todavía no hay lotes de producto intermedio.</div>
        ) : (
          <div className="space-y-3">
            {piVisibles.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 border-l-[6px] border-l-teal-600 p-4">
                <div>
                  <p className="text-lg font-black uppercase leading-tight">{limpiarNombreTinta(r.tintaNombre)}</p>
                  <p className="text-sm text-slate-600">
                    Lote <b>{formatoLotePI(r.poe, r.loteNumero)}</b>{r.concentracion ? <> · {fmtPct(r.concentracion)}</> : null} · {r.cantidadProductoG} g ·
                    {' '}{r.jeringas} jeringas de {r.volumenJeringaMl} ml ·
                    Elab {fechaAR(r.fechaElab)} · Vto {fechaAR(r.fechaVto)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a className="btn-primary" href={`/registro-pi/${r.id}/print`} target="_blank">📄 Documento</a>
                  <button className="btn-ghost" onClick={() => reabrir(`/api/registros-pi/${r.id}`, r)}>↩ Reabrir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* -------- Modal rótulo -------- */}
      {rotuloDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setRotuloDe(null)}>
          <div className="card w-full max-w-lg space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Rótulo — {rotuloDe.paciente}</h3>
              <button onClick={() => setRotuloDe(null)}>✕</button>
            </div>
            <div>
              <label className="label">Sucursal</label>
              <select className="input" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                {SUCURSALES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <textarea className="input min-h-[320px] font-mono text-xs" readOnly
              value={generarRotulo(rotuloDe, sucursal)} />
            <button className="btn-primary w-full" onClick={() => copiar(generarRotulo(rotuloDe, sucursal))}>
              {copiado ? '✔ Copiado' : '📋 Copiar para la rotuladora'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
