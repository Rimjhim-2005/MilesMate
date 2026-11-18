import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// Photon (OSM-based) supports search-as-you-type; Nominatim's public server does not allow it.
const toPlace = (f) => {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const name = p.name || p.street || "Unnamed place";
  const rest = [p.name && p.street, p.district, p.city, p.state].filter(
    (x, i, a) => x && x !== name && a.indexOf(x) === i,
  );
  return {
    lat,
    lng,
    name,
    sub: rest.join(", "),
    label: [name, ...rest.slice(-2)].join(", "),
  };
};

export default function SearchBox({ origin, busy, onSelect }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const skip = useRef(false); // don't re-search right after picking

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (q.trim().length < 3) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const bias = origin ? `&lat=${origin.lat}&lon=${origin.lng}` : "";
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en${bias}`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        setItems((data.features || []).map(toPlace));
        setActive(-1);
        setOpen(true);
      } catch (e) {
        if (e.name !== "AbortError") setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, origin]);

  function pick(place) {
    skip.current = true;
    setQ(place.name);
    setOpen(false);
    onSelect(place);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && items.length) {
      e.preventDefault();
      pick(items[active >= 0 ? active : 0]);
    } else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative z-[1100]">
      <div className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
        <Icon name="search" className="text-ink" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          placeholder="Where to?"
          className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-ink/70"
        />
        {(busy || loading) && (
          <Icon name="progress_activity" className="animate-spin text-ink" />
        )}
        {q && !busy && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ("");
              setItems([]);
            }}
            aria-label="Clear"
            className="text-ink"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {open && q.trim().length >= 3 && (
        <ul className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl bg-mist shadow-lg">
          {items.length === 0 && !loading && (
            <li className="px-4 py-3 text-sm text-ink/60">
              No matches. Try another spelling or add the area name.
            </li>
          )}
          {items.map((p, i) => (
            <li key={`${p.lat},${p.lng},${i}`}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left ${i === active ? "bg-sage/60" : "hover:bg-sage/40"}`}
              >
                <Icon
                  name="location_on"
                  className="mt-0.5 text-lg text-ink/70"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {p.name}
                  </span>
                  {p.sub && (
                    <span className="block truncate text-xs text-ink/60">
                      {p.sub}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
