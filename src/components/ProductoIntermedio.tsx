'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RegistroPi, MateriaPrima, Tinta } from '@/db/schema';
import type { Catalogos } from '@/app/page';
import { hoyISO, sumarMeses, formatoLotePI, coincideFiltro } from '@/lib/utils';
import { MESES_VENCIMIENTO } from '@/lib/config';
import { pesadasPI, fmtG, fmtPct, limpiarNombreTinta } from '@/lib/engine';
import { faltantesPI } from '@/lib/validation';

const DRAFT_KEY = (id: number) => `draft-pi-${id}`;

export default function ProductoIntermedio({
  registros,
  catalogos,
  onCambio,
  onActualizado,
}: {
  registros: RegistroPi[];
  catalogos: Catalogos;
  onCambio: () => void;
  onActualizado: (r: RegistroPi) => void;
}) {
  const [abiertos, setAbiertos] = useState<Record<number, boolean>>({});
  const [tintaNueva, setTintaNueva] = useState('');
  const [filtro, setFiltro] = useState('');

  const visibles = registros.filter((r) =>
    coincideFiltro(filtro, r.nombreProducto, r.operador, r.poe,
      formatoLotePI(r.poe, r.loteNumero))
  );
  const [creando, setCreando] = useState(false);

  async function nuevaProduccion() {
    const t = catalogos.tintas.find((x) => String(x.id) === tintaNueva);
    if (!t) return;
    setCreando(true);
    const nl = await fetch(`/api/next-lote-pi?poe=${encodeURIComponent(t.poe)}`).then((r) => r.json());
    const fechaElab = hoyISO();
    const body = {
      estado: 'en_proceso',
      tintaId: t.id,
      tintaNombre: t.nombre,
      nombreProducto: `TINTA DE ${limpiarNombreTinta(t.nombre).toUpperCase()}`,
      poe: t.poe,
      loteNumero: nl.proximo,
      concentracion: t.concentracion,
      volumenJeringaMl: 10,
      materiasPrimas: [],
      fechaElab,
      fechaVto: sumarMeses(fechaElab, MESES_VENCIMIENTO),
      fechaHoraInicio: '',
      fechaHoraFin: '',
    };
    const res = await fetch('/api/registros-pi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setCreando(false);
    if (res.ok) {
      setTintaNueva('');
      onCambio();
    }
  }

  return (
    <div className="space-y-4">
      {/* Nueva producción */}
      <div className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label">Tinta a producir</label>
          <select className="input" value={tintaNueva} onChange={(e) => setTintaNueva(e.target.value)}>
            <option value="">Elegí una tinta del catálogo…</option>
            {catalogos.tintas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} · {fmtPct(t.concentracion)} {t.poe && `· ${t.poe}`}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={nuevaProduccion} disabled={!tintaNueva || creando}>
          🧪 Nueva producción de PI →
        </button>
        <p className="w-full text-xs text-slate-500">
          El lote se numera solo (P### por tinta). Si la tinta no está en el catálogo, agregala primero en Gestión.
        </p>
      </div>

      <input className="input max-w-md" placeholder="🔍 Buscar por tinta, lote, operador…"
        value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      {registros.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No hay producciones de producto intermedio en proceso.
        </div>
      ) : visibles.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">Ningún lote coincide con la búsqueda.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibles.map((r) => {
            const abierto = abiertos[r.id] ?? false;
            return (
              <div key={r.id} className="card overflow-hidden border-l-4 border-l-teal-600">
                <button className="block w-full bg-teal-50/60 text-left"
                  onClick={() => setAbiertos((a) => ({ ...a, [r.id]: !abierto }))}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      {/* Nombre limpio del activo (sin "para X mg", apodos ni %) */}
                      <p className="text-xl font-black uppercase leading-none">
                        {limpiarNombreTinta(r.tintaNombre) || 'SIN TINTA'}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        Lote <b>{formatoLotePI(r.poe, r.loteNumero)}</b>
                        {r.concentracion ? ` · ${fmtPct(r.concentracion)}` : ''}
                        {r.cantidadProductoG ? ` · ${r.cantidadProductoG} g` : ''}
                        {r.jeringas ? ` · ${r.jeringas} jeringas` : ''}
                      </p>
                    </div>
                    <span className="text-2xl">{abierto ? '▾' : '▸'}</span>
                  </div>
                </button>
                {abierto && <PiEditor registro={r} catalogos={catalogos} onCambio={onCambio} onActualizado={onActualizado} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Campo "Cantidad de principio activo (g)": la forma primaria de cargar un
// lote. Al escribir el activo, la cantidad de producto se deriva sola
// (activo ÷ concentración) y los excipientes salen después por porcentaje
// con «Calcular pesadas teóricas». Editar la cantidad de producto a mano
// sigue funcionando: este campo muestra el activo equivalente (producto ×
// concentración). Mientras se tipea usa un valor local para no pelearse
// con el redondeo.
function ActivoInput({ r, set }: { r: RegistroPi; set: (p: Partial<RegistroPi>) => void }) {
  const [local, setLocal] = useState<string | null>(null);
  const derivado =
    r.cantidadProductoG != null && r.concentracion
      ? Number((r.cantidadProductoG * r.concentracion).toFixed(2))
      : null;
  if (!r.concentracion) {
    return <input className="input" disabled placeholder="definí la concentración" />;
  }
  return (
    <input
      className="input border-teal-300 font-semibold"
      type="number" step="any"
      value={local ?? (derivado ?? '')}
      onFocus={() => setLocal(derivado != null ? String(derivado) : '')}
      onBlur={() => setLocal(null)}
      onChange={(e) => {
        setLocal(e.target.value);
        const v = Number(e.target.value);
        if (!e.target.value) set({ cantidadProductoG: null });
        else if (v > 0 && r.concentracion)
          set({ cantidadProductoG: Number((v / r.concentracion).toFixed(2)) });
      }}
    />
  );
}

// ================= Editor de un lote de PI =================
function PiEditor({
  registro,
  catalogos,
  onCambio,
  onActualizado,
}: {
  registro: RegistroPi;
  catalogos: Catalogos;
  onCambio: () => void;
  onActualizado: (r: RegistroPi) => void;
}) {
  const [r, setR] = useState<RegistroPi>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(DRAFT_KEY(registro.id));
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          if (new Date(draft.updatedAt) > new Date(registro.updatedAt)) return draft;
        } catch {}
      }
    }
    return registro;
  });
  const [sync, setSync] = useState<'ok' | 'guardando' | 'pendiente'>('ok');
  const [errores, setErrores] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const rRef = useRef(r);
  rRef.current = r;

  const sincronizar = useCallback(async (data: RegistroPi) => {
    setSync('guardando');
    try {
      const res = await fetch(`/api/registros-pi/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      localStorage.removeItem(DRAFT_KEY(data.id));
      setSync('ok');
    } catch {
      setSync('pendiente');
    }
  }, []);

  const set = useCallback(
    (patch: Partial<RegistroPi>) => {
      const next = { ...rRef.current, ...patch, updatedAt: new Date() } as RegistroPi;
      rRef.current = next;
      setR(next);
      try {
        localStorage.setItem(DRAFT_KEY(next.id), JSON.stringify(next));
      } catch {}
      clearTimeout(timer.current);
      timer.current = setTimeout(() => sincronizar(next), 700);
      // Mantiene la lista del padre al día: al colapsar y reabrir el lote
      // no se pierden los cambios en pantalla.
      onActualizado(next);
    },
    [sincronizar, onActualizado]
  );

  useEffect(() => {
    const reintentar = () => {
      const raw = localStorage.getItem(DRAFT_KEY(registro.id));
      if (raw) sincronizar(JSON.parse(raw));
    };
    window.addEventListener('online', reintentar);
    return () => window.removeEventListener('online', reintentar);
  }, [registro.id, sincronizar]);

  const tinta: Tinta | undefined = useMemo(
    () => catalogos.tintas.find((t) => t.id === r.tintaId),
    [catalogos.tintas, r.tintaId]
  );

  // ---- Pesadas teóricas en vivo ----
  const teoricas = useMemo(() => {
    if (!r.concentracion || !r.cantidadProductoG || !tinta) return [];
    // Nombre limpio del activo para el documento (sin concentración,
    // apodos ni "para X mg"): "Melatonina", no "Melatonina para 1 mg".
    const activoNombre = limpiarNombreTinta(tinta.nombre);
    return pesadasPI(activoNombre, r.concentracion, r.cantidadProductoG, tinta.excipientes ?? [], catalogos.tintas);
  }, [r.concentracion, r.cantidadProductoG, tinta, catalogos.tintas]);

  // Regenerar la tabla de materias primas conservando lo cargado a mano
  function regenerarMP() {
    const mps: MateriaPrima[] = teoricas.map((t, i) => {
      const previa = r.materiasPrimas[i];
      return {
        ref: i + 1,
        nombre: t.nombre,
        pureza: previa?.pureza ?? (t.esPI ? 'N.A.' : '-'),
        lote: previa?.lote ?? '',
        esPI: t.esPI,
        cantidadTeorica: Math.round(t.gramos * 100) / 100,
        pesadaReal: previa?.pesadaReal ?? '',
      };
    });
    set({ materiasPrimas: mps });
  }

  const setMP = (i: number, patch: Partial<MateriaPrima>) =>
    set({ materiasPrimas: r.materiasPrimas.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  async function marcarTerminado() {
    const faltan = faltantesPI(r);
    if (faltan) { setErrores(faltan); return; }
    setErrores(null);
    const res = await fetch(`/api/registros-pi/${r.id}?terminar=1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    if (res.ok) {
      localStorage.removeItem(DRAFT_KEY(r.id));
      onCambio();
    } else {
      const data = await res.json();
      setErrores(data.faltantes ?? ['Error del servidor']);
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar la producción de ${limpiarNombreTinta(r.tintaNombre)}?`)) return;
    await fetch(`/api/registros-pi/${r.id}`, { method: 'DELETE' });
    localStorage.removeItem(DRAFT_KEY(r.id));
    onCambio();
  }

  const estadoSync =
    sync === 'ok' ? '✔ guardado' : sync === 'guardando' ? '… guardando' : '⚠ pendiente de sincronizar (guardado local)';

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{estadoSync}</span>
        <button className="text-red-600 hover:underline" onClick={eliminar}>Eliminar</button>
      </div>

      {/* Datos del lote */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="label">Nombre del producto</label>
          <input className="input" value={r.nombreProducto}
            onChange={(e) => set({ nombreProducto: e.target.value })} />
        </div>
        <div>
          <label className="label">Concentración del lote (%)</label>
          <input className="input" type="number" step="any"
            value={r.concentracion != null ? Number((r.concentracion * 100).toFixed(4)) : ''}
            onChange={(e) => set({ concentracion: e.target.value ? Number(e.target.value) / 100 : null })} />
        </div>
        <div>
          <label className="label">Nº POE</label>
          <input className="input" placeholder="FPI.01.PIxxx" value={r.poe}
            onChange={(e) => set({ poe: e.target.value })} />
        </div>
        <div>
          <label className="label">Nº de lote (P…)</label>
          <input className="input" type="number" value={r.loteNumero ?? ''}
            onChange={(e) => set({ loteNumero: Number(e.target.value) || null })} />
        </div>
        <div className="flex items-end">
          <span className="badge w-full justify-center bg-teal-50 py-2 font-mono text-teal-800">
            {formatoLotePI(r.poe, r.loteNumero)}
          </span>
        </div>
        <div>
          <label className="label text-teal-700">Cant. de PRINCIPIO ACTIVO (g)</label>
          <ActivoInput r={r} set={set} />
          <p className="mt-0.5 text-[10px] text-slate-400">el producto total se calcula solo: activo ÷ concentración</p>
        </div>
        <div>
          <label className="label">Cantidad de producto (g)</label>
          <input className="input" type="number" step="any" value={r.cantidadProductoG ?? ''}
            onChange={(e) => set({ cantidadProductoG: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label className="label">Jeringas</label>
          <input className="input" type="number" value={r.jeringas ?? ''}
            onChange={(e) => set({ jeringas: Number(e.target.value) || null })} />
        </div>
        <div>
          <label className="label">Volumen jeringa (ml)</label>
          <input className="input" type="number" step="any" value={r.volumenJeringaMl ?? ''}
            onChange={(e) => set({ volumenJeringaMl: Number(e.target.value) || 10 })} />
        </div>
      </section>

      {/* Pesadas */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="section-title mb-0 text-sm">⚖️ Materias primas y pesadas</h3>
          <button className="btn-ghost text-xs" onClick={regenerarMP}
            disabled={!r.concentracion || !r.cantidadProductoG}>
            🔄 Calcular pesadas teóricas
          </button>
        </div>
        {teoricas.length > 0 && r.materiasPrimas.length === 0 && (
          <div className="alerta-quimica mb-2">
            Con {r.cantidadProductoG} g al {fmtPct(r.concentracion)}:{' '}
            {teoricas.map((t) => `${t.nombre} ${fmtG(t.gramos)}`).join(' + ')}. Tocá «Calcular pesadas
            teóricas» para volcarlo a la tabla.
          </div>
        )}
        {r.materiasPrimas.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1">Nº</th><th>Materia prima</th><th>Pureza</th>
                <th>Nº lote</th><th>Teórica (g)</th><th className="text-teal-700">Pesada real</th>
              </tr>
            </thead>
            <tbody>
              {r.materiasPrimas.map((m, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2 font-bold">{m.ref}</td>
                  <td className="pr-2">
                    <input className="input" value={m.nombre} onChange={(e) => setMP(i, { nombre: e.target.value })} />
                    {m.esPI && <p className="text-[10px] font-medium text-teal-700">↳ es un producto intermedio: usar su lote FPI</p>}
                  </td>
                  <td className="pr-2">
                    <input className="input w-20" value={m.pureza} onChange={(e) => setMP(i, { pureza: e.target.value })} />
                  </td>
                  <td className="pr-2">
                    <input className="input" placeholder={m.esPI ? 'FPI.01.PIxxx / P###' : 'lote proveedor'}
                      value={m.lote} onChange={(e) => setMP(i, { lote: e.target.value })} />
                  </td>
                  <td className="pr-2 font-semibold">{m.cantidadTeorica ?? '—'}</td>
                  <td className="pr-2">
                    <input className="input w-24 border-teal-300" value={m.pesadaReal}
                      onChange={(e) => setMP(i, { pesadaReal: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Proceso, controles, fechas */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Temperatura (ºC)</label>
          <input className="input" value={r.proceso.temperatura}
            onChange={(e) => set({ proceso: { ...r.proceso, temperatura: e.target.value } })} />
        </div>
        <div>
          <label className="label">T. mezclado (min)</label>
          <input className="input" value={r.proceso.tiempoMezclado}
            onChange={(e) => set({ proceso: { ...r.proceso, tiempoMezclado: e.target.value } })} />
        </div>
        <div>
          <label className="label">Inicio producción</label>
          <input className="input" type="datetime-local" value={r.fechaHoraInicio}
            onChange={(e) => set({ fechaHoraInicio: e.target.value })} />
        </div>
        <div>
          <label className="label">Fin producción</label>
          <input className="input" type="datetime-local" value={r.fechaHoraFin}
            onChange={(e) => set({ fechaHoraFin: e.target.value })} />
        </div>
        <div>
          <label className="label">Fecha elaboración</label>
          <input className="input" type="date" value={r.fechaElab}
            onChange={(e) => set({ fechaElab: e.target.value, fechaVto: sumarMeses(e.target.value || hoyISO(), MESES_VENCIMIENTO) })} />
        </div>
        <div>
          <label className="label">Fecha vencimiento (+{MESES_VENCIMIENTO} meses)</label>
          <input className="input" type="date" value={r.fechaVto} onChange={(e) => set({ fechaVto: e.target.value })} />
        </div>
        <div>
          <label className="label">Operador</label>
          <select className="input" value={r.operador} onChange={(e) => set({ operador: e.target.value })}>
            <option value="">—</option>
            {catalogos.operadores.filter((o) => o.rol === 'produce')
              .map((o) => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm lg:col-span-1">
          {([['peso', 'Peso'], ['organoleptico', 'S/mat. organoléptico'], ['vestimenta', 'Vestimenta'], ['higiene', 'Higiene']] as const)
            .map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={r.controles[k]}
                onChange={(e) => set({ controles: { ...r.controles, [k]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </div>
        <div>
          <label className="label">Aprobadas (jeringas)</label>
          <input className="input" type="number" value={r.aprobadas ?? ''}
            onChange={(e) => set({ aprobadas: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="label">Rechazadas</label>
          <input className="input" type="number" value={r.rechazadas}
            onChange={(e) => set({ rechazadas: Number(e.target.value) || 0 })} />
        </div>
      </section>

      {errores && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="mb-1 font-bold">⛔ No se puede terminar: faltan datos obligatorios</p>
          <ul className="list-inside list-disc">
            {errores.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      <div className="flex justify-end border-t border-slate-100 pt-3">
        <button className="btn-primary" onClick={marcarTerminado}>
          ✅ Marcar PI como TERMINADO
        </button>
      </div>
    </div>
  );
}
