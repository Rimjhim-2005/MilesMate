import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const KM_PER_MILE = 1.609344;

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [week, setWeek] = useState(Array(7).fill(0));
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.stats(30), api.trips(100)])
      .then(([s, trips]) => {
        setStats(s);
        const cutoff = Date.now() - 30 * 864e5;
        const counts = Array(7).fill(0);
        trips.filter((t) => new Date(t.startedAt) >= cutoff).forEach((t) => {
          counts[(new Date(t.startedAt).getDay() + 6) % 7]++; // Mon = 0
        });
        setWeek(counts);
      })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="text-red-300">{err}</p>;
  if (!stats) return <p className="text-white/60">Loading…</p>;

  const km = Math.round(stats.miles * KM_PER_MILE);
  const max = Math.max(...week, 1);
  const hours = stats.busiestHours.map((h) => `${h.hour}:00`).slice(0, 2).join(', ');

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-sage p-5 text-ink">
        <p className="text-xs">Last {stats.days} days</p>
        <p className="text-5xl font-bold tracking-tight">₹{stats.earned.toLocaleString('en-IN')}</p>
        {stats.mostProfitableArea && <p className="mt-2 text-right text-sm font-semibold text-moss">Best area: {stats.mostProfitableArea}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-clay p-5 text-white">
          <Icon name="route" className="!text-7xl text-fog" />
          <p className="text-2xl font-bold">{km} KM</p>
          <p className="text-xs">Distance traveled</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-moss p-5 text-white">
          <Icon name="two_wheeler" className="!text-7xl" />
          <p className="text-2xl font-bold">{stats.trips}</p>
          <p className="text-xs">Total Deliveries</p>
        </div>
      </div>

      <div className="rounded-3xl bg-plum p-5">
        <div className="flex h-48 items-end justify-between gap-2 border-b border-white/30">
          {week.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end">
              <div className="w-full rounded-sm bg-[#d9c6e4]" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 4 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between gap-2 text-[10px] text-white">
          {DAYS.map((d) => <span key={d} className="flex-1 text-center">{d}</span>)}
        </div>
        <p className="mt-3 text-xs text-white/60">Deliveries per weekday{hours && ` · busiest around ${hours} IST`}{stats.safestArea && ` · safest area: ${stats.safestArea}`}</p>
      </div>
    </div>
  );
}
