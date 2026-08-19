import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div>
      <nav className="navbar">
        <strong>🐟 Astryx</strong>
        <div>
          <Link to="/login" className="btn" style={{ marginRight: 8, background: "#131c2e", boxShadow: "none" }}>
            Log In
          </Link>
          <Link to="/signup" className="btn">Sign Up</Link>
        </div>
      </nav>

      <div className="hero">
        <span className="hero-badge">AI-POWERED OCEAN MONITORING</span>
        <h1>Predict Fish Presence with AI</h1>
        <p>
          Astryx is an AI-powered monitoring system that predicts fish presence and movement
          using satellite-derived ocean data: sea surface temperature, chlorophyll,
          turbidity, and wind patterns.
        </p>
        <Link to="/signup" className="btn" style={{ fontSize: 18, padding: "14px 32px" }}>
          Get Started
        </Link>
      </div>

      <div className="container">
        <div className="grid grid-4" style={{ marginTop: 20, marginBottom: 60 }}>
          <div className="card">📊 <strong>Dashboard</strong><br /><span style={{ color: "#9fb0c3" }}>System statistics overview</span></div>
          <div className="card">🗺️ <strong>Interactive Map</strong><br /><span style={{ color: "#9fb0c3" }}>Real-time visualization</span></div>
          <div className="card">📈 <strong>Charts</strong><br /><span style={{ color: "#9fb0c3" }}>Historical data analysis</span></div>
          <div className="card">📋 <strong>Reports</strong><br /><span style={{ color: "#9fb0c3" }}>Detailed prediction reports</span></div>
        </div>
      </div>
    </div>
  );
}
