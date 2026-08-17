'use client';
import { useMemo, useState } from 'react';
import type { Registro } from '@/db/schema';
import Agenda, { type EventoAgenda } from '@/components/Agenda';
import { colorDeGrupo } from '@/lib/colors';
import { fechaAR } from '@/lib/utils';
import { estadoPT, LABEL_ESTADO } from '@/lib/estadoPT';
import { estadoGrupoAC, CLASE_AC, LABEL_AC, mensajeSeguimiento, type EstadoEntregaAC } from '@/lib/cotizador';

// =====================================================================
// AGENDA DE ATENCIÓN AL CLIENTE (pedida por Tomi, 10-ago): el mismo
// calendario de siempre pero por PEDIDO (el grupo de fórmulas de una
// receta) y coloreado por estado de ENTREGA, no por urgencia:
//   🔴 pendientes · 🟡 pre-producción/producción · 🟢 terminado ·
//   🔵 entregado (lo marca Atención acá) · ⚪ no se puede producir.
// Al click se abre el panel del pedido: estado de cada fórmula, marcar
// entregado / deshacer, y el mensaje de seguimiento para copiar.
// Con esto queda medible receta→entrega (la estadística viene después).
// =====================================================================

type Grupo = {
  clave: string;
  registros: Registro[];
  estado: EstadoEntregaAC;
  deadline: string; // el más lejano del grupo (día comprometido)
};

function clavesDeGrupo(r: Registro): string {
  if (r.cotizacionId != null) return `c${r.cotizacionId}`;
  const dia = r.createdAt ? String(r.createdAt).slice(0, 10) : '';
  return `${r.grupoPaciente || `${r.paciente}|${r.dni}`}|${dia}`;
}

export default function AgendaAtencion({
  registros,
  onCambio,
}: {
  registros: Registro[]; // TODOS los PT (incluidos terminados y entregados)
  onCambio: () => void;
}) {
  const [claveSel, setClaveSel] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Registro[]>();
    for (const r of registros) {
      const clave = clavesDeGrupo(r);
      mapa.set(clave, [...(mapa.get(clave) ?? []), r]);
    }
    return Array.from(mapa.entries()).map(([clave, regs]) => ({
      clave,
      registros: regs,
      estado: estadoGrupoAC(regs),
      deadline: regs.map((r) => r.deadline).filter(Boolean).sort().pop() ?? '',
    }) as Grupo);
  }, [registros]);

  const eventos: EventoAgenda[] = useMemo(
    () =>
      grupos.map((g) => ({
        id: g.registros[0].id,
        deadline: g.deadline,
        titulo: g.registros[0].paciente || 'SIN NOMBRE',
        subtitulo: `${g.registros.length} fórmula${g.registros.length !== 1 ? 's' : ''}`,
        original: g,
        clase: CLASE_AC[g.estado],
        // Un pedido entregado (o imposible de producir) con fecha pasada no
        // es una "receta vencida" para Atención.
        vencible: g.estado !== 'azul' && g.estado !== 'gris',
      })),
    [grupos]
  );

  const sel = grupos.find((g) => g.clave === claveSel) ?? null;

  async function marcarEntregado(g: Grupo, deshacer: boolean) {
    setTrabajando(true);
    setError('');
    try {
      const res = await fetch('/api/registros/entregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registroIds: g.registros.map((r) => r.id), deshacer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo actualizar la entrega');
      onCambio();
    } catch (e: any) {
      setError(e.message ?? 'No se pudo actualizar la entrega');
    } finally {
      setTrabajando(false);
    }
  }

  async function copiarSeguimiento(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError('El navegador bloqueó el copiado — seleccioná el texto y copialo a mano.');
    }
  }

  return (
    <div className="space-y-4">
      {/* Referencia de colores */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(LABEL_AC) as EstadoEntregaAC[]).map((e) => (
          <span key={e} className={`badge border ${CLASE_AC[e]}`}>{LABEL_AC[e]}</span>
        ))}
      </div>

      <Agenda
        eventos={eventos}
        onIrAEvento={(original) => setClaveSel((original as Grupo).clave)}
        onIrASinFecha={() => {
          const primero = grupos.find((g) => !g.deadline);
          if (primero) setClaveSel(primero.clave);
        }}
      />

      {/* Panel del pedido seleccionado */}
      {sel && (() => {
        const color = colorDeGrupo(sel.registros[0].grupoPaciente || sel.registros[0].paciente);
        const mensaje = mensajeSeguimiento(sel.estado, sel.registros[0].paciente);
        const entregadoInfo = sel.registros.find((r) => r.entregadoEn);
        const motivos = sel.registros.map((r) => r.noProducibleMotivo).filter(Boolean);
        return (
          <div className="overflow-hidden rounded-2xl border-4 bg-white shadow-sm" style={{ borderColor: color.border }}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
              style={{ background: color.bg, borderBottom: `4px solid ${color.border}` }}>
              <div>
                <p className="text-2xl font-black uppercase leading-none tracking-tight">
                  {sel.registros[0].paciente || 'SIN NOMBRE'}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {sel.registros.length} fórmula{sel.registros.length !== 1 && 's'}
                  {sel.deadline && <> · comprometido para el {fechaAR(sel.deadline)}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge border ${CLASE_AC[sel.estado]}`}>{LABEL_AC[sel.estado]}</span>
                <button className="btn-ghost" onClick={() => setClaveSel(null)}>✕ Cerrar</button>
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2">
                {sel.registros.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5 text-sm">
                    <span>
                      <b>Fórmula {r.tituloFormula || '—'}</b>
                      {r.capsulasTotales ? ` · ${r.capsulasTotales} cáps` : ''}
                    </span>
                    <span className="badge bg-slate-100 text-slate-700">
                      {r.entregadoEn ? '🔵 Entregado' : LABEL_ESTADO[estadoPT(r)]}
                    </span>
                  </div>
                ))}
                {motivos.length > 0 && (
                  <div className="rounded-xl border-l-4 border-l-slate-400 bg-slate-100 p-3 text-sm text-slate-700">
                    <b>No se puede producir:</b> {motivos.join(' · ')}
                  </div>
                )}
                {entregadoInfo?.entregadoEn && (
                  <p className="text-xs text-slate-500">
                    Entregado el {new Date(entregadoInfo.entregadoEn).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Cordoba', day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })} por {entregadoInfo.entregadoPor || '—'}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {sel.estado === 'verde' && (
                    <button className="btn-primary" disabled={trabajando} onClick={() => marcarEntregado(sel, false)}>
                      {trabajando ? 'Guardando…' : '📦 Marcar ENTREGADO'}
                    </button>
                  )}
                  {sel.estado === 'azul' && (
                    <button className="btn-ghost" disabled={trabajando} onClick={() => marcarEntregado(sel, true)}>
                      ↩️ Deshacer entrega
                    </button>
                  )}
                </div>
                {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              </div>

              <div>
                {mensaje ? (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-bold">Mensaje de seguimiento</p>
                      <button className="btn-primary" onClick={() => copiarSeguimiento(mensaje)}>
                        {copiado ? '✅ Copiado' : '📋 Copiar'}
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                      {mensaje}
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    {sel.estado === 'rojo'
                      ? 'Todavía sin mensaje de seguimiento para este estado (el de cotización sale desde la solapa Cotizaciones).'
                      : 'Sin mensaje de seguimiento para este estado.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
