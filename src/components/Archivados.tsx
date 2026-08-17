'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Registro, RegistroPi } from '@/db/schema';
import { estadoPT, LABEL_ESTADO } from '@/lib/estadoPT';
import { coincideFiltro, formatoLote, formatoLotePI, fechaAR } from '@/lib/utils';
import { limpiarNombreTinta } from '@/lib/engine';
import { colorDeGrupo } from '@/lib/colors';

// 🗃️ Archivados (v2.1.3): el lugar donde viven los registros PT y los lotes
// de PI archivados — lo que antes era "Eliminar" ahora los manda acá, con
// todos sus datos y su número de lote intactos. No cuentan en estadísticas,
// necesidades ni agendas. Desarchivar (solo Admin, revalidado en el server)
// los devuelve a la solapa que les corresponde por su estado.
//
// La solapa hace su PROPIO fetch con ?archivados=1: el store global de
// page.tsx excluye archivados a propósito, así ninguna otra pantalla los ve.

function fechaHoraAR(v: Date | string | null): string {
  if (!v) return '';
  return new Date(v).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const LABEL_ESTADO_PI: Record<string, string> = {
  en_proceso: '🧪 En proceso',
  terminado: '✅ Terminado',
};

export default function Archivados({ rol, onCambio }: { rol?: string; onCambio: () => void }) {
  const [pt, setPt] = useState<Registro[]>([]);
  const [pi, setPi] = useState<RegistroPi[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(false);
      const [r, rpi] = await Promise.all([
        fetch('/api/registros?archivados=1').then((x) => (x.ok ? x.json() : Promise.reject(new Error()))),
        fetch('/api/registros-pi?archivados=1').then((x) => (x.ok ? x.json() : Promise.reject(new Error()))),
      ]);
      setPt(Array.isArray(r) ? r : []);
      setPi(Array.isArray(rpi) ? rpi : []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const puedeDesarchivar = rol === 'admin';

  async function desarchivar(tipo: 'pt' | 'pi', id: number, nombre: string) {
    if (!confirm(`¿Desarchivar ${nombre}?\n\nVuelve a aparecer en la solapa que le corresponde por su estado.`)) return;
    setTrabajando(`${tipo}-${id}`);
    try {
      const url = tipo === 'pt' ? `/api/registros/${id}/archivar` : `/api/registros-pi/${id}/archivar`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivado: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? 'No se pudo desarchivar. Probá de nuevo.');
        return;
      }
      await cargar();
      onCambio(); // refresca el store global: el registro vuelve a su solapa
    } finally {
      setTrabajando(null);
    }
  }

  const ptVisibles = pt.filter((r) =>
    coincideFiltro(
      filtro,
      r.paciente, r.medico, r.tituloFormula,
      formatoLote(r.lotePrefijo, r.loteNumero),
      r.archivadoPor ?? '',
      (r.formula ?? []).map((a) => a.activo).join(' ')
    )
  );
  const piVisibles = pi.filter((r) =>
    coincideFiltro(
      filtro,
      r.tintaNombre, r.nombreProducto, r.poe, r.operador,
      formatoLotePI(r.poe, r.loteNumero),
      r.archivadoPor ?? ''
    )
  );

  if (cargando) return <p className="text-slate-500">Cargando archivados…</p>;
  if (error)
    return (
      <div className="card p-8 text-center text-slate-500">
        No se pudieron cargar los archivados.{' '}
        <button className="font-semibold text-profundo hover:underline" onClick={() => { setCargando(true); cargar(); }}>
          Reintentar
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
        Acá viven los registros <b>archivados</b> (lo que antes era &ldquo;Eliminar&rdquo;). No cuentan en
        estadísticas, necesidades ni agendas, y su número de lote queda reservado — la numeración nunca se
        reutiliza. {puedeDesarchivar ? 'Desarchivar los devuelve a su solapa.' : 'Solo Admin puede desarchivar.'}
      </p>

      <input className="input max-w-md" placeholder="🔍 Buscar por paciente, tinta, lote, quién archivó…"
        value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      {/* -------- PT archivados -------- */}
      <div>
        <h2 className="section-title">💊 Producto terminado{filtro && ` · ${ptVisibles.length} de ${pt.length}`}</h2>
        {pt.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No hay registros de PT archivados.</div>
        ) : ptVisibles.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Ningún registro coincide con la búsqueda.</div>
        ) : (
          <div className="space-y-3">
            {ptVisibles.map((r) => {
              const color = colorDeGrupo(r.grupoPaciente || r.paciente);
              const est = estadoPT(r);
              return (
                <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4"
                  style={{ borderLeft: `6px solid ${color.border}` }}>
                  <div>
                    <p className="text-lg font-black uppercase leading-tight">{r.paciente || 'SIN NOMBRE'}</p>
                    <p className="text-sm text-slate-600">
                      {r.tituloFormula && <>Fórmula {r.tituloFormula} · </>}
                      Lote <b>{formatoLote(r.lotePrefijo, r.loteNumero)}</b> · Estaba en {LABEL_ESTADO[est]}
                      {r.fechaElab && <> · Elab {fechaAR(r.fechaElab)}</>}
                    </p>
                    <p className="text-xs text-slate-500">
                      🗃️ Archivado el {fechaHoraAR(r.archivadoEn)}{r.archivadoPor && <> por {r.archivadoPor}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {est === 'terminado' && (
                      <a className="text-sm font-semibold text-profundo hover:underline" target="_blank"
                        href={`/registro/${r.id}/print`}>📄 Documento</a>
                    )}
                    {puedeDesarchivar && (
                      <button
                        className="rounded-xl bg-profundo px-4 py-2 text-sm font-semibold text-hueso hover:opacity-90 disabled:opacity-50"
                        disabled={trabajando === `pt-${r.id}`}
                        onClick={() => desarchivar('pt', r.id, `el registro de ${r.paciente || 'este paciente'}`)}>
                        {trabajando === `pt-${r.id}` ? '…' : '↩️ Desarchivar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* -------- PI archivados -------- */}
      <div>
        <h2 className="section-title">🧪 Producto intermedio{filtro && ` · ${piVisibles.length} de ${pi.length}`}</h2>
        {pi.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">No hay lotes de PI archivados.</div>
        ) : piVisibles.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Ningún lote coincide con la búsqueda.</div>
        ) : (
          <div className="space-y-3">
            {piVisibles.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-lg font-black uppercase leading-tight">
                    {limpiarNombreTinta(r.tintaNombre) || r.nombreProducto || 'Lote PI'}
                  </p>
                  <p className="text-sm text-slate-600">
                    Lote <b>{formatoLotePI(r.poe, r.loteNumero)}</b> · Estaba en {LABEL_ESTADO_PI[r.estado] ?? r.estado}
                    {r.fechaElab && <> · Elab {fechaAR(r.fechaElab)}</>}
                  </p>
                  <p className="text-xs text-slate-500">
                    🗃️ Archivado el {fechaHoraAR(r.archivadoEn)}{r.archivadoPor && <> por {r.archivadoPor}</>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.estado === 'terminado' && (
                    <a className="text-sm font-semibold text-profundo hover:underline" target="_blank"
                      href={`/registro-pi/${r.id}/print`}>📄 Documento</a>
                  )}
                  {puedeDesarchivar && (
                    <button
                      className="rounded-xl bg-profundo px-4 py-2 text-sm font-semibold text-hueso hover:opacity-90 disabled:opacity-50"
                      disabled={trabajando === `pi-${r.id}`}
                      onClick={() => desarchivar('pi', r.id, `el lote ${formatoLotePI(r.poe, r.loteNumero)} de ${limpiarNombreTinta(r.tintaNombre) || r.nombreProducto}`)}>
                      {trabajando === `pi-${r.id}` ? '…' : '↩️ Desarchivar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
