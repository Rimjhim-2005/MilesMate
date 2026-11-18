import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  useMap,
} from "react-leaflet";
import { api, getPos } from "../api.js";
import Icon from "../components/Icon.jsx";
import SearchBox from "../components/SearchBox.jsx";

const SEV_COLOR = { Low: "#7fb069", Medium: "#e0a93b", High: "#d9534f" };

function Fit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });
    else if (points.length === 1) map.setView(points[0], 14);
  }, [points, map]);
  return null;
}

export default function Home() {
  const [origin, setOrigin] = useState(null);
  const [dest, setDest] = useState(null);
  const [route, setRoute] = useState(null); // { coords, km, min }
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getPos().then(setOrigin);
  }, []);

  async function selectPlace(d) {
    if (!origin) return;
    setBusy(true);
    setErr("");
    try {
      // Route via public OSRM demo server (fine for dev, swap for your own later)
      const r = await (
        await fetch(
          `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`,
        )
      ).json();
      const best = r.routes?.[0];
      if (!best) throw new Error("No route found.");
      setDest(d);
      setRoute({
        coords: best.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        km: best.distance / 1000,
        min: Math.round(best.duration / 60),
      });
      setPosts(await api.nearby(d.lat, d.lng, 1000));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const counts = posts.reduce(
    (a, p) => ((a[p.category] = (a[p.category] || 0) + 1), a),
    {},
  );
  const points = route
    ? route.coords
    : origin
      ? [[origin.lat, origin.lng]]
      : [];

  return (
    <div className="flex flex-col gap-4">
      {dest ? (
        <div className="rounded-3xl bg-slate p-3">
          <div className="rounded-2xl bg-mist px-4 py-2 text-sm text-ink">
            <p className="flex items-center gap-2">
              <Icon name="my_location" className="text-base" /> Current location
            </p>
            <p className="mt-2 flex items-center gap-2 border-t border-ink/20 pt-2">
              <Icon name="location_on" className="text-base" /> {dest.label}
            </p>
          </div>
        </div>
      ) : null}

      <SearchBox origin={origin} busy={busy} onSelect={selectPlace} />
      {err && <p className="text-sm text-red-300">{err}</p>}

      <div className="rounded-3xl bg-slate p-5 text-xs leading-relaxed text-white/90">
        {route ? (
          <>
            <p className="mb-2 text-base font-semibold text-sage">
              {route.min} min · {route.km.toFixed(1)} km
            </p>
            {posts.length === 0 ? (
              <p>No reports within 1 km of the destination.</p>
            ) : (
              <p>
                {posts.length} report{posts.length > 1 && "s"} near the
                destination:{" "}
                {Object.entries(counts)
                  .map(([c, n]) => `${n} ${c.toLowerCase()}`)
                  .join(", ")}
                .
              </p>
            )}
            <p className="mt-2 text-white/50">
              AI summary coming once the ML service is ready.
            </p>
          </>
        ) : (
          <p>Search for a location to get a summary.</p>
        )}
      </div>

      <div className="h-80 overflow-hidden rounded-3xl bg-mist">
        {origin && (
          <MapContainer
            center={[origin.lat, origin.lng]}
            zoom={13}
            scrollWheelZoom
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CircleMarker
              center={[origin.lat, origin.lng]}
              radius={7}
              pathOptions={{
                color: "#fff",
                fillColor: "#3b6fd4",
                fillOpacity: 1,
              }}
            />
            {route && (
              <Polyline
                positions={route.coords}
                pathOptions={{ color: "#3a1fd4", weight: 5 }}
              />
            )}
            {dest && (
              <CircleMarker
                center={[dest.lat, dest.lng]}
                radius={8}
                pathOptions={{
                  color: "#fff",
                  fillColor: "#d9534f",
                  fillOpacity: 1,
                }}
              />
            )}
            {posts.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={6}
                pathOptions={{
                  color: SEV_COLOR[p.severity] || "#999",
                  fillOpacity: 0.7,
                }}
              />
            ))}
            <Fit points={points} />
          </MapContainer>
        )}
      </div>
      {route && (
        <p className="text-center text-2xl font-bold text-sage">
          ETA : {route.min}m
        </p>
      )}
    </div>
  );
}
