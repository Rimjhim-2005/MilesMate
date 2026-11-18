import { useState } from 'react';
import { api } from '../api.js';

export default function Settings({ user, onUser, onLogout }) {
  const [name, setName] = useState(user.name);
  const [vehicle, setVehicle] = useState(user.vehicleInfo || '');
  const [msg, setMsg] = useState('');
  const field = 'w-full rounded-2xl bg-mist px-4 py-3 text-sm text-ink outline-none';

  async function save() {
    setMsg('');
    try {
      onUser(await api.updateMe({ name, vehicleInfo: vehicle }));
      setMsg('Saved');
    } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/60">{user.email}</p>
      <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input className={field} value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Vehicle" />
      <button onClick={save} className="rounded-2xl bg-sage py-3 font-semibold text-ink">Save changes</button>
      {msg && <p className="text-sm text-white/70">{msg}</p>}
      <button onClick={onLogout} className="mt-4 rounded-2xl border border-white/30 py-3 text-white">Log out</button>
    </div>
  );
}
