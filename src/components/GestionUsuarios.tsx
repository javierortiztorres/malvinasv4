'use client';
import { useEffect, useState } from 'react';

// Gestión de usuarios (B-30a) — solo la ve/usa quien tiene rol admin.
// El servidor vuelve a chequear el rol en cada endpoint de /api/usuarios,
// esto es solo la pantalla. Sistema aparte de `operadores` (quién firma
// un documento PT/PI): no se tocan entre sí.
type UsuarioFila = { id: number; nombre: string; usuario: string; rol: string; activo: boolean };

const ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'impresion', label: 'Impresión' },
  { id: 'formulacion', label: 'Formulación' },
];

export default function GestionUsuarios({ miId }: { miId: number }) {
  const [lista, setLista] = useState<UsuarioFila[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('impresion');
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  async function recargar() {
    const res = await fetch('/api/usuarios');
    if (res.ok) setLista(await res.json());
  }

  useEffect(() => { recargar(); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreando(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, usuario, password, rol }),
      });
      const data = await res.json();
      if (res.ok) {
        setNombre(''); setUsuario(''); setPassword(''); setRol('impresion');
        recargar();
      } else {
        setError(data.error || 'No se pudo crear la cuenta');
      }
    } finally {
      setCreando(false);
    }
  }

  async function desactivar(u: UsuarioFila) {
    if (!confirm(`¿Desactivar la cuenta de ${u.nombre} (${u.usuario})?`)) return;
    const res = await fetch(`/api/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false }),
    });
    if (res.ok) recargar();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo desactivar');
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <h3 className="section-title mb-0">👤 Usuarios · {lista?.length ?? '…'}</h3>

      <form onSubmit={crear} className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
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
          <label className="label">Rol</label>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-4">
          {error && <p className="mb-2 text-sm font-medium text-red-600">{error}</p>}
          <button className="btn-primary" disabled={creando}>{creando ? 'Creando…' : '+ Nueva cuenta'}</button>
        </div>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500">
            <th className="py-1.5">Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(lista ?? []).map((u) => (
            <tr key={u.id} className="border-t border-slate-100">
              <td className="py-1.5 pr-2 font-medium">{u.nombre}</td>
              <td className="pr-2 font-mono text-xs">{u.usuario}</td>
              <td className="pr-2">{ROLES.find((r) => r.id === u.rol)?.label ?? u.rol}</td>
              <td className="pr-2">
                <span className={`badge ${u.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {u.activo ? 'activo' : 'desactivado'}
                </span>
              </td>
              <td className="whitespace-nowrap">
                {u.activo && u.id !== miId && (
                  <button className="text-red-500" onClick={() => desactivar(u)}>Desactivar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
