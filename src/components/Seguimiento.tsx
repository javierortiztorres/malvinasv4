'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatoPeso } from '@/lib/cotizador';
import { coincideFiltro } from '@/lib/utils';

// 📒 Seguimiento (v2.2.0, solo Admin): una fila por pedido PAGADO — la más
// nueva arriba — con todo lo que la farmacia necesita para seguirlo:
// cobro, comprobante/medio, receta guardada, ticket farmacia (sin envío),
// celular, dirección y estado de producción. Celular, dirección, medio,
// monto y envío se editan acá mismo como celdas (guardan al salir del
// campo); la receta se puede ver y también subir a mano (PDF o foto) para
// pedidos viejos o recetas que llegaron por WhatsApp.

type FilaSeguimiento = {
  id: number;
  paciente: string;
  dni: string;
  pagadaEn: string | null;
  createdAt: string;
  medico: string;
  matricula: string;
  celular: string;
  direccionEnvio: string;
  medioPago: string;
  medioDetectado: string;
  montoCobrado: number | null;
  precioTotal: number | null;
  precioTransferencia: number | null;
  envioMonto: number;
  envioExplicito: boolean;
  comprobantes: { id: number; nombreArchivo: string }[];
  recetaId: number | null;
  registros: { id: number; estado: string; entregado: boolean }[];
  archivados: number;
};

function fechaHoraAR(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const MIMES_RECETA = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export default function Seguimiento() {
  const [filas, setFilas] = useState<FilaSeguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null); // "id:campo"
  const [subiendoReceta, setSubiendoReceta] = useState<number | null>(null);
  const inputReceta = useRef<HTMLInputElement | null>(null);
  const recetaPara = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError('');
      const res = await fetch('/api/seguimiento');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFilas(Array.isArray(data) ? data : []);
    } catch {
      setError('No se pudo cargar el seguimiento.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Guarda UNA celda al salir del campo. Solo llama al server si el valor
  // realmente cambió; refleja la respuesta en la fila local (sin refetch).
  async function guardarCampo(fila: FilaSeguimiento, campo: string, valor: string) {
    const actual =
      campo === 'montoCobrado' ? (fila.montoCobrado != null ? String(fila.montoCobrado) : '')
      : campo === 'envioMonto' ? String(fila.envioMonto)
      : String((fila as unknown as Record<string, unknown>)[campo] ?? '');
    if (valor.trim() === actual.trim()) return;

    const body: Record<string, unknown> = {};
    if (campo === 'montoCobrado' || campo === 'envioMonto') {
      const limpio = valor.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
      body[campo] = limpio === '' ? null : Number(limpio);
      if (body[campo] !== null && !Number.isFinite(body[campo] as number)) return;
    } else {
      body[campo] = valor;
    }

    setGuardando(`${fila.id}:${campo}`);
    try {
      const res = await fetch(`/api/cotizaciones/${fila.id}/seguimiento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? 'No se pudo guardar. Probá de nuevo.');
        return;
      }
      const cot = await res.json();
      setFilas((prev) =>
        prev.map((f) =>
          f.id === fila.id
            ? {
                ...f,
                celular: cot.celular,
                direccionEnvio: cot.direccionEnvio,
                medioPago: cot.medioPago,
                montoCobrado: cot.montoCobrado,
                envioMonto: cot.envioMonto ?? f.envioMonto,
                envioExplicito: cot.envioMonto != null || f.envioExplicito,
              }
            : f
        )
      );
    } finally {
      setGuardando(null);
    }
  }

  function elegirReceta(cotId: number) {
    recetaPara.current = cotId;
    inputReceta.current?.click();
  }

  async function subirReceta(file: File | undefined | null) {
    const cotId = recetaPara.current;
    if (!file || cotId == null) return;
    if (!MIMES_RECETA.has(file.type)) {
      alert('La receta tiene que ser PDF, JPG o PNG.');
      return;
    }
    setSubiendoReceta(cotId);
    try {
      const datosBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch('/api/recetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotizacionId: cotId, nombreArchivo: file.name, mime: file.type, datosBase64 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? 'No se pudo subir la receta.');
        return;
      }
      setFilas((prev) => prev.map((f) => (f.id === cotId ? { ...f, recetaId: data.recetaId } : f)));
    } finally {
      setSubiendoReceta(null);
      if (inputReceta.current) inputReceta.current.value = '';
    }
  }

  const visibles = filas.filter((f) =>
    coincideFiltro(
      filtro,
      f.paciente, f.dni, f.medico, f.celular, f.direccionEnvio, f.medioPago,
      ...f.registros.map((r) => r.estado)
    )
  );

  if (cargando) return <p className="text-slate-500">Cargando seguimiento…</p>;
  if (error)
    return (
      <div className="card p-8 text-center text-slate-500">
        {error}{' '}
        <button className="font-semibold text-profundo hover:underline" onClick={() => { setCargando(true); cargar(); }}>
          Reintentar
        </button>
      </div>
    );

  const celdaInput =
    'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none';

  return (
    <div className="space-y-4">
      {/* input de archivo compartido por todas las filas */}
      <input ref={inputReceta} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
        onChange={(e) => subirReceta(e.target.files?.[0])} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="input max-w-md" placeholder="🔍 Buscar por paciente, médico, celular, estado…"
          value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <p className="text-sm text-slate-500">
          {visibles.length} pedido{visibles.length !== 1 && 's'} pagado{visibles.length !== 1 && 's'}
          {filtro && ` (de ${filas.length})`} · celular, dirección, medio, monto y envío se editan acá mismo
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">Todavía no hay pedidos pagados.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1500px] text-sm">
            <thead className="sticky top-0 z-10 bg-profundo text-left text-hueso">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Paciente</th>
                <th className="px-3 py-2.5 font-semibold">Fecha de pago</th>
                <th className="px-3 py-2.5 font-semibold">Médico</th>
                <th className="px-3 py-2.5 font-semibold">Receta</th>
                <th className="px-3 py-2.5 font-semibold">Monto cobrado</th>
                <th className="px-3 py-2.5 font-semibold">Comprobante / medio</th>
                <th className="px-3 py-2.5 font-semibold">Ticket farmacia</th>
                <th className="px-3 py-2.5 font-semibold">Celular</th>
                <th className="px-3 py-2.5 font-semibold">Dirección de envío</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, i) => {
                const ticket = f.montoCobrado != null ? f.montoCobrado - (f.envioMonto || 0) : null;
                return (
                  <tr key={f.id} className={`align-top ${i % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-t border-slate-100`}>
                    {/* Paciente */}
                    <td className="px-3 py-2.5">
                      <p className="font-bold uppercase leading-tight">{f.paciente || 'SIN NOMBRE'}</p>
                      <p className="text-xs text-slate-500">{f.dni && `DNI ${f.dni} · `}Cotización #{f.id}</p>
                    </td>
                    {/* Fecha de pago */}
                    <td className="whitespace-nowrap px-3 py-2.5">{fechaHoraAR(f.pagadaEn)}</td>
                    {/* Médico */}
                    <td className="px-3 py-2.5">
                      {f.medico || <span className="text-slate-400">—</span>}
                      {f.matricula && <p className="text-xs text-slate-500">{f.matricula}</p>}
                    </td>
                    {/* Receta */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {f.recetaId != null && (
                        <a className="font-semibold text-profundo hover:underline" target="_blank"
                          href={`/api/recetas/${f.recetaId}`}>📄 Ver</a>
                      )}
                      <button className="ml-2 text-slate-500 hover:text-profundo hover:underline disabled:opacity-50"
                        disabled={subiendoReceta === f.id}
                        title="Subir receta a mano (PDF o foto)"
                        onClick={() => elegirReceta(f.id)}>
                        {subiendoReceta === f.id ? '…' : f.recetaId != null ? '📎' : '📎 Subir'}
                      </button>
                    </td>
                    {/* Monto cobrado */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">$</span>
                        <input key={`m${f.id}-${f.montoCobrado}`} className={`${celdaInput} w-24 font-semibold`}
                          defaultValue={f.montoCobrado != null ? String(f.montoCobrado) : ''}
                          placeholder={f.precioTransferencia != null ? String(Math.round(f.precioTransferencia)) : '—'}
                          onBlur={(e) => guardarCampo(f, 'montoCobrado', e.target.value)} />
                      </div>
                      {guardando === `${f.id}:montoCobrado` && <p className="text-xs text-slate-400">guardando…</p>}
                      {f.montoCobrado == null && f.precioTransferencia != null && (
                        <p className="text-xs text-slate-400">cotizado {formatoPeso(f.precioTransferencia)}</p>
                      )}
                    </td>
                    {/* Comprobante / medio */}
                    <td className="px-3 py-2.5">
                      {f.comprobantes.map((c) => (
                        <a key={c.id} className="block font-semibold text-profundo hover:underline" target="_blank"
                          href={`/api/comprobantes/${c.id}`}>📎 {c.nombreArchivo || `comprobante #${c.id}`}</a>
                      ))}
                      <input key={`mp${f.id}-${f.medioPago}`} className={celdaInput}
                        defaultValue={f.medioPago}
                        placeholder={f.medioDetectado || 'ej: transferencia / 3 cuotas / dinero en cuenta'}
                        title={f.medioDetectado}
                        onBlur={(e) => guardarCampo(f, 'medioPago', e.target.value)} />
                      {guardando === `${f.id}:medioPago` && <p className="text-xs text-slate-400">guardando…</p>}
                    </td>
                    {/* Ticket farmacia */}
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <p className="font-bold">{ticket != null ? formatoPeso(ticket) : '—'}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        envío $
                        <input key={`e${f.id}-${f.envioMonto}`} className={`${celdaInput} w-16 text-xs`}
                          defaultValue={String(f.envioMonto)}
                          onBlur={(e) => guardarCampo(f, 'envioMonto', e.target.value)} />
                      </div>
                      {guardando === `${f.id}:envioMonto` && <p className="text-xs text-slate-400">guardando…</p>}
                    </td>
                    {/* Celular */}
                    <td className="px-3 py-2.5">
                      <input key={`c${f.id}-${f.celular}`} className={`${celdaInput} w-32`}
                        defaultValue={f.celular} placeholder="—"
                        onBlur={(e) => guardarCampo(f, 'celular', e.target.value)} />
                      {guardando === `${f.id}:celular` && <p className="text-xs text-slate-400">guardando…</p>}
                    </td>
                    {/* Dirección */}
                    <td className="px-3 py-2.5">
                      <input key={`d${f.id}-${f.direccionEnvio}`} className={`${celdaInput} min-w-[160px]`}
                        defaultValue={f.direccionEnvio} placeholder="—"
                        onBlur={(e) => guardarCampo(f, 'direccionEnvio', e.target.value)} />
                      {guardando === `${f.id}:direccionEnvio` && <p className="text-xs text-slate-400">guardando…</p>}
                    </td>
                    {/* Estado */}
                    <td className="px-3 py-2.5">
                      {f.registros.length === 0 && f.archivados === 0 && <span className="text-slate-400">—</span>}
                      {f.registros.map((r) => (
                        <span key={r.id} className="mb-1 mr-1 inline-block rounded-full bg-profundo/10 px-2 py-0.5 text-xs font-semibold text-profundo">
                          {r.entregado ? '🔵 Entregado' : r.estado}
                        </span>
                      ))}
                      {f.archivados > 0 && (
                        <span className="mb-1 mr-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                          🗃️ {f.archivados} archivado{f.archivados !== 1 && 's'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
