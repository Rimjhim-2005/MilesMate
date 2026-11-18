import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import NavBar from './components/NavBar.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Forums from './pages/Forums.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [tab, setTab] = useState('home');

  const logout = () => { setToken(null); setUser(null); };

  useEffect(() => {
    if (getToken()) api.me().then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
    window.addEventListener('logout', logout);
    return () => window.removeEventListener('logout', logout);
  }, []);

  if (!ready) return null;
  if (!user) return <Login onAuth={setUser} />;

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-8 font-sans">
      {tab === 'home' && <Home />}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'forums' && <Forums />}
      {tab === 'settings' && <Settings user={user} onUser={setUser} onLogout={logout} />}
      <NavBar tab={tab} onChange={setTab} />
    </div>
  );
}
