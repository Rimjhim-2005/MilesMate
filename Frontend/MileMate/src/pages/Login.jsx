import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', vehicleInfo: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      const body = mode === 'login'
        ? { email: f.email, password: f.password }
        : { name: f.name, email: f.email, password: f.password, vehicleInfo: f.vehicleInfo || undefined };
      const { token, user } = await (mode === 'login' ? api.login(body) : api.signup(body));
      setToken(token);
      onAuth(user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-2xl bg-mist px-4 py-3 text-sm text-ink placeholder:text-ink/50 outline-none focus:ring-2 focus:ring-sage';
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-6">
      <h1 className="mb-4 text-3xl font-bold text-sage">MilesMate</h1>
      {mode === 'signup' && <input className={input} placeholder="Name" value={f.name} onChange={set('name')} />}
      <input className={input} placeholder="Email" type="email" value={f.email} onChange={set('email')} />
      <input className={input} placeholder="Password (8+ characters)" type="password" value={f.password} onChange={set('password')} />
      {mode === 'signup' && <input className={input} placeholder="Vehicle (optional)" value={f.vehicleInfo} onChange={set('vehicleInfo')} />}
      {err && <p className="text-sm text-red-300">{err}</p>}
      <button onClick={submit} disabled={busy} className="rounded-2xl bg-sage py-3 font-semibold text-ink disabled:opacity-60">
        {mode === 'login' ? 'Log in' : 'Create account'}
      </button>
      <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-sm text-white/70">
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </div>
  );
}
