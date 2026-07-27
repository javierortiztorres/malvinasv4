'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Registro, RegistroPi, Tinta } from '@/db/schema';
import { APP } from '@/lib/config';
import LectorRecetas from '@/components/LectorRecetas';
import EnProceso from '@/components/EnProceso';
import ProductoIntermedio from '@/components/ProductoIntermedio';
import Terminados from '@/components/Terminados';
import Necesidades from '@/components/Necesidades';
import Admin from '@/components/Admin';

export type Catalogos = {
  tintas: Tinta[];
  excipientes: { id: number; nombre: string }[];
  medicos: { id: number; nombre: string; matricula: string }[];
  pacientes: { id: number; nombre: string; dni: string }[];
  operadores: { id: number; nombre: string; rol: string }[];
};

const TABS = [
  { id: 'lector', label: '📄 Lector de recetas' },
  { id: 'prod', label: '🖨️ En producción' },
  { id: 'pt', label: '📋 Pendientes' },
  { id: 'pi', label: '🧪 Producto Intermedio' },
  { id: 'neces', label: '📊 Necesidades' },
  { id: 'terminados', label: '✅ Terminados' },
  { id: 'gestion', label: '🗂️ Gestión' },
] as const;

export default function Home() {
  const [tab, setTab] = useState<string>('prod');
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [registrosPi, setRegistrosPi] = useState<RegistroPi[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [online, setOnline] = useState(true);

  const recargar = useCallback(async () => {
    try {
      const [r, rpi, c] = await Promise.all([
        fetch('/api/registros').then((x) => x.json()),
        fetch('/api/registros-pi').then((x) => x.json()),
        fetch('/api/catalogos').then((x) => x.json()),
      ]);
      if (Array.isArray(r)) setRegistros(r);
      if (Array.isArray(rpi)) setRegistrosPi(rpi);
      if (c && !c.error) setCatalogos(c);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    recargar();
    const on = () => { setOnline(true); recargar(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [recargar]);

  // Mantiene la lista en memoria al día con cada edición del editor:
  // sin esto, al cambiar de paciente/solapa la tarjeta se re-monta con
  // datos viejos y los cambios "desaparecen" hasta recargar la página.
  const actualizarRegistro = useCallback((reg: Registro) => {
    setRegistros((prev) => prev.map((x) => (x.id === reg.id ? reg : x)));
  }, []);
  const actualizarRegistroPi = useCallback((reg: RegistroPi) => {
    setRegistrosPi((prev) => prev.map((x) => (x.id === reg.id ? reg : x)));
  }, []);

  const ptProceso = registros.filter((r) => r.estado === 'en_proceso');
  const enProduccion = ptProceso.filter((r) => r.enProduccion);
  const pendientes = ptProceso.filter((r) => !r.enProduccion);
  const piProceso = registrosPi.filter((r) => r.estado === 'en_proceso');
  const ptTerm = registros.filter((r) => r.estado === 'terminado');
  const piTerm = registrosPi.filter((r) => r.estado === 'terminado');

  return (
    <main className="mx-auto max-w-[1500px] p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-2xl">💊</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{APP.nombre}</h1>
            <p className="text-sm text-slate-500">{APP.subtitulo}</p>
          </div>
        </div>
        {!online && (
          <span className="badge bg-amber-100 text-amber-800">
            ⚠ Sin conexión — los cambios se guardan localmente
          </span>
        )}
      </header>

      <nav className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.id === 'prod' ? enProduccion.length : t.id === 'pt' ? pendientes.length : t.id === 'pi' ? piProceso.length : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`ml-2 rounded-full px-2 text-xs ${tab === t.id ? 'bg-white/25' : 'bg-teal-50 text-teal-700'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === 'lector' && catalogos && (
        <LectorRecetas catalogos={catalogos} onCreados={() => { recargar(); setTab('pt'); }} />
      )}
      {tab === 'prod' && catalogos && (
        <EnProceso registros={enProduccion} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistro} enProduccion />
      )}
      {tab === 'pt' && catalogos && (
        <EnProceso registros={pendientes} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistro} enProduccion={false} />
      )}
      {tab === 'pi' && catalogos && (
        <ProductoIntermedio registros={piProceso} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistroPi} />
      )}
      {tab === 'neces' && catalogos && (
        <Necesidades registros={ptProceso} registrosPi={registrosPi} catalogos={catalogos}
          onCambio={recargar} onIrPI={() => setTab('pi')} />
      )}
      {tab === 'terminados' && (
        <Terminados registros={ptTerm} registrosPi={piTerm} onCambio={recargar} />
      )}
      {tab === 'gestion' && catalogos && <Admin catalogos={catalogos} onCambio={recargar} />}
      {!catalogos && <p className="text-slate-500">Cargando…</p>}
    </main>
  );
}
