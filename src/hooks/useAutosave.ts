'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const REINTENTO_MS = 10000;
const DEBOUNCE_MS = 700;

type ConId = { id: number; updatedAt: Date };
type DraftGuardado<T> = { data: T; pendienteSync: boolean };

// Persistencia híbrida compartida por los editores (PT y PI):
// draft en localStorage + PUT con debounce, con flush al desmontar/cerrar
// pestaña, rehidratación por flag de sincronización (no por reloj) y
// reintento automático mientras haya cambios sin confirmar.
export function useAutosave<T extends ConId>(
  registro: T,
  opts: {
    draftKey: (id: number) => string;
    endpoint: (id: number) => string;
    onActualizado: (r: T) => void;
  }
) {
  const { draftKey, endpoint, onActualizado } = opts;

  const [r, setR] = useState<T>(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(draftKey(registro.id));
      if (raw) {
        try {
          const draft = JSON.parse(raw) as DraftGuardado<T>;
          if (draft.pendienteSync) return draft.data;
        } catch {}
      }
    }
    return registro;
  });
  const [sync, setSync] = useState<'ok' | 'guardando' | 'pendiente'>('ok');
  const [sesionVencida, setSesionVencida] = useState(false);
  const [errorStorage, setErrorStorage] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  const rRef = useRef(r);
  rRef.current = r;
  const pendienteRef = useRef(false);
  const sesionVencidaRef = useRef(false);

  const guardarDraft = useCallback(
    (data: T, pendienteSync: boolean) => {
      try {
        if (pendienteSync) {
          localStorage.setItem(draftKey(data.id), JSON.stringify({ data, pendienteSync: true }));
        } else {
          localStorage.removeItem(draftKey(data.id));
        }
        setErrorStorage(false);
      } catch {
        // Ej. QuotaExceededError: no lo tragamos, avisamos.
        setErrorStorage(true);
      }
    },
    [draftKey]
  );

  const sincronizar = useCallback(
    async (data: T) => {
      setSync('guardando');
      try {
        const res = await fetch(endpoint(data.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.status === 401) {
          sesionVencidaRef.current = true;
          setSesionVencida(true);
          setSync('pendiente');
          return;
        }
        if (!res.ok) throw new Error();
        pendienteRef.current = false;
        sesionVencidaRef.current = false;
        setSesionVencida(false);
        guardarDraft(data, false);
        setSync('ok');
      } catch {
        setSync('pendiente');
      }
    },
    [endpoint, guardarDraft]
  );

  const set = useCallback(
    (patch: Partial<T>) => {
      const next = { ...rRef.current, ...patch, updatedAt: new Date() } as T;
      rRef.current = next;
      pendienteRef.current = true;
      setR(next);
      guardarDraft(next, true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => sincronizar(next), DEBOUNCE_MS);
      onActualizado(next);
    },
    [sincronizar, onActualizado, guardarDraft]
  );

  // Flush: si queda un PUT pendiente por debounce al desmontar o al cerrar
  // la pestaña, se envía de inmediato en vez de perderse.
  useEffect(() => {
    const flush = () => {
      if (pendienteRef.current) {
        clearTimeout(timer.current);
        sincronizar(rRef.current);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
      clearTimeout(timer.current);
    };
  }, [sincronizar]);

  // Reintento mientras haya algo sin sincronizar: al volver la conexión y
  // por poleo cada 10 s (401 no reintenta solo: requiere recargar/reloguear).
  useEffect(() => {
    const reintentar = () => {
      if (pendienteRef.current && !sesionVencidaRef.current) sincronizar(rRef.current);
    };
    window.addEventListener('online', reintentar);
    const interval = setInterval(reintentar, REINTENTO_MS);
    return () => {
      window.removeEventListener('online', reintentar);
      clearInterval(interval);
    };
  }, [sincronizar]);

  return { r, set, sync, sesionVencida, errorStorage };
}
