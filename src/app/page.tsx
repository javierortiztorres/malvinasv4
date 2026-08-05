'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Registro, RegistroPi, Tinta } from '@/db/schema';
import { APP } from '@/lib/config';
import { diasHasta, esPiPendiente } from '@/lib/utils';
import MarcaMalvinas from '@/components/MarcaMalvinas';
import Agenda from '@/components/Agenda';
import LectorRecetas from '@/components/LectorRecetas';
import EnProceso from '@/components/EnProceso';
import ProductoIntermedio from '@/components/ProductoIntermedio';
import Terminados from '@/components/Terminados';
import Necesidades from '@/components/Necesidades';
import Estadistica from '@/components/Estadistica';
import Admin from '@/components/Admin';
import GestionUsuarios from '@/components/GestionUsuarios';

export type Catalogos = {
  tintas: Tinta[];
  excipientes: { id: number; nombre: string }[];
  medicos: { id: number; nombre: string; matricula: string }[];
  pacientes: { id: number; nombre: string; dni: string }[];
  operadores: { id: number; nombre: string; rol: string }[];
};

const TABS = [
  { id: 'agenda', label: '🗓️ Agenda' },
  { id: 'lector', label: '📄 Lector de recetas' },
  { id: 'prod', label: '🖨️ En producción' },
  { id: 'pt', label: '📋 Pendientes' },
  { id: 'pi', label: '🧪 Producto Intermedio' },
  { id: 'neces', label: '📊 Necesidades' },
  { id: 'terminados', label: '✅ Terminados' },
  { id: 'estadistica', label: '📈 Estadística' },
  { id: 'gestion', label: '🗂️ Gestión' },
] as const;

type Yo = { uid: number; usuario: string; nombre: string; rol: string };

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<string>('agenda');
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [registrosPi, setRegistrosPi] = useState<RegistroPi[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [online, setOnline] = useState(true);
  const [yo, setYo] = useState<Yo | null>(null);

  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setYo);
  }, []);

  async function salir() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  }

  const tabs = yo?.rol === 'admin' ? [...TABS, { id: 'usuarios', label: '👤 Usuarios' }] : TABS;
  // Foco pedido desde la Agenda (click en un evento): se aplica una vez
  // dentro de la instancia de EnProceso correspondiente (prod o pt) y se
  // limpia enseguida para no re-disparar el foco al volver a esa solapa.
  const [focoId, setFocoId] = useState<number | null>(null);

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
  const piProceso = registrosPi.filter(esPiPendiente);
  const ptTerm = registros.filter((r) => r.estado === 'terminado');
  const piTerm = registrosPi.filter((r) => r.estado === 'terminado');
  const vencidasCount = ptProceso.filter((r) => r.deadline && (diasHasta(r.deadline) ?? 0) < 0).length;

  function irARegistro(r: Registro) {
    setTab(r.enProduccion ? 'prod' : 'pt');
    setFocoId(r.id);
  }

  return (
    <main className="mx-auto max-w-[1500px] p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-profundo px-5 py-4">
        <div className="flex items-center gap-3">
          <MarcaMalvinas variante="negativa" className="h-9 w-auto shrink-0" />
          <div>
            <h1 className="font-archivo text-2xl font-bold tracking-tight text-hueso">{APP.nombre}</h1>
            <p className="text-sm text-niebla">{APP.subtitulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!online && (
            <span className="badge bg-amber-100 text-amber-800">
              ⚠ Sin conexión — los cambios se guardan localmente
            </span>
          )}
          {yo && (
            <span className="flex items-center gap-2 text-sm text-niebla">
              {yo.nombre}
              <button onClick={salir} className="badge bg-white/10 text-hueso hover:bg-white/20">
                Cerrar sesión
              </button>
            </span>
          )}
        </div>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const count =
            t.id === 'prod' ? enProduccion.length
            : t.id === 'pt' ? pendientes.length
            : t.id === 'pi' ? piProceso.length
            : t.id === 'agenda' ? vencidasCount
            : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-profundo text-hueso shadow-sm'
                  : 'border border-slate-200 bg-white text-turba hover:bg-slate-50'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`ml-2 rounded-full px-2 text-xs ${tab === t.id ? 'bg-white/25' : 'bg-profundo/10 text-profundo'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === 'agenda' && catalogos && (
        <Agenda registros={ptProceso} onIrARegistro={irARegistro} onIrATab={setTab} />
      )}
      {tab === 'lector' && catalogos && (
        <LectorRecetas catalogos={catalogos}
          onCreados={(primerId) => { recargar(); setTab('pt'); setFocoId(primerId); }} />
      )}
      {tab === 'prod' && catalogos && (
        <EnProceso registros={enProduccion} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistro} enProduccion
          focoInicialId={focoId} onFocoConsumido={() => setFocoId(null)} />
      )}
      {tab === 'pt' && catalogos && (
        <EnProceso registros={pendientes} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistro} enProduccion={false}
          focoInicialId={focoId} onFocoConsumido={() => setFocoId(null)} />
      )}
      {tab === 'pi' && catalogos && (
        <ProductoIntermedio registros={piProceso} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistroPi} />
      )}
      {tab === 'neces' && catalogos && (
        <Necesidades registros={ptProceso} catalogos={catalogos}
          onCambio={recargar} onIrPI={() => setTab('pi')} />
      )}
      {tab === 'terminados' && (
        <Terminados registros={ptTerm} registrosPi={piTerm} onCambio={recargar} />
      )}
      {tab === 'estadistica' && (
        <Estadistica registros={ptTerm} registrosPi={piTerm} />
      )}
      {tab === 'gestion' && catalogos && <Admin catalogos={catalogos} onCambio={recargar} />}
      {tab === 'usuarios' && yo?.rol === 'admin' && <GestionUsuarios miId={yo.uid} />}
      {!catalogos && <p className="text-slate-500">Cargando…</p>}
    </main>
  );
}
