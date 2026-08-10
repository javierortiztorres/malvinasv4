'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP } from '@/lib/config';
import MarcaMalvinas from '@/components/MarcaMalvinas';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Usuario o contraseña incorrectos');
      }
    } catch {
      setError('No se pudo conectar con el servidor. Probá de nuevo.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="card w-full max-w-sm space-y-4 p-8">
        <div className="text-center">
          <MarcaMalvinas variante="positiva" className="mx-auto mb-3 h-12 w-auto" />
          <h1 className="font-archivo text-2xl font-bold text-profundo">{APP.nombre}</h1>
          <p className="text-sm text-niebla">{APP.subtitulo}</p>
        </div>
        <div>
          <label className="label">Usuario</label>
          <input className="input" value={usuario}
            onChange={(e) => setUsuario(e.target.value)} autoFocus autoCapitalize="none" />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input type="password" className="input" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-primary w-full">Entrar</button>
      </form>
    </main>
  );
}
