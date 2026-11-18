const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const getToken = () => localStorage.getItem('token');
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'));

async function req(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) window.dispatchEvent(new Event('logout')); // expired token -> back to login
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (b) => req('/api/auth/login', { method: 'POST', body: b }),
  signup: (b) => req('/api/auth/signup', { method: 'POST', body: b }),
  me: () => req('/api/users/me'),
  updateMe: (b) => req('/api/users/me', { method: 'PUT', body: b }),
  stats: (days = 30) => req(`/api/dashboard/stats?days=${days}`),
  trips: (limit = 100) => req(`/api/trips?limit=${limit}`),
  forum: (q) => req('/api/forum/search?' + new URLSearchParams(q)),
  nearby: (lat, lng, radius = 1000) => req(`/api/forum/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  createPost: (b) => req('/api/forum', { method: 'POST', body: b }),
  vote: (id, value) => req(`/api/forum/${id}/vote`, { method: 'POST', body: { value } }),
};

// Current position, falls back to Bhubaneswar if denied/unavailable
const FALLBACK = { lat: 20.2961, lng: 85.8245 };
export const getPos = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(FALLBACK);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(FALLBACK),
      { timeout: 5000 }
    );
  });
