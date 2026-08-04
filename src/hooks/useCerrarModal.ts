'use client';
import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

// Cierra el modal solo si mousedown Y mouseup ocurrieron sobre el backdrop
// (evita que una selección de texto que termina fuera del modal lo cierre),
// y también con la tecla Escape.
export function useCerrarModal(onCerrar: () => void, activo = true) {
  const mousedownEnBackdrop = useRef(false);

  useEffect(() => {
    if (!activo) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCerrar, activo]);

  return {
    onMouseDown: (e: MouseEvent<HTMLDivElement>) => {
      mousedownEnBackdrop.current = e.target === e.currentTarget;
    },
    onMouseUp: (e: MouseEvent<HTMLDivElement>) => {
      if (mousedownEnBackdrop.current && e.target === e.currentTarget) {
        onCerrar();
      }
      mousedownEnBackdrop.current = false;
    },
  };
}
