'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CotizadorDroga } from '@/db/schema';
import { coincideFiltro } from '@/lib/utils';
import { configCompleta, precioUnitarioConMarkup, type CotizadorConfig } from '@/lib/cotizador';

// Los precios por unidad son centavos o fracciones ($0,28/mg): acá se
// muestran con decimales, no redondeados a peso entero.
function pesoUnitario(v: number | null): string {
  if (v == null) return '—';
  return '$' + v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

// =====================================================================
// GESTIÓN DEL COTIZADOR (solo Admin — decisión de Tomi 10-ago): la lista
// de costos de drogas y los parámetros generales que replican el Excel
// "NUEVO COTIZADOR". Los cambios rigen para cotizaciones NUEVAS o
// recalculadas — las ya hechas conservan su precio (snapshot).
// =====================================================================

const CAMPOS_CONFIG: { clave: keyof CotizadorConfig; label: string; ayuda: string }[] = [
  { clave: 'markupGeneral', label: 'Markup general', ayuda: '×7 del Excel: multiplica costos de drogas, cápsulas, jeringas y tiempo' },
  { clave: 'cargaExtra', label: 'Carga extra', ayuda: 'fracción sobre la suma de fórmulas (0,1 = +10%). Hoy 0' },
  { clave: 'descuentoTransferencia', label: 'Descuento transferencia', ayuda: '0,15 = 15%: lista = base ÷ 0,85 y transferencia = base' },
  { clave: 'costoMinutoFarmaceutico', label: 'Costo minuto farmacéutico ($)', ayuda: 'costo real por minuto (Excel: 209,67)' },
  { clave: 'factorTiempo', label: 'Factor tiempo', ayuda: 'el ×0,6 que el Excel aplica al minuto con markup' },
  { clave: 'minutosBase', label: 'Minutos base por fórmula', ayuda: '10 min fijos por fórmula' },
  { clave: 'minutosPorActivoCada30Caps', label: 'Min. por activo (por tanda)', ayuda: '2 min por activo por cada tanda de cápsulas' },
  { clave: 'capsPorTandaTiempo', label: 'Cápsulas por tanda (tiempo)', ayuda: 'el /30 del cálculo de tiempo' },
  { clave: 'costoCapsula', label: 'Costo cápsula ($)', ayuda: 'costo real por cápsula vacía (Excel: 36,08)' },
  { clave: 'costoJeringa', label: 'Costo jeringa ($)', ayuda: 'jeringa 10 ml (Excel: 98,08)' },
  { clave: 'capsPorJeringa', label: 'Cápsulas por jeringa', ayuda: 'se prorratea 1 jeringa cada N cápsulas (Excel: 10)' },
  { clave: 'excipientePorCapsula', label: 'Excipiente por cápsula ($)', ayuda: 'hoy $0: en el Excel la celda estaba vacía y los $6,5 nunca entraban al precio' },
  { clave: 'costoPackaging', label: 'Costo packaging ($)', ayuda: 'envase primario (Excel: 850)' },
  { clave: 'markupPackaging', label: 'Markup packaging', ayuda: 'el envase lleva ×2, no el markup general' },
  { clave: 'capsPorEnvase', label: 'Cápsulas por envase', ayuda: '1 envase cada N cápsulas, redondeo para arriba (Excel: 90)' },
  { clave: 'costoCaja', label: 'Caja secundaria ($)', ayuda: 'una por fórmula (Excel: 4150)' },
  { clave: 'envioCorto', label: 'Envío corto ($)', ayuda: 'Colegio de Farmacéuticos — más barato, más lento' },
  { clave: 'envioLargo', label: 'Envío largo ($)', ayuda: 'a domicilio — más caro, más rápido' },
];

export default function CotizadorGestion() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [drogas, setDrogas] = useState<CotizadorDroga[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<Record<number, Partial<CotizadorDroga>>>({});
  const [nueva, setNueva] = useState({ nombre: '', unidad: 'mg', costoUnitario: '', precioComercialUnitario: '', keywords: '' });

  const cfgActual = useMemo(() => {
    const datos: Record<string, number> = {};
    for (const [k, v] of Object.entries(config)) {
      const n = Number(String(v).replace(',', '.'));
      if (Number.isFinite(n)) datos[k] = n;
    }
    return configCompleta(datos);
  }, [config]);

  const recargar = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        fetch('/api/cotizador/config').then((r) => r.json()),
        fetch('/api/cotizador/drogas').then((r) => r.json()),
      ]);
      if (c && !c.error) {
        const plano: Record<string, string> = {};
        for (const campo of CAMPOS_CONFIG) plano[campo.clave] = String(c[campo.clave] ?? '');
        setConfig(plano);
      }
      if (Array.isArray(d)) setDrogas(d);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function avisar(texto: string) {
    setMsg(texto);
    setError('');
    setTimeout(() => setMsg(''), 3000);
  }

  async function guardarConfig() {
    setGuardandoConfig(true);
    setError('');
    const body: Record<string, number> = {};
    for (const campo of CAMPOS_CONFIG) {
      const v = config[campo.clave];
      if (v === undefined || v === '') continue;
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) {
        setError(`Valor inválido en "${campo.label}"`);
        setGuardandoConfig(false);
        return;
      }
      body[campo.clave] = n;
    }
    const res = await fetch('/api/cotizador/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setGuardandoConfig(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo guardar la configuración');
      return;
    }
    avisar('Parámetros guardados — rigen para cotizaciones nuevas o recalculadas.');
  }

  async function guardarDroga(d: CotizadorDroga) {
    const cambios = editando[d.id] ?? {};
    const res = await fetch('/api/cotizador/drogas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, ...cambios, id: d.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'No se pudo guardar');
      return;
    }
    setEditando((p) => {
      const { [d.id]: _, ...resto } = p;
      return resto;
    });
    setDrogas((p) => p.map((x) => (x.id === d.id ? data : x)));
    avisar(`${data.nombre} guardada.`);
  }

  async function borrarDroga(d: CotizadorDroga) {
    if (!confirm(`¿Borrar "${d.nombre}" de la lista de costos?`)) return;
    const res = await fetch('/api/cotizador/drogas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id }),
    });
    if (res.ok) {
      setDrogas((p) => p.filter((x) => x.id !== d.id));
      avisar(`${d.nombre} borrada.`);
    }
  }

  async function crearDroga() {
    if (!nueva.nombre.trim()) {
      setError('Falta el nombre de la droga');
      return;
    }
    const res = await fetch('/api/cotizador/drogas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nueva),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'No se pudo crear');
      return;
    }
    setNueva({ nombre: '', unidad: 'mg', costoUnitario: '', precioComercialUnitario: '', keywords: '' });
    recargar();
    avisar('Droga agregada.');
  }

  const visibles = drogas.filter((d) => coincideFiltro(filtro, d.nombre, d.keywords));

  if (cargando) return <p className="text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-5">
      {(msg || error) && (
        <p className={`text-sm font-semibold ${error ? 'text-red-600' : 'text-green-700'}`}>{error || msg}</p>
      )}

      {/* -------- Parámetros generales -------- */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">⚙️ Parámetros generales (del Excel)</h3>
          <button className="btn-primary" onClick={guardarConfig} disabled={guardandoConfig}>
            {guardandoConfig ? 'Guardando…' : 'Guardar parámetros'}
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Los cambios valen para cotizaciones <b>nuevas o recalculadas</b> — las ya hechas conservan su precio.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPOS_CONFIG.map((campo) => (
            <div key={campo.clave}>
              <label className="label" title={campo.ayuda}>{campo.label}</label>
              <input
                className="input"
                inputMode="decimal"
                value={config[campo.clave] ?? ''}
                onChange={(e) => setConfig((p) => ({ ...p, [campo.clave]: e.target.value }))}
              />
              <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{campo.ayuda}</p>
            </div>
          ))}
        </div>
      </div>

      {/* -------- Lista de costos de drogas -------- */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">💊 Costos de drogas · {drogas.length}</h3>
          <input className="input max-w-xs" placeholder="🔍 Buscar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <p className="mb-3 text-xs text-slate-500">
          <b>$/u final</b> = mín(costo × markup, tope comercial): nunca se cobra un activo más caro que su
          equivalente comercial. <b>Keywords</b>: sinónimos para matchear el nombre que viene en la receta
          (separados por coma).
        </p>

        {/* Alta rápida */}
        <div className="mb-4 grid items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="label">Nueva droga</label>
            <input className="input" placeholder="Nombre" value={nueva.nombre}
              onChange={(e) => setNueva((p) => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Unidad</label>
            <select className="input" value={nueva.unidad} onChange={(e) => setNueva((p) => ({ ...p, unidad: e.target.value }))}>
              <option value="mg">mg</option>
              <option value="ug">µg</option>
              <option value="UI">UI</option>
            </select>
          </div>
          <div>
            <label className="label">Costo/u ($)</label>
            <input className="input" inputMode="decimal" value={nueva.costoUnitario}
              onChange={(e) => setNueva((p) => ({ ...p, costoUnitario: e.target.value }))} />
          </div>
          <div>
            <label className="label">Tope com./u ($)</label>
            <input className="input" inputMode="decimal" value={nueva.precioComercialUnitario}
              onChange={(e) => setNueva((p) => ({ ...p, precioComercialUnitario: e.target.value }))} />
          </div>
          <button className="btn-primary" onClick={crearDroga}>+ Agregar</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-1.5 pr-2">Droga</th>
                <th className="pr-2">Unidad</th>
                <th className="pr-2">Costo/u</th>
                <th className="pr-2">Tope com./u</th>
                <th className="pr-2">$/u final</th>
                <th className="pr-2">Keywords (receta)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => {
                const e = editando[d.id] ?? {};
                const vivo: CotizadorDroga = { ...d, ...e } as CotizadorDroga;
                const final = precioUnitarioConMarkup(
                  {
                    ...vivo,
                    costoUnitario: vivo.costoUnitario === null || (vivo.costoUnitario as unknown) === '' ? null : Number(vivo.costoUnitario),
                    precioComercialUnitario:
                      vivo.precioComercialUnitario === null || (vivo.precioComercialUnitario as unknown) === '' ? null : Number(vivo.precioComercialUnitario),
                  },
                  cfgActual
                );
                const tocada = editando[d.id] !== undefined;
                return (
                  <tr key={d.id} className="border-b border-slate-100 align-middle">
                    <td className="py-1 pr-2">
                      <input className="input !py-1 min-w-[180px]" value={String(vivo.nombre)}
                        onChange={(ev) => setEditando((p) => ({ ...p, [d.id]: { ...p[d.id], nombre: ev.target.value } }))} />
                    </td>
                    <td className="pr-2">
                      <select className="input !py-1" value={vivo.unidad}
                        onChange={(ev) => setEditando((p) => ({ ...p, [d.id]: { ...p[d.id], unidad: ev.target.value } }))}>
                        <option value="mg">mg</option>
                        <option value="ug">µg</option>
                        <option value="UI">UI</option>
                      </select>
                    </td>
                    <td className="pr-2">
                      <input className="input !py-1 w-24" inputMode="decimal" value={vivo.costoUnitario ?? ''}
                        onChange={(ev) => setEditando((p) => ({ ...p, [d.id]: { ...p[d.id], costoUnitario: ev.target.value as unknown as number } }))} />
                    </td>
                    <td className="pr-2">
                      <input className="input !py-1 w-24" inputMode="decimal" value={vivo.precioComercialUnitario ?? ''}
                        onChange={(ev) => setEditando((p) => ({ ...p, [d.id]: { ...p[d.id], precioComercialUnitario: ev.target.value as unknown as number } }))} />
                    </td>
                    <td className="pr-2 font-semibold whitespace-nowrap">{pesoUnitario(final)}</td>
                    <td className="pr-2">
                      <input className="input !py-1 min-w-[160px]" placeholder="sinónimos, separados, por coma" value={vivo.keywords}
                        onChange={(ev) => setEditando((p) => ({ ...p, [d.id]: { ...p[d.id], keywords: ev.target.value } }))} />
                    </td>
                    <td className="whitespace-nowrap">
                      <button className={`btn-primary !py-1 ${tocada ? '' : 'opacity-40'}`} disabled={!tocada} onClick={() => guardarDroga(d)}>
                        Guardar
                      </button>
                      <button className="btn-ghost !py-1 text-red-600" onClick={() => borrarDroga(d)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibles.length === 0 && <p className="py-6 text-center text-slate-500">Sin drogas con ese filtro.</p>}
        </div>
      </div>
    </div>
  );
}
