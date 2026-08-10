'use client';
import { useState } from 'react';
import type { Registro, RegistroPi } from '@/db/schema';
import { colorDeGrupo } from '@/lib/colors';
import { formatoLote, formatoLotePI, fechaAR, coincideFiltro, fmtPctOpcional } from '@/lib/utils';
import { limpiarNombreTinta } from '@/lib/engine';
import { generarRotulo } from '@/lib/rotulo';
import { SUCURSALES } from '@/lib/config';
import { useCerrarModal } from '@/hooks/useCerrarModal';

// Orden por fecha de TERMINACIÓN: fechaHoraFin (formato datetime-local, ordena
// bien como texto/timestamp) → fechaElab → createdAt, en ese orden de preferencia.
function claveTerminacion(r: { fechaHoraFin: string; fechaElab: string; createdAt: Date | string }): number {
  return new Date(r.fechaHoraFin || r.fechaElab || r.createdAt).getTime();
}

// Orden de PT: por lote_prefijo (alfabético) y dentro de cada prefijo por
// loteNumero DESCENDENTE (el lote más alto arriba). Sin número, al final.
function claveLotePT(a: Registro, b: Registro): number {
  const porPrefijo = a.lotePrefijo.localeCompare(b.lotePrefijo);
  if (porPrefijo !== 0) return porPrefijo;
  if (a.loteNumero == null && b.loteNumero == null) return 0;
  if (a.loteNumero == null) return 1;
  if (b.loteNumero == null) return -1;
  return b.loteNumero - a.loteNumero;
}

// Huecos en la numeración de lote por prefijo, entre el mínimo y el máximo
// de los TERMINADOS (registros ya viene filtrado a estado='terminado' desde
// el padre). Solo informativo, no bloquea nada.
function loteosSalteados(registros: Registro[]): Record<string, number[]> {
  const porPrefijo = new Map<string, number[]>();
  for (const r of registros) {
    if (r.loteNumero == null) continue;
    porPrefijo.set(r.lotePrefijo, [...(porPrefijo.get(r.lotePrefijo) ?? []), r.loteNumero]);
  }
  const resultado: Record<string, number[]> = {};
  for (const [prefijo, numeros] of Array.from(porPrefijo)) {
    const presentes = new Set(numeros);
    const min = Math.min(...numeros);
    const max = Math.max(...numeros);
    const faltantes: number[] = [];
    for (let n = min; n <= max; n++) {
      if (!presentes.has(n)) faltantes.push(n);
    }
    if (faltantes.length > 0) resultado[prefijo] = faltantes;
  }
  return resultado;
}

export default function Terminados({
  registros,
  registrosPi,
  onCambio,
  mostrarPT = true,
  mostrarPI = true,
}: {
  registros: Registro[];
  registrosPi: RegistroPi[];
  onCambio: () => void;
  // B-30b: Impresión ve solo PT, Formulación ve solo PI.
  mostrarPT?: boolean;
  mostrarPI?: boolean;
}) {
  const [rotuloDe, setRotuloDe] = useState<Registro | null>(null);
  const [filtro, setFiltro] = useState('');
  const [filtroPi, setFiltroPi] = useState('');
  // Solo Escape cierra desde el hook: el click/arrastre en el fondo NUNCA cierra (B-22).
  useCerrarModal(() => setRotuloDe(null), rotuloDe !== null);

  const ptVisibles = [...registros]
    .sort(claveLotePT)
    .filter((r) =>
      coincideFiltro(
        filtro,
        r.paciente, r.medico, r.tituloFormula, r.indicacion, r.producto,
        formatoLote(r.lotePrefijo, r.loteNumero), r.fechaElab && fechaAR(r.fechaElab),
        (r.formula ?? []).map((a) => a.activo).join(' ')
      )
    );
  const piVisibles = [...registrosPi]
    .sort((a, b) => claveTerminacion(b) - claveTerminacion(a))
    .filter((r) =>
      coincideFiltro(filtroPi, r.tintaNombre, r.nombreProducto, r.operador, r.poe,
        formatoLotePI(r.poe, r.loteNumero), r.fechaElab && fechaAR(r.fechaElab))
    );
  const salteadosPT = loteosSalteados(registros);
  const [sucursal, setSucursal] = useState(SUCURSALES[0].id);
  const [copiado, setCopiado] = useState(false);

  // Reabrir un PT vuelve siempre a "En producción" (de ahí sale el único
  // camino a Terminado); un PI vuelve a su único estado previo, en_proceso.
  async function reabrir(url: string, r: any, esPT: boolean) {
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        esPT ? { ...r, estado: 'en_produccion', enProduccion: true } : { ...r, estado: 'en_proceso' }
      ),
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
      {mostrarPT && (
        <input className="input max-w-md" placeholder="🔍 Buscar por paciente, médico, lote, tinta, fecha…"
          value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      )}

      {/* -------- Producto terminado -------- */}
      {mostrarPT && (
      <div>
        <h2 className="section-title">💊 Producto terminado{filtro && ` · ${ptVisibles.length} de ${registros.length}`}</h2>
        {Object.entries(salteadosPT).map(([prefijo, numeros]) => {
          const mostrados = numeros.slice(0, 15).map((n) => `P${String(n).padStart(3, '0')}`).join(', ');
          const resto = numeros.length - 15;
          return (
            <p key={prefijo} className="mb-2 rounded bg-amber-100 px-3 py-2 text-sm text-amber-800">
              ⚠ Números salteados en {prefijo}: {mostrados}{resto > 0 && `, … y ${resto} más`}
            </p>
          );
        })}
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
                    <a className="btn-ghost" href={`/registro/${r.id}/rotulo`} target="_blank">🏷️ Rótulo</a>
                    <button className="btn-ghost" onClick={() => setRotuloDe(r)}>📋 Copiar rótulo</button>
                    <button className="btn-ghost" onClick={() => reabrir(`/api/registros/${r.id}`, r, true)}>↩ Reabrir</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* -------- Producto intermedio -------- */}
      {mostrarPI && (
      <div>
        <h2 className="section-title">🧪 Producto intermedio{filtroPi && ` · ${piVisibles.length} de ${registrosPi.length}`}</h2>
        <input className="input mb-3 max-w-md" placeholder="🔍 Buscar por tinta, producto o lote…"
          value={filtroPi} onChange={(e) => setFiltroPi(e.target.value)} />
        {registrosPi.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Todavía no hay lotes de producto intermedio.</div>
        ) : piVisibles.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Ningún lote de PI coincide con la búsqueda.</div>
        ) : (
          <div className="space-y-3">
            {piVisibles.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 border-l-[6px] border-l-profundo p-4">
                <div>
                  <p className="text-lg font-black uppercase leading-tight">
                    {limpiarNombreTinta(r.tintaNombre)}
                    {fmtPctOpcional(r.concentracion) && (
                      <span className="ml-2 text-sm font-bold text-slate-500">
                        · {fmtPctOpcional(r.concentracion)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    Lote <b>{formatoLotePI(r.poe, r.loteNumero)}</b> · {r.cantidadProductoG} g ·
                    {' '}{r.jeringas} jeringas de {r.volumenJeringaMl} ml ·
                    Elab {fechaAR(r.fechaElab)} · Vto {fechaAR(r.fechaVto)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a className="btn-primary" href={`/registro-pi/${r.id}/print`} target="_blank">📄 Documento</a>
                  <button className="btn-ghost" onClick={() => reabrir(`/api/registros-pi/${r.id}`, r, false)}>↩ Reabrir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* -------- Modal rótulo -------- */}
      {rotuloDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:p-12">
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
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setRotuloDe(null)}>Cancelar</button>
              <button className="btn-primary flex-1" onClick={() => copiar(generarRotulo(rotuloDe, sucursal))}>
                {copiado ? '✔ Copiado' : '📋 Copiar para la rotuladora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
