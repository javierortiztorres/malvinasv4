'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Registro, RegistroPi, Tinta } from '@/db/schema';
import { APP } from '@/lib/config';
import { diasHasta, esPiPendiente, formatoLotePI } from '@/lib/utils';
import { limpiarNombreTinta } from '@/lib/engine';
import { TABS_POR_ROL } from '@/lib/roles';
import MarcaMalvinas from '@/components/MarcaMalvinas';
import Agenda, { type EventoAgenda } from '@/components/Agenda';
import LectorRecetas from '@/components/LectorRecetas';
import EnProceso from '@/components/EnProceso';
import PreProduccion from '@/components/PreProduccion';
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

  // Navegación por rol (B-30b): cada rol tiene su propio subconjunto fijo
  // de solapas. El servidor vuelve a validar el alcance en cada endpoint
  // sensible — esto es solo la pantalla.
  const tabs = yo ? TABS_POR_ROL[yo.rol as keyof typeof TABS_POR_ROL] ?? [] : [];
  const permitido = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);

  // Si el rol cambia (o recién cargó) y la solapa activa quedó fuera de su
  // alcance, se cae a la primera solapa permitida en vez de mostrar una
  // pantalla vacía o rota.
  useEffect(() => {
    if (!yo) return;
    if (!permitido.has(tab)) setTab(tabs[0]?.id ?? 'agenda');
  }, [yo, permitido, tab, tabs]);

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

  // Solo salta a una solapa si el rol actual la tiene: p.ej. Impresión no
  // tiene "Pendientes", así que un evento de Agenda de una receta que
  // todavía no pasó a producción no navega a ningún lado (B-31 decide el
  // ruteo real; por ahora simplemente no hay adónde ir).
  function irATabSiPermitido(id: string) {
    if (permitido.has(id)) setTab(id);
  }

  function irARegistro(r: Registro) {
    const destino = r.enProduccion ? 'prod' : 'pt';
    if (!permitido.has(destino)) return;
    setTab(destino);
    setFocoId(r.id);
  }

  const sinFechaPT = ptProceso.filter((r) => !r.deadline);
  function irASinFechaPT() {
    if (sinFechaPT.length === 0) return;
    irATabSiPermitido(sinFechaPT.some((r) => r.enProduccion) ? 'prod' : 'pt');
  }

  // Adaptan PT/PI a la forma genérica que consume <Agenda>. Admin e
  // Impresión ven la Agenda de PT (igual a la de siempre); Formulación ve
  // lotes de PI en su lugar — como registros_pi no tiene fecha de entrega,
  // todos caen en el bloque "sin fecha" (decisión de producto B-30b).
  const eventosPT: EventoAgenda[] = useMemo(
    () => ptProceso.map((r) => ({
      id: r.id,
      deadline: r.deadline,
      titulo: r.paciente || 'SIN NOMBRE',
      subtitulo: (r.formula ?? [])[0]?.activo,
      original: r,
    })),
    [ptProceso]
  );
  const eventosPI: EventoAgenda[] = useMemo(
    () => piProceso.map((r) => ({
      id: r.id,
      deadline: '',
      titulo: limpiarNombreTinta(r.tintaNombre) || r.nombreProducto || 'Lote PI',
      subtitulo: formatoLotePI(r.poe, r.loteNumero),
      original: r,
    })),
    [piProceso]
  );

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
            : t.id === 'agenda' || t.id === 'agenda-pt' ? vencidasCount
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

      {/* Agenda combinada por rol: Impresión ve PT, Formulación ve PI. */}
      {tab === 'agenda' && catalogos && permitido.has('agenda') && (
        yo?.rol === 'formulacion' ? (
          <Agenda eventos={eventosPI} onIrAEvento={() => irATabSiPermitido('pi')} onIrASinFecha={() => irATabSiPermitido('pi')} />
        ) : (
          <Agenda eventos={eventosPT} onIrAEvento={(o) => irARegistro(o as Registro)} onIrASinFecha={irASinFechaPT} />
        )
      )}
      {/* Admin (B-30b-fix): las mismas dos vistas, separadas en solapas propias. */}
      {tab === 'agenda-pt' && catalogos && permitido.has('agenda-pt') && (
        <Agenda eventos={eventosPT} onIrAEvento={(o) => irARegistro(o as Registro)} onIrASinFecha={irASinFechaPT} />
      )}
      {tab === 'agenda-pi' && catalogos && permitido.has('agenda-pi') && (
        <Agenda eventos={eventosPI} onIrAEvento={() => irATabSiPermitido('pi')} onIrASinFecha={() => irATabSiPermitido('pi')} />
      )}
      {tab === 'lector' && catalogos && permitido.has('lector') && (
        <LectorRecetas catalogos={catalogos}
          onCreados={(primerId) => { recargar(); setTab('pt'); setFocoId(primerId); }} />
      )}
      {tab === 'prod' && catalogos && permitido.has('prod') && (
        <EnProceso registros={enProduccion} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistro} enProduccion rol={yo?.rol}
          focoInicialId={focoId} onFocoConsumido={() => setFocoId(null)} />
      )}
      {tab === 'pt' && catalogos && permitido.has('pt') && (
        <EnProceso registros={pendientes} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistro} enProduccion={false} rol={yo?.rol}
          focoInicialId={focoId} onFocoConsumido={() => setFocoId(null)} />
      )}
      {tab === 'preprod' && permitido.has('preprod') && <PreProduccion />}
      {tab === 'pi' && catalogos && permitido.has('pi') && (
        <ProductoIntermedio registros={piProceso} catalogos={catalogos} onCambio={recargar}
          onActualizado={actualizarRegistroPi} />
      )}
      {tab === 'neces' && catalogos && permitido.has('neces') && (
        <Necesidades registros={ptProceso} catalogos={catalogos}
          onCambio={recargar} onIrPI={() => irATabSiPermitido('pi')} />
      )}
      {tab === 'terminados' && permitido.has('terminados') && (
        <Terminados registros={ptTerm} registrosPi={piTerm} onCambio={recargar}
          mostrarPT={yo?.rol !== 'formulacion'} mostrarPI={yo?.rol !== 'impresion'} />
      )}
      {tab === 'estadistica' && permitido.has('estadistica') && (
        <Estadistica registros={ptTerm} registrosPi={piTerm} />
      )}
      {tab === 'gestion' && catalogos && permitido.has('gestion') && <Admin catalogos={catalogos} onCambio={recargar} />}
      {tab === 'usuarios' && permitido.has('usuarios') && <GestionUsuarios miId={yo!.uid} />}
      {!catalogos && <p className="text-slate-500">Cargando…</p>}
    </main>
  );
}
