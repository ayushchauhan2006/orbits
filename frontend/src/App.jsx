import { useEffect, useMemo, useState } from 'react'
import SpaceView from './components/SpaceView'
import './App.css'

const API = 'http://localhost:3000'
const tabs = ['Mission control', 'Catalog', 'Screening', 'Methodology']

function Catalog() {
  const [objects, setObjects] = useState([]), [query, setQuery] = useState('')
  useEffect(() => { fetch(`${API}/api/satellites`).then(r => r.json()).then(setObjects).catch(() => {}) }, [])
  const results = useMemo(() => objects.filter(x => `${x.name} ${x.noradId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100), [objects, query])
  return <section className="content-page"><div className="page-intro"><div><span>ORBITAL CATALOG</span><h1>Track the objects you care about.</h1><p>Current propagated positions, derived from the loaded element set.</p></div><b>{objects.length.toLocaleString() || '—'}<small>OBJECTS</small></b></div><input className="catalog-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by object name or NORAD ID" /><div className="catalog-table"><div className="table-head"><span>OBJECT</span><span>NORAD</span><span>ALTITUDE</span><span>POSITION</span></div>{results.map(item => <div className="table-row" key={item.id}><strong>{item.name}</strong><span>{item.noradId}</span><span>{(item.altitude / 1000).toFixed(0)} km</span><span>{item.latitude.toFixed(2)}° / {item.longitude.toFixed(2)}°</span></div>)}</div></section>
}

function Screening() {
 const [data, setData] = useState(null), [loading, setLoading] = useState(false)
 const load = () => { setLoading(true); fetch(`${API}/api/conjunction-risks`).then(r => r.json()).then(setData).finally(() => setLoading(false)) }
 useEffect(load, [])
 return <section className="content-page"><div className="page-intro"><div><span>CATALOGUE SCREENING</span><h1>Potential proximity indicators.</h1><p>Broad spatial screening highlights objects meriting an analyst’s review.</p></div><button className="primary-button" onClick={load}>{loading ? 'SCREENING…' : 'REFRESH SCREEN'}</button></div><div className="important-note"><b>Important</b><p>These are simplified proximity indicators, not a conjunction data message and not a collision probability or avoidance recommendation.</p></div><div className="catalog-table"><div className="table-head"><span>OBJECT PAIR</span><span>SCREEN FLAG</span><span>CURRENT SEPARATION</span><span>RELATIVE SPEED</span></div>{data?.risks?.slice(0, 15).map((risk, i) => <div className="table-row" key={i}><strong>{risk.object1} [{risk.norad1}]<small>vs {risk.object2} [{risk.norad2}]</small></strong><span className="flag">{risk.riskLevel === 'CRITICAL' ? 'CLOSE' : 'REVIEW'}</span><span>{risk.missDistanceKm.toFixed(2)} km</span><span>{risk.relativeVelocityKmS.toFixed(2)} km/s</span></div>)}</div></section>
}

function Methodology() { return <section className="content-page methodology"><span>METHOD & LIMITATIONS</span><h1>Designed for awareness, not autonomous decisions.</h1><div className="method-grid"><article><b>01</b><h2>Orbit propagation</h2><p>Satellite.js uses SGP4 propagation with the loaded GP element set. The 3D view uses an Earth-centred inertial frame so orbital geometry does not twist with the rotating Earth.</p></article><article><b>02</b><h2>Relative motion</h2><p>The comparison screen samples both propagated state vectors over a 24-hour horizon, then refines the closest sampled approach.</p></article><article><b>03</b><h2>Uncertainty</h2><p>Element age is shown as a simple data-freshness indicator. This prototype does not have covariance data, manoeuvre history, or validated collision probability.</p></article></div></section> }

export default function App() {
 const [tab, setTab] = useState('Mission control')
 return <div className="app-shell"><header className="topbar"><button className="wordmark" onClick={() => setTab('Mission control')}><i>◌</i><span>ORBITAL<br /><small>INTELLIGENCE</small></span></button><nav>{tabs.map(item => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav><div className="system-live"><b /> SYSTEM NOMINAL</div></header><main>{tab === 'Mission control' && <SpaceView />}{tab === 'Catalog' && <Catalog />}{tab === 'Screening' && <Screening />}{tab === 'Methodology' && <Methodology />}</main><footer><span>ORBITAL INTELLIGENCE / SIH 2026</span><span>SGP4 PROPAGATION · CATALOGUE-BASED SCREENING</span><span>NOT FOR OPERATIONAL COLLISION AVOIDANCE</span></footer></div>
}
