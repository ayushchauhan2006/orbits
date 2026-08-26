import { useEffect, useMemo, useState, useRef } from 'react'
import SpaceView from './components/SpaceView'
import earthTexture from './assets/earth-texture.png'
import './App.css'
import './components/Heatmap.css'
const API = 'http://localhost:3000'
const tabs = ['Mission control', 'Catalog', 'Screening', 'Heatmap', 'Methodology']

function Catalog() {
 const [objects,setObjects]=useState([]),[query,setQuery]=useState('')
 useEffect(()=>{fetch(`${API}/api/satellites`).then(r=>r.json()).then(setObjects).catch(()=>{})},[])
 const results=useMemo(()=>objects.filter(x=>`${x.name} ${x.noradId}`.toLowerCase().includes(query.toLowerCase())).slice(0,100),[objects,query])
 return <section className="content-page"><div className="page-intro"><div><span>ORBITAL CATALOG</span><h1>Track the objects you care about.</h1><p>Current propagated positions, derived from the loaded element set.</p></div><b>{objects.length.toLocaleString()||'—'}<small>OBJECTS</small></b></div><input className="catalog-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by object name or NORAD ID"/><div className="catalog-table"><div className="table-head"><span>OBJECT</span><span>NORAD</span><span>ALTITUDE</span><span>POSITION</span></div>{results.map(x=><div className="table-row" key={x.id}><strong>{x.name}</strong><span>{x.noradId}</span><span>{(x.altitude/1000).toFixed(0)} km</span><span>{x.latitude.toFixed(2)}° / {x.longitude.toFixed(2)}°</span></div>)}</div></section>
}
function Screening() {
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),[sort,setSort]=useState('likelihood'),[error,setError]=useState('')
 const load=()=>{setLoading(true);setError('');fetch(`${API}/api/conjunction-risks`).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Screening unavailable');return result}).then(setData).catch(reason=>setError(reason.message)).finally(()=>setLoading(false))}
 useEffect(()=>{load()},[])
 const rank={HIGH:4,MEDIUM:3,LOW:2,'VERY LOW':1}
 const rows=[...(data?.risks||[])].sort((a,b)=>sort==='likelihood'?(rank[b.estimatedLikelihood]-rank[a.estimatedLikelihood]||a.missDistanceKm-b.missDistanceKm):sort==='density'?b.nearbyDebrisCount-a.nearbyDebrisCount:sort==='speed'?b.relativeVelocityKmS-a.relativeVelocityKmS:a.missDistanceKm-b.missDistanceKm)
 return <section className="content-page"><div className="page-intro"><div><span>CATALOGUE SCREENING</span><h1>Estimated collision likelihood.</h1><p>Qualitative likelihood from propagated proximity, relative motion and nearby debris.</p></div><button className="primary-button" onClick={load}>{loading?'SCREENING…':'REFRESH SCREEN'}</button></div><div className="important-note"><b>Prototype estimate</b><p>High, Medium, Low and Very Low are qualitative likelihood indicators. They are not an operational probability of collision (Pc) and must not be used for avoidance decisions.</p></div>{error&&<div className="screening-error">{error}</div>}<div className="screen-sort"><span>Sort by</span>{[['likelihood','Likelihood'],['distance','Separation'],['density','Nearby debris'],['speed','Relative speed']].map(([key,label])=><button className={sort===key?'active':''} key={key} onClick={()=>setSort(key)}>{label}</button>)}</div><div className="catalog-table"><div className="table-head"><span>ACTIVE SATELLITE / DEBRIS</span><span>EST. LIKELIHOOD</span><span>SEPARATION</span><span>NEARBY DEBRIS</span><span>RELATIVE SPEED</span></div>{rows.map(x => {
  // 1. Grab the names
  const satellite = x.type1 === 'DEBRIS' ? x.object2 : x.object1;
  const debris = x.type1 === 'DEBRIS' ? x.object1 : x.object2;
  
  // 2. Grab the matching NORAD IDs
  const satNorad = x.type1 === 'DEBRIS' ? x.norad2 : x.norad1;
  const debNorad = x.type1 === 'DEBRIS' ? x.norad1 : x.norad2;
  
  const likelihood = x.estimatedLikelihood || 'VERY LOW';
  
  return (
    <div className="table-row" key={`${x.norad1}-${x.norad2}`}>
      {/* 3. Render the Names AND the IDs! */}
      <strong>{satellite} [{satNorad}]<small>vs {debris} [{debNorad}]</small></strong>
      
      <span className={`priority-${likelihood.toLowerCase().replace(' ', '-')}`}>{likelihood}</span>
      <span>{x.missDistanceKm.toFixed(2)} km</span>
      <span>{x.nearbyDebrisCount || 0}</span>
      <span>{x.relativeVelocityKmS.toFixed(2)} km/s</span>
    </div>
  )
})}</div></section>
}
function Heatmap() {
  const [data, setData] = useState(null)
  const [active, setActive] = useState(true)
  const [debris, setDebris] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/heatmap`)
      if (!response.ok) throw new Error(`Heatmap service returned ${response.status}`)
      const result = await response.json()
      if (!Array.isArray(result.satellite) || !Array.isArray(result.debris)) throw new Error('Heatmap data is incomplete')
      setData(result)
    } catch (loadError) {
      setError('Unable to reach the heatmap service. Restart the backend, then refresh this page.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load(); const interval = setInterval(load, 60000); return () => clearInterval(interval) }, [])
  const satelliteMaximum = useMemo(() => data ? Math.max(1, ...data.satellite) : 1, [data])
  const debrisMaximum = useMemo(() => data ? Math.max(1, ...data.debris) : 1, [data])
  const intensity = (value, maximum) => Math.min(.82, Math.pow(Math.max(0, (value - 1) / Math.max(1, maximum - 1)), 1.7) * .82)
  const mapStyle = { backgroundImage: `url(${earthTexture})` }
  const gridStyle = data ? { gridTemplateColumns: `repeat(${data.columns}, 1fr)`, gridTemplateRows: `repeat(${data.rows}, 1fr)` } : undefined

  return (
    <section className="content-page heatmap-page">
      <div className="page-intro"><div><span>ORBITAL DENSITY HEATMAP</span><h1>Where is the near-Earth population concentrated?</h1><p>A current latitude–longitude density view of the propagated catalogue.</p></div><button className="primary-button" onClick={load}>{loading ? 'UPDATING…' : 'REFRESH MAP'}</button></div>
      <div className="heatmap-controls"><button className={active ? 'enabled satellite-toggle' : ''} onClick={() => setActive(value => !value)}><i /> Satellites</button><button className={debris ? 'enabled debris-toggle' : ''} onClick={() => setDebris(value => !value)}><i /> Debris</button><span>Darker colour = greater concentration</span></div>
      {error && <div className="heatmap-error">{error}</div>}
      <div className="flat-earth" style={mapStyle}>
        {data && <div className="heat-grid" style={gridStyle}>{data.satellite.map((value, index) => { const satelliteIntensity = intensity(value, satelliteMaximum); const debrisIntensity = intensity(data.debris[index], debrisMaximum); return <div className="heat-cell" key={index}>{active && satelliteIntensity > .025 && <i className="satellite-heat" style={{ opacity: satelliteIntensity }} />}{debris && debrisIntensity > .025 && <i className="debris-heat" style={{ opacity: debrisIntensity }} />}</div> })}</div>}
        <div className="map-coordinates"><span>180°W</span><span>0°</span><span>180°E</span></div>
      </div>
      <div className="heatmap-legend"><span><i className="satellite-heat" /> Satellite density</span><span><i className="debris-heat" /> Debris density</span><p>Current epoch: {data ? new Date(data.timestamp).toLocaleString() : 'Loading catalogue…'}</p></div>
    </section>
  )
}
function Methodology(){return <section className="content-page methodology"><span>METHOD & LIMITATIONS</span><h1>Designed for awareness, not autonomous decisions.</h1><div className="method-grid"><article><b>01</b><h2>Orbit propagation</h2><p>Satellite.js uses SGP4 propagation with the loaded GP element set. The 3D view uses an Earth-centred inertial frame so orbital geometry does not twist with the rotating Earth.</p></article><article><b>02</b><h2>Relative motion</h2><p>The comparison screen samples both propagated state vectors over a 24-hour horizon, then refines the closest sampled approach.</p></article><article><b>03</b><h2>Estimated collision likelihood</h2><p>High, Medium, Low and Very Low combine propagated separation, relative velocity, nearby debris concentration and element freshness. They are qualitative prototype indicators, not an operational probability of collision.</p></article></div></section>}
export default function App(){const [tab,setTab]=useState('Mission control');return <div className="app-shell"><header className="topbar"><button className="wordmark" onClick={()=>setTab('Mission control')}><i>◌</i><span>ORBITAL<br/><small>INTELLIGENCE</small></span></button><nav>{tabs.map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x}</button>)}</nav><div className="system-live"><b/> SYSTEM NOMINAL</div></header><main><div className={tab==='Mission control'?'':'hidden-page'}><SpaceView/></div>{tab==='Catalog'&&<Catalog/>}{tab==='Screening'&&<Screening/>}{tab==='Heatmap'&&<Heatmap/>}{tab==='Methodology'&&<Methodology/>}</main><footer><span>ORBITAL INTELLIGENCE / SIH 2026</span><span>SGP4 PROPAGATION · CATALOGUE-BASED SCREENING</span><span>NOT FOR OPERATIONAL COLLISION AVOIDANCE</span></footer></div>}
