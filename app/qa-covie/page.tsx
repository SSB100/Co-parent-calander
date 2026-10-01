"use client";
import { useState } from "react";
export default function Review() {
  const [size, setSize] = useState("1440x900"), [kind, setKind] = useState("personal"), [state, setState] = useState("populated");
  const [width, height] = size.split("x").map(Number);
  return <main style={{ background: "#eee", minHeight: "100vh" }}>
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 12 }}>
      <strong>Covie synthetic QA</strong>
      <label>Viewport <select aria-label="Fixture viewport" value={size} onChange={e => setSize(e.target.value)} style={{ minHeight: 44 }}>{["1440x900", "1100x560", "1000x700", "1440x480", "390x844", "320x568"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Experience <select aria-label="Fixture experience" value={kind} onChange={e => setKind(e.target.value)} style={{ minHeight: 44 }}>{["personal", "social", "social-member", "social-viewer", "facilities", "facilities-member", "salon", "salon-customer", "appointment"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>State <select aria-label="Fixture state" value={state} onChange={e => setState(e.target.value)} style={{ minHeight: 44 }}>{["populated", "empty", "stress", "error", "denied", "loading"].map(value => <option key={value}>{value}</option>)}</select></label>
      <span>{width} × {height} CSS viewport. Fabricated data. No live saves.</span>
    </header>
    <iframe title="Covie QA canvas" width={width} height={height} style={{ display: "block", border: 0 }} src={`/qa-covie/canvas?kind=${kind}&state=${state}`} />
  </main>;
}
