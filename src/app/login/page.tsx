'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP } from '@/lib/config';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push('/');
    else setError('Contraseña incorrecta');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="card w-full max-w-sm space-y-4 p-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-3xl">💊</div>
          <h1 className="text-2xl font-black">{APP.nombre}</h1>
          <p className="text-sm text-slate-500">{APP.subtitulo}</p>
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input type="password" className="input" value={password}
            onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button className="btn-primary w-full">Entrar</button>
      </form>
    </main>
  );
}
