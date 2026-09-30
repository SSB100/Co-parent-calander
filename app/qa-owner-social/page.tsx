"use client";
import { useState } from "react";
export default function OwnerLayoutReview() {
 const [size,setSize]=useState("1165x757"),[fixture,setFixture]=useState("populated");
 const [width,height]=size.split("x").map(Number);
 return <main style={{background:"#eee",minHeight:"100vh"}}><header style={{display:"flex",alignItems:"center",gap:12,padding:8}}><strong>Synthetic owner layout</strong><label>Viewport <select aria-label="Fixture viewport" value={size} onChange={e=>setSize(e.target.value)} style={{minHeight:44}}>{["1165x757","1440x900","1100x600","1024x700","580x700"].map(value=><option key={value}>{value}</option>)}</select></label><label>Records <select aria-label="Fixture records" value={fixture} onChange={e=>setFixture(e.target.value)} style={{minHeight:44}}><option value="populated">Eight events</option><option value="empty">Empty</option></select></label><span>{width} × {height} CSS viewport. Synthetic data only.</span></header><iframe title="Covie synthetic owner workspace" width={width} height={height} style={{display:"block",border:0}} src={`/qa-owner-social/canvas?fixture=${fixture}`} /></main>;
}
