'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP } from '@/lib/config';
import MarcaMalvinas from '@/components/MarcaMalvinas';

// Asistente de configuración inicial (B-30a): sólo se puede usar mientras
// `usuarios` está vacía. La contraseña la escribe quien esté frente a la
// pantalla — nunca se le pide a nadie por otro medio ni queda guardada en
// ningún archivo.
export default function Setup() {
  const [cargando, setCargando] = useState(true);
  const [yaConfigurado, setYaConfigurado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((d) => setYaConfigurado(!d.necesitaSetup))
      .finally(() => setCargando(false));
  }, []);

  async function crearAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, usuario, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/');
      } else {
        setError(data.error || 'No se pudo crear la cuenta');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <main className="flex min-h-screen items-center justify-center p-4"><p>Cargando…</p></main>;
  }

  if (yaConfigurado) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-3 p-8 text-center">
          <p className="text-sm text-turba">Esta app ya tiene un administrador configurado.</p>
          <a href="/login" className="btn-primary inline-block w-full">Ir al login</a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={crearAdmin} className="card w-full max-w-sm space-y-4 p-8">
        <div className="text-center">
          <MarcaMalvinas variante="positiva" className="mx-auto mb-3 h-12 w-auto" />
          <h1 className="font-archivo text-2xl font-bold text-profundo">{APP.nombre}</h1>
          <p className="text-sm text-niebla">Configuración inicial — creá la primera cuenta admin</p>
        </div>
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
        </div>
        <div>
          <label className="label">Usuario</label>
          <input className="input" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" required />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input type="password" className="input" value={password}
            onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </div>
        <div>
          <label className="label">Confirmar contraseña</label>
          <input type="password" className="input" value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)} minLength={8} required />
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear cuenta admin'}
        </button>
      </form>
    </main>
  );
}
