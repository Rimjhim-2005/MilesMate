import Icon from './Icon.jsx';

const TABS = [
  { id: 'home', icon: 'home' },
  { id: 'dashboard', icon: 'bar_chart' },
  { id: 'forums', icon: 'forum' },
  { id: 'settings', icon: 'settings' },
];

export default function NavBar({ tab, onChange }) {
  return (
    <nav className="fixed bottom-5 left-1/2 z-[1000] flex w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 justify-between rounded-full bg-sage p-1.5">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-label={t.id}
          className={`flex h-11 flex-1 items-center justify-center rounded-full transition-colors ${
            tab === t.id ? 'bg-wine text-white' : 'text-ink/80'
          }`}
        >
          <Icon name={t.icon} fill={tab === t.id} />
        </button>
      ))}
    </nav>
  );
}
