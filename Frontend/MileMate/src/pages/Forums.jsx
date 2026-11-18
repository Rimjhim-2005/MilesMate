import { useEffect, useState } from 'react';
import { api, getPos } from '../api.js';
import Icon from '../components/Icon.jsx';

const CATS = ['Traffic', 'Road Hazard', 'Accident', 'Construction', 'Waterlogging', 'Safety Concern', 'Route Tip', 'Normal'];
const SEVS = ['Low', 'Medium', 'High'];
const SEV_STARS = { Low: 5, Medium: 3, High: 1 }; // fewer stars = more severe

function Stars({ n }) {
  return (
    <div className="flex text-ink">
      {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" fill={i <= n} className="!text-base" />)}
    </div>
  );
}

function PostForm({ onDone }) {
  const [f, setF] = useState({ body: '', category: 'Route Tip', severity: 'Low', locationLabel: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const field = 'w-full rounded-xl bg-mist px-3 py-2 text-sm text-ink outline-none';

  async function submit() {
    setErr('');
    try {
      const { lat, lng } = await getPos();
      await api.createPost({ ...f, lat, lng, locationLabel: f.locationLabel || undefined });
      onDone();
    } catch (e) { setErr(e.message); }
  }
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-slate p-4">
      <textarea className={field} rows={3} placeholder="What should other drivers know here?" value={f.body} onChange={set('body')} />
      <input className={field} placeholder="Place name (optional)" value={f.locationLabel} onChange={set('locationLabel')} />
      <div className="flex gap-2">
        <select className={field} value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={field} value={f.severity} onChange={set('severity')}>{SEVS.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {err && <p className="text-sm text-red-300">{err}</p>}
      <button onClick={submit} className="rounded-xl bg-sage py-2 text-sm font-semibold text-ink">Post tip</button>
    </div>
  );
}

export default function Forums() {
  const [tab, setTab] = useState('region');
  const [kw, setKw] = useState('');
  const [posts, setPosts] = useState([]);
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { getPos().then(setPos); }, []);

  async function load() {
    setErr('');
    try {
      const q = { limit: 30 };
      if (kw.trim()) q.keyword = kw.trim();
      if (tab === 'region' && pos) Object.assign(q, { lat: pos.lat, lng: pos.lng, radius: 3000 });
      else q.sort = 'new';
      setPosts(await api.forum(q));
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => {
    if (tab === 'region' && !pos) return;
    const t = setTimeout(load, 300); // debounce search
    return () => clearTimeout(t);
  }, [kw, tab, pos]);

  async function vote(p) {
    try {
      const next = p.user_vote === 1 ? 0 : 1;
      const r = await api.vote(p.id, next);
      setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, upvote_count: r.upvote_count, user_vote: r.user_vote } : x)));
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
        <Icon name="search" className="text-ink" />
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Search forums..." className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/60" />
        <button onClick={() => setAdding(!adding)} aria-label="New tip" className="text-ink"><Icon name={adding ? 'close' : 'add_circle'} /></button>
      </div>

      {adding && <PostForm onDone={() => { setAdding(false); load(); }} />}

      <div className="flex border-b border-white/40 text-sm font-semibold text-white">
        {[['region', 'Your region'], ['new', 'Newest']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 pb-2 ${tab === id ? 'border-b-4 border-white' : 'text-white/60'}`}>{label}</button>
        ))}
      </div>

      {err && <p className="text-sm text-red-300">{err}</p>}
      {posts.length === 0 && !err && <p className="text-center text-sm text-white/50">No tips here yet. Be the first to post one.</p>}

      {posts.map((p) => (
        <article key={p.id} className="rounded-3xl bg-fog p-4 text-ink">
          <div className="flex items-start gap-2">
            <Icon name="location_on" className="mt-0.5 text-lg" />
            <div className="flex-1">
              <p className="text-sm font-semibold">{p.location_label || p.title || p.category}</p>
              <Stars n={SEV_STARS[p.severity] ?? 3} />
            </div>
            <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px]">{p.category}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed">{p.body}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-ink/70">
            <button onClick={() => vote(p)} className={`flex items-center gap-1 ${p.user_vote === 1 ? 'font-bold text-wine' : ''}`}>
              <Icon name="thumb_up" fill={p.user_vote === 1} className="!text-base" /> {p.upvote_count}
            </button>
            <span className="flex items-center gap-1"><Icon name="chat_bubble" className="!text-base" /> {p.comment_count}</span>
            <span className="ml-auto">{p.author || 'MilesMate'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
