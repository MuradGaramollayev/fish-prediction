import { useState, useCallback, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, useMap } from "react-leaflet";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../api.js";
import { useAuth } from "../App.jsx";

const LAYERS = {
  score: { label: "Fish Probability", key: "score", min: 0, max: 100, low: "#ef4444", high: "#22c55e", unit: "%" },
  temperature: { label: "Sea Surface Temp", key: "temperature", min: 15, max: 30, low: "#3b82f6", high: "#ef4444", unit: "°C" },
  chlorophyll: { label: "Chlorophyll-a", key: "chlorophyll", min: 0.1, max: 5, low: "#0b3b2e", high: "#22c55e", unit: "mg/m³" },
  turbidity: { label: "Turbidity", key: "turbidity", min: 0, max: 10, low: "#e0f2fe", high: "#92400e", unit: "NTU" },
  wind_speed: { label: "Wind Speed", key: "wind_speed", min: 0, max: 20, low: "#f5f5f5", high: "#7c3aed", unit: "m/s" },
};

function lerpColor(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `rgb(${rr},${rg},${rb})`;
}
function valueColor(value, cfg) {
  const t = Math.min(1, Math.max(0, (value - cfg.min) / (cfg.max - cfg.min)));
  return lerpColor(cfg.low, cfg.high, t);
}
function scoreColor(score) {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#eab308";
  return "#ef4444";
}
function sustainabilityColor(index) {
  if (index === "Stable") return "#22c55e";
  if (index === "Moderate Risk") return "#eab308";
  return "#ef4444";
}

function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/api/statistics").then((res) => setStats(res.data)); }, []);
  if (!stats) return <p>Loading...</p>;
  return (
    <div>
      <div className="grid grid-4">
        <div className="card stat-card"><p className="stat-label">📊 Total Predictions</p><h2>{stats.total_predictions}</h2></div>
        <div className="card stat-card"><p className="stat-label">🎯 High Probability Zones</p><h2>{stats.high_probability_zones}</h2></div>
        <div className="card stat-card"><p className="stat-label">📈 Average Score</p><h2>{stats.average_score}%</h2></div>
        <div className="card stat-card"><p className="stat-label">🗺️ Regions Tracked</p><h2>{stats.regions.length}</h2></div>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <h3>Regional Breakdown</h3>
        <table>
          <thead><tr><th>Region</th><th>Avg Score</th><th>Predictions</th></tr></thead>
          <tbody>
            {stats.regions.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td style={{ color: scoreColor(r.avg_score) }}>{r.avg_score}%</td><td>{r.predictions}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoundsWatcher({ onBoundsChange }) {
  const map = useMapEvents({ moveend: () => onBoundsChange(map.getBounds()) });
  return null;
}
function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => { if (position) map.setView(position, 7); }, [position]);
  return null;
}
function Legend({ cfg }) {
  return (
    <div className="legend">
      <div className="legend-title">{cfg.label}</div>
      <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${cfg.low}, ${cfg.high})` }} />
      <div className="legend-labels"><span>{cfg.min}{cfg.unit}</span><span>{cfg.max}{cfg.unit}</span></div>
    </div>
  );
}

function MapView() {
  const [lat, setLat] = useState(38.5);
  const [lon, setLon] = useState(1.5);
  const [points, setPoints] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState("score");
  const [currentBounds, setCurrentBounds] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [flyToPosition, setFlyToPosition] = useState(null);

  const cfg = LAYERS[activeLayer];

  const loadGrid = useCallback(async (boundsStr) => {
    const res = await api.get("/api/map-data", { params: { bounds: boundsStr } });
    setPoints(res.data.points);
  }, []);

  useEffect(() => { loadGrid(`${lat - 3},${lon - 3},${lat + 3},${lon + 3}`); }, []);

  async function handlePredict() {
    setLoading(true);
    try {
      const res = await api.post("/api/predict-fish", { lat: Number(lat), lon: Number(lon) });
      setPrediction(res.data);
      await loadGrid(`${Number(lat) - 3},${Number(lon) - 3},${Number(lat) + 3},${Number(lon) + 3}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadArea() {
    if (!currentBounds) return;
    const b = currentBounds;
    await loadGrid(`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: searchQuery, format: "json", limit: 5 },
    });
    setSearchResults(res.data);
  }

  function selectResult(r) {
    const newLat = parseFloat(r.lat);
    const newLon = parseFloat(r.lon);
    setLat(newLat.toFixed(4));
    setLon(newLon.toFixed(4));
    setFlyToPosition([newLat, newLon]);
    setSearchResults([]);
    setSearchQuery(r.display_name);
  }

  async function handleSaveZone() {
    const name = window.prompt("Name this zone:", `Zone ${lat}, ${lon}`);
    if (!name) return;
    await api.post("/api/zones", { name, lat: Number(lat), lon: Number(lon) });
    window.alert("Zone saved! Check the Zones tab.");
  }

  const breakdownData = prediction
    ? Object.entries(prediction.breakdown).map(([factor, value]) => ({ factor, value }))
    : [];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, position: "relative" }}>
        <label>Search Location</label>
        <div className="search-row">
          <input
            placeholder="e.g. Baku, Mediterranean Sea..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button className="btn btn-secondary" onClick={handleSearch}>Search</button>
        </div>
        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((r, i) => (
              <div key={i} className="search-result-item" onClick={() => selectResult(r)}>{r.display_name}</div>
            ))}
          </div>
        )}

        <div className="grid grid-2">
          <div>
            <label>Latitude</label>
            <input type="number" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div>
            <label>Longitude</label>
            <input type="number" value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={handlePredict} disabled={loading}>
          {loading ? "Predicting..." : "Predict Fish"}
        </button>
        <button className="btn btn-secondary" onClick={handleLoadArea} style={{ marginLeft: 10 }}>
          Load Data for Current View
        </button>
        {prediction && (
          <button className="btn btn-secondary" onClick={handleSaveZone} style={{ marginLeft: 10 }}>
            ⭐ Save This Zone
          </button>
        )}

        {prediction && (
          <div style={{ marginTop: 16 }}>
            <p>
              Prediction: <strong style={{ color: scoreColor(prediction.probability) }}>
                {prediction.level} ({prediction.probability}%)
              </strong>
            </p>
            <h4 style={{ marginBottom: 4 }}>Why this score? (Factor Breakdown)</h4>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={breakdownData}>
                <PolarGrid stroke="#223049" />
                <PolarAngleAxis dataKey="factor" stroke="#9fb0c3" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#223049" tick={{ fontSize: 10 }} />
                <Radar dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="layer-switcher">
        {Object.entries(LAYERS).map(([key, l]) => (
          <div key={key} className={`tab ${activeLayer === key ? "active" : ""}`} onClick={() => setActiveLayer(key)}>
            {l.label}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <MapContainer center={[lat, lon]} zoom={5} style={{ height: 500, width: "100%" }}>
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
          />
          <BoundsWatcher onBoundsChange={setCurrentBounds} />
          <FlyTo position={flyToPosition} />
          {points.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lon]}
              radius={9}
              pathOptions={{ color: valueColor(p[cfg.key], cfg), fillOpacity: 0.75, weight: 1 }}
            >
              <Popup>
                <strong>{cfg.label}:</strong> {p[cfg.key]}{cfg.unit}<br />
                Score: {p.score}% <br />
                Temp: {p.temperature}°C · Turbidity: {p.turbidity}<br />
                Chlorophyll: {p.chlorophyll} · Wind: {p.wind_speed} m/s
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 1000 }}>
          <Legend cfg={cfg} />
        </div>
      </div>
    </div>
  );
}

function Charts() {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  useEffect(() => {
    api.get("/api/statistics").then((res) => setStats(res.data));
    api.get("/api/reports").then((res) => setReports(res.data.reports.slice().reverse()));
  }, []);
  if (!stats) return <p>Loading...</p>;
  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>Average Score by Region</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.regions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#223049" />
            <XAxis dataKey="name" stroke="#9fb0c3" />
            <YAxis stroke="#9fb0c3" />
            <Tooltip contentStyle={{ background: "#131c2e", border: "1px solid #223049" }} />
            <Bar dataKey="avg_score" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h3>Score Trend (Last 10 Days)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={reports}>
            <CartesianGrid strokeDasharray="3 3" stroke="#223049" />
            <XAxis dataKey="date" stroke="#9fb0c3" />
            <YAxis stroke="#9fb0c3" />
            <Tooltip contentStyle={{ background: "#131c2e", border: "1px solid #223049" }} />
            <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Reports() {
  const [reports, setReports] = useState([]);
  useEffect(() => { api.get("/api/reports").then((res) => setReports(res.data.reports)); }, []);

  function exportCSV() {
    const header = "Date,Lat,Lon,Score,Level\n";
    const rows = reports.map((r) => `${r.date},${r.lat},${r.lon},${r.score},${r.level}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fish_prediction_reports.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Fish Prediction Reports", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
    autoTable(doc, {
      startY: 34,
      head: [["Date", "Lat", "Lon", "Score", "Level"]],
      body: reports.map((r) => [r.date, r.lat, r.lon, `${r.score}%`, r.level]),
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save("fish_prediction_reports.pdf");
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Prediction Reports</h3>
        <div>
          <button className="btn btn-secondary" onClick={exportCSV} style={{ marginRight: 8 }}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={exportPDF}>⬇ PDF</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Lat</th><th>Lon</th><th>Score</th><th>Level</th></tr></thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>{r.date}</td><td>{r.lat}</td><td>{r.lon}</td><td>{r.score}%</td>
              <td style={{ color: scoreColor(r.score) }}>{r.level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Zones() {
  const [zones, setZones] = useState([]);
  const load = () => api.get("/api/zones").then((res) => setZones(res.data.zones));
  useEffect(() => { load(); }, []);
  async function handleDelete(id) {
    await api.delete(`/api/zones/${id}`);
    load();
  }
  return (
    <div className="card">
      <h3>Saved Zones</h3>
      {zones.length === 0 && <p style={{ color: "#9fb0c3" }}>No saved zones yet. Save one from the Map tab.</p>}
      {zones.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Lat</th><th>Lon</th><th>Current Score</th><th>Alert</th><th></th></tr></thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.id}>
                <td>{z.name}</td><td>{z.lat}</td><td>{z.lon}</td>
                <td style={{ color: scoreColor(z.score) }}>{z.score}%</td>
                <td>{z.alert ? <span className="badge badge-alert">🔔 High Probability</span> : "—"}</td>
                <td><button className="btn btn-secondary" onClick={() => handleDelete(z.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CatchLogTab() {
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ lat: "", lon: "", date: new Date().toISOString().slice(0, 10), species: "", quantity: "", notes: "" });
  const load = () => api.get("/api/catch-log").then((res) => setLogs(res.data.logs));
  useEffect(() => { load(); }, []);
  async function handleSubmit(e) {
    e.preventDefault();
    await api.post("/api/catch-log", { ...form, lat: Number(form.lat), lon: Number(form.lon), quantity: Number(form.quantity) });
    setForm({ ...form, lat: "", lon: "", species: "", quantity: "", notes: "" });
    load();
  }
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Log a Catch</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-2">
            <div><label>Latitude</label><input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} required /></div>
            <div><label>Longitude</label><input value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} required /></div>
          </div>
          <div className="grid grid-2">
            <div><label>Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
            <div><label>Species</label><input value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} required /></div>
          </div>
          <label>Quantity (kg)</label>
          <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          <label>Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" type="submit">Save Catch Log</button>
        </form>
      </div>
      <div className="card">
        <h3>Catch History (Predicted vs Actual)</h3>
        {logs.length === 0 && <p style={{ color: "#9fb0c3" }}>No catch logs yet.</p>}
        {logs.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>Species</th><th>Qty (kg)</th><th>Predicted Score at Location</th><th>Notes</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.date}</td><td>{l.species}</td><td>{l.quantity}</td>
                  <td style={{ color: scoreColor(l.predicted_score) }}>{l.predicted_score}%</td>
                  <td>{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ClimateInsights() {
  const [lat, setLat] = useState(38.5);
  const [lon, setLon] = useState(1.5);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    setLoading(true);
    try {
      const res = await api.get("/api/climate-forecast", { params: { lat: Number(lat), lon: Number(lon) } });
      setForecast(res.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>🌍 Climate-Adjusted Long-Term Sustainability Forecast</h3>
        <p style={{ color: "#9fb0c3", marginTop: 4 }}>
          Projects how ocean warming may reshape fish presence at this location over the next 50 years,
          helping fleets and investors plan multi-decade sustainability strategy.
        </p>
        <div className="grid grid-2">
          <div><label>Latitude</label><input type="number" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
          <div><label>Longitude</label><input type="number" value={lon} onChange={(e) => setLon(e.target.value)} /></div>
        </div>
        <button className="btn" onClick={handleAnalyze} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze Climate Risk"}
        </button>
      </div>

      {forecast && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <div className="card stat-card">
              <p className="stat-label">Current Score</p>
              <h2 style={{ color: scoreColor(forecast.current_score) }}>{forecast.current_score}%</h2>
            </div>
            <div className="card stat-card">
              <p className="stat-label">Score in 50 Years</p>
              <h2 style={{ color: scoreColor(forecast.projections[forecast.projections.length - 1].projected_score) }}>
                {forecast.projections[forecast.projections.length - 1].projected_score}%
              </h2>
            </div>
            <div className="card stat-card">
              <p className="stat-label">Sustainability Index</p>
              <h2 style={{ color: sustainabilityColor(forecast.sustainability_index), fontSize: 22 }}>
                {forecast.sustainability_index}
              </h2>
            </div>
            <div className="card stat-card">
              <p className="stat-label">50-Year Decline</p>
              <h2>{forecast.decline_50y} pts</h2>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Projected Fish Probability Over Time</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={forecast.projections}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223049" />
                <XAxis dataKey="year" stroke="#9fb0c3" />
                <YAxis stroke="#9fb0c3" domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "#131c2e", border: "1px solid #223049" }} />
                <Line type="monotone" dataKey="projected_score" stroke="#06b6d4" strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Sustainable Quota Recommendation</h3>
            <table>
              <thead><tr><th>Period</th><th>Recommended Max Annual Catch</th></tr></thead>
              <tbody>
                <tr><td>Today</td><td>{forecast.recommended_max_annual_catch_tons_now} tons/year</td></tr>
                <tr><td>In 50 years (projected)</td><td>{forecast.recommended_max_annual_catch_tons_in_50y} tons/year</td></tr>
              </tbody>
            </table>
            <p style={{ color: "#9fb0c3", marginTop: 12, fontSize: 14 }}>
              Based on a {forecast.sustainability_index.toLowerCase()} outlook, this zone
              {forecast.sustainability_index === "Stable"
                ? " is expected to remain a reliable long-term asset for fleet investment."
                : forecast.sustainability_index === "Moderate Risk"
                ? " may require gradually reduced quotas to remain sustainable."
                : " faces significant long-term risk and warrants conservation planning now."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>❓ User Guide</h2>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
        <ul style={{ lineHeight: 1.9, color: "#c8d3e0" }}>
          <li><strong>Dashboard:</strong> overview of system statistics and regional performance.</li>
          <li><strong>Map:</strong> search a location, switch data layers, predict fish, save zones, view factor breakdown.</li>
          <li><strong>Charts:</strong> historical trends and regional comparisons.</li>
          <li><strong>Zones:</strong> saved locations with live high-probability alerts.</li>
          <li><strong>Catch Log:</strong> record actual catches to compare against predictions.</li>
          <li><strong>Climate:</strong> 50-year sustainability outlook and quota recommendations.</li>
          <li><strong>Reports:</strong> detailed prediction history with CSV/PDF export.</li>
        </ul>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState("overview");
  const [showHelp, setShowHelp] = useState(false);
  const { userName, logout } = useAuth();

  return (
    <div>
      <nav className="navbar">
        <strong>🐟 Astryx</strong>
        <div>
          <button className="btn btn-secondary" onClick={() => setShowHelp(true)} style={{ marginRight: 10 }}>❓ Help</button>
          <span style={{ marginRight: 16, color: "#9fb0c3" }}>Hi, {userName || "User"}</span>
          <button className="btn btn-secondary" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        <div className="tabs">
          <div className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Dashboard</div>
          <div className={`tab ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>Map</div>
          <div className={`tab ${tab === "charts" ? "active" : ""}`} onClick={() => setTab("charts")}>Charts</div>
          <div className={`tab ${tab === "zones" ? "active" : ""}`} onClick={() => setTab("zones")}>Zones</div>
          <div className={`tab ${tab === "catchlog" ? "active" : ""}`} onClick={() => setTab("catchlog")}>Catch Log</div>
          <div className={`tab ${tab === "climate" ? "active" : ""}`} onClick={() => setTab("climate")}>🌍 Climate</div>
          <div className={`tab ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}>Reports</div>
        </div>

        {tab === "overview" && <Overview />}
        {tab === "map" && <MapView />}
        {tab === "charts" && <Charts />}
        {tab === "zones" && <Zones />}
        {tab === "catchlog" && <CatchLogTab />}
        {tab === "climate" && <ClimateInsights />}
        {tab === "reports" && <Reports />}
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
