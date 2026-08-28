import { useEffect, useMemo, useState, useRef } from 'react'
import SpaceView from './components/SpaceView'
import earthTexture from './assets/earth-texture.png'
import orbitalLogo from './assets/orbital-logo.png'
import './App.css'
import './components/Heatmap.css'
const API = 'http://localhost:3000'
const tabs = ['Mission control', 'Catalog', 'Screening', 'Heatmap', 'Methodology']


function Catalog() {
 const [objects,setObjects]=useState([]),[query,setQuery]=useState('')
 useEffect(()=>{fetch(`${API}/api/satellites`).then(r=>r.json()).then(setObjects).catch(()=>{})},[])
 const results=useMemo(()=>objects.filter(x=>`${x.name} ${x.noradId}`.toLowerCase().includes(query.toLowerCase())).slice(0,100),[objects,query])
 return <section className="content-page"><div className="page-intro"><div><span>ORBITAL CATALOG</span><h1>Monitor activity across Earth orbit.</h1><p>Real-time orbital positions derived from the current element set.</p></div><b>{objects.length.toLocaleString()||'—'}<small>OBJECTS</small></b></div><input className="catalog-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by object name or NORAD ID"/><div className="catalog-table"><div className="table-head"><span>OBJECT</span><span>NORAD</span><span>ALTITUDE</span><span>POSITION</span></div>{results.map(x=><div className="table-row" key={x.id}><strong>{x.name}</strong><span>{x.noradId}</span><span>{(x.altitude/1000).toFixed(0)} km</span><span>{x.latitude.toFixed(2)}° / {x.longitude.toFixed(2)}°</span></div>)}</div></section>
}
function Screening() {
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),[sort,setSort]=useState('likelihood'),[error,setError]=useState('')
 const load=()=>{setLoading(true);setError('');fetch(`${API}/api/conjunction-risks`).then(async r=>{const result=await r.json();if(!r.ok)throw new Error(result.error||'Screening unavailable');return result}).then(setData).catch(reason=>setError(reason.message)).finally(()=>setLoading(false))}
 useEffect(()=>{load()},[])
 const rank={HIGH:4,MEDIUM:3,LOW:2,'VERY LOW':1}
 const rows=[...(data?.risks||[])].sort((a,b)=>sort==='likelihood'?(rank[b.estimatedLikelihood]-rank[a.estimatedLikelihood]||a.missDistanceKm-b.missDistanceKm):sort==='density'?b.nearbyDebrisCount-a.nearbyDebrisCount:sort==='speed'?b.relativeVelocityKmS-a.relativeVelocityKmS:a.missDistanceKm-b.missDistanceKm)
 return <section className="content-page"><div className="page-intro"><div><span>CATALOGUE SCREENING</span><h1>Assess potential conjunction risk.</h1><p>Risk indicators derived from orbital proximity, relative motion, and nearby debris.</p></div><button className="primary-button" onClick={load}>{loading?'SCREENING…':'REFRESH SCREEN'}</button></div><div className="important-note"><b>Prototype estimate</b><p>High, Medium, Low and Very Low are qualitative likelihood indicators. They are not an operational probability of collision (Pc) and must not be used for avoidance decisions.</p></div>{error&&<div className="screening-error">{error}</div>}<div className="screen-sort"><span>Sort by</span>{[['likelihood','Likelihood'],['distance','Separation'],['density','Nearby debris'],['speed','Relative speed']].map(([key,label])=><button className={sort===key?'active':''} key={key} onClick={()=>setSort(key)}>{label}</button>)}</div><div className="catalog-table"><div className="table-head"><span>ACTIVE SATELLITE / DEBRIS</span><span>EST. LIKELIHOOD</span><span>SEPARATION</span><span>NEARBY DEBRIS</span><span>RELATIVE SPEED</span></div>{rows.map(x => {
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
      if (!response.ok) {
        throw new Error(`Heatmap service returned ${response.status}`)
      }

      const result = await response.json()

      if (!Array.isArray(result.satellite) || !Array.isArray(result.debris)) {
        throw new Error('Heatmap data is incomplete')
      }

      setData(result)
    } catch (loadError) {
      setError('Unable to reach the heatmap service. Restart the backend, then refresh this page.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()

    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  const satelliteMaximum = useMemo(
    () => data ? Math.max(1, ...data.satellite) : 1,
    [data]
  )

  const debrisMaximum = useMemo(
    () => data ? Math.max(1, ...data.debris) : 1,
    [data]
  )

  const intensity = (value, maximum) =>
    Math.min(
      0.88,
      Math.pow(
        Math.max(0, (value - 1) / Math.max(1, maximum - 1)),
        1.7
      ) * 0.88
    )

  const mapStyle = {
    backgroundImage: `url(${earthTexture})`
  }

  const gridStyle = data
    ? {
        gridTemplateColumns: `repeat(${data.columns}, 1fr)`,
        gridTemplateRows: `repeat(${data.rows}, 1fr)`
      }
    : undefined

  const totalSatelliteObjects = data
    ? data.satellite.reduce((sum, value) => sum + value, 0)
    : 0

  const totalDebrisObjects = data
    ? data.debris.reduce((sum, value) => sum + value, 0)
    : 0

  return (
    <section className="heatmap-fullscreen">

      {/* TOP HUD */}
      <div className="heatmap-topbar">

        <div className="heatmap-title">
          <span>ORBITAL DENSITY HEATMAP</span>
          <h1>SPACE OBJECT DENSITY ANALYSIS</h1>
          <p>
            Propagated catalogue distribution across latitude and longitude.
          </p>
        </div>

        <div className="heatmap-stats">

          <div>
            <strong>{totalSatelliteObjects.toLocaleString()}</strong>
            <span>ACTIVE OBJECTS</span>
          </div>

          <div>
            <strong className="debris-stat">
              {totalDebrisObjects.toLocaleString()}
            </strong>
            <span>DEBRIS OBJECTS</span>
          </div>

          <div>
            <strong>{data ? data.columns * data.rows : '—'}</strong>
            <span>SPATIAL CELLS</span>
          </div>

        </div>

      </div>

      {/* RIGHT CONTROLS */}
      <div className="heatmap-hud heatmap-right">

        <div className="hud-label">
          VIEW LAYERS
        </div>

        <button
          className={active ? 'hud-toggle active' : 'hud-toggle'}
          onClick={() => setActive(value => !value)}
        >
          <i className="satellite-dot" />
          Satellites
        </button>

        <button
          className={debris ? 'hud-toggle active' : 'hud-toggle'}
          onClick={() => setDebris(value => !value)}
        >
          <i className="debris-dot" />
          Debris
        </button>

        <div className="hud-divider" />

        <button
          className="hud-action"
          onClick={load}
        >
          {loading ? 'UPDATING...' : '↻ REFRESH'}
        </button>

      </div>

      {/* ERROR */}
      {error && (
        <div className="heatmap-error-overlay">
          {error}
        </div>
      )}

      {/* FULL SCREEN MAP */}
      <div
        className="heatmap-map"
        style={mapStyle}
      >

        {data && (
          <div
            className="heat-grid"
            style={gridStyle}
          >
            {data.satellite.map((value, index) => {

              const satelliteIntensity =
                intensity(value, satelliteMaximum)

              const debrisIntensity =
                intensity(data.debris[index], debrisMaximum)

              return (
                <div
                  className="heat-cell"
                  key={index}
                >

                  {active && satelliteIntensity > 0.02 && (
                    <i
                      className="satellite-heat"
                      style={{
                        opacity: satelliteIntensity
                      }}
                    />
                  )}

                  {debris && debrisIntensity > 0.02 && (
                    <i
                      className="debris-heat"
                      style={{
                        opacity: debrisIntensity
                      }}
                    />
                  )}

                </div>
              )
            })}
          </div>
        )}

        {/* MAP VIGNETTE */}
        <div className="heatmap-vignette" />

        {/* COORDINATES */}
        <div className="map-coordinates">
          <span>180°W</span>
          <span>120°W</span>
          <span>60°W</span>
          <span>0°</span>
          <span>60°E</span>
          <span>120°E</span>
          <span>180°E</span>
        </div>

      </div>

      {/* LEFT BOTTOM LEGEND */}
      <div className="heatmap-hud heatmap-bottom-left">

        <div className="hud-label">
          DENSITY SCALE · OBJECTS / CELL
        </div>

        <div className="density-gradient" />

        <div className="density-labels">
          <span>LOW</span>
          <span>MEDIUM</span>
          <span>HIGH</span>
        </div>

        <div className="heatmap-legend-row">
          <span>
            <i className="satellite-dot" />
            Satellite density
          </span>

          <span>
            <i className="debris-dot" />
            Debris density
          </span>
        </div>

      </div>

      {/* BOTTOM RIGHT INFO */}
      <div className="heatmap-hud heatmap-bottom-right">

        <div className="hud-label">
          DATA STATUS
        </div>

        <div className="live-status">
          <i />
          LIVE CATALOGUE
        </div>

        <small>
          {data
            ? `Updated ${new Date(data.timestamp).toLocaleString()}`
            : 'Loading catalogue...'}
        </small>

      </div>

    </section>
  )
}
function Methodology(){return <section className="content-page methodology"><span>METHOD & LIMITATIONS</span><h1>Designed for awareness, not autonomous decisions.</h1><div className="method-grid"><article><b>01</b><h2>Orbit propagation</h2><p>Satellite.js uses SGP4 propagation with the loaded GP element set. The 3D view uses an Earth-centred inertial frame so orbital geometry does not twist with the rotating Earth.</p></article><article><b>02</b><h2>Relative motion</h2><p>The comparison screen samples both propagated state vectors over a 24-hour horizon, then refines the closest sampled approach.</p></article><article><b>03</b><h2>Estimated collision likelihood</h2><p>High, Medium, Low and Very Low combine propagated separation, relative velocity, nearby debris concentration and element freshness. They are qualitative prototype indicators, not an operational probability of collision.</p></article></div></section>}
export default function App() {
  const [tab, setTab] = useState('Mission control')

  const [showIntro, setShowIntro] = useState(true)
  const [showLoading, setShowLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const enterWebsite = () => {
  setShowIntro(false)
  setShowLoading(true)

  setTimeout(() => {
    setShowLoading(false)
    setShowMenu(true)
  }, 2200)
}
  return (
    <>
      {/* ========================================
          INTRO SCREEN
      ======================================== */}

      {showIntro && (
  <section className="intro-screen">

    <video
      className="intro-video"
      autoPlay
      muted
      loop
      playsInline
    >
      <source
        src="/earth.mp4"
        type="video/mp4"
      />
    </video>

    <div className="intro-overlay" />

    <div className="intro-content">

      <div className="intro-brand">
        <h2> ORBITRA  </h2>
      </div>

      <div className="intro-kicker">
        <h3> SPACE AND DEBRIS INTELLIGENCE </h3>
      </div>

      <h1>
        THE SPACE SENTINEL
      </h1>

      <h3>
        Predict. Detect. Protect.
      </h3>

      <button
  className="enter-button"
  onClick={enterWebsite}
>
  <span className="enter-button-text">
    ENTER THE WORLD OF SATELLITE AND DEBRIS
  </span>

  <span className="enter-button-arrow">
    →
  </span>
</button>

    </div>


    

  </section>
)}

      {/* ========================================
          LOADING SCREEN
      ======================================== */}

      {showLoading && (
        <section className="loading-screen">

          <div className="loading-logo">
            ORBITAL
          </div>

          <div className="loader-ring" />

          <div className="loading-title">
            INITIALIZING ORBITAL SYSTEM
          </div>

          <div className="loading-subtitle">
            Loading satellite intelligence...
          </div>

        </section>
      )}
            {/* ========================================
          MENU PAGE
      ======================================== */}

      {showMenu && (
        <section className="menu-screen">

          <video
            className="menu-video"
            autoPlay
            muted
            loop
            playsInline
          >
            <source
              src="/menu-page.mp4"
              type="video/mp4"
            />
          </video>

          <div className="menu-overlay" />
          
          <div className="menu-content">

  <div className="menu-heading">
    <span>ORBITAL INTELLIGENCE</span>
    <h1>Choose Your Mission</h1>
    <p>Select an interface to continue</p>
  </div>

<div className="menu-carousel">

  {/* LEFT ARROW */}
  <button
    className="carousel-arrow carousel-left"
    onClick={() =>
      setMenuIndex(
        (menuIndex - 1 + 5) % 5
      )
    }
  >
    ‹
  </button>


  {/* CARDS */}
  <div className="carousel-window">

    <div
  className="carousel-track"
  style={{
    transform: `translateX(calc(-215px - ${menuIndex * 462}px))`
  }}
>

      {/* 1. OPEN VISUALIZATION */}
      <button
        className={`menu-card ${
          menuIndex === 0 ? 'selected' : ''
        }`}
        onClick={() => {
          setMenuIndex(0)
          setTab('Mission control')
          setShowMenu(false)
        }}
      >

        <span className="menu-card-icon">
          ◉
        </span>

        <span className="menu-card-title">
          Open Visualization
        </span>

        <span className="menu-card-detail">
          Explore the Earth-centered 3D orbital environment,
observe active satellites in motion, and inspect
individual objects and their surrounding space.
        </span>

        <span className="menu-card-arrow">
          →
        </span>

      </button>


      {/* 2. CATALOG */}
      <button
        className={`menu-card ${
          menuIndex === 1 ? 'selected' : ''
        }`}
        onClick={() => {
          setMenuIndex(1)
          setTab('Catalog')
          setShowMenu(false)
        }}
      >

        <span className="menu-card-icon">
          ⌑
        </span>

        <span className="menu-card-title">
          Catalog
        </span>

        <span className="menu-card-detail">
          Browse tracked satellites and orbital objects,
inspect their identifiers, altitude, position and
other available catalogue information.
        </span>

        <span className="menu-card-arrow">
          →
        </span>

      </button>


      {/* 3. SCREENING */}
      <button
        className={`menu-card ${
          menuIndex === 2 ? 'selected' : ''
        }`}
        onClick={() => {
          setMenuIndex(2)
          setTab('Screening')
          setShowMenu(false)
        }}
      >

        <span className="menu-card-icon">
          ⚠
        </span>

        <span className="menu-card-title">
          Screening
        </span>

        <span className="menu-card-detail">
          Examine potential conjunction events using
          separation, relative velocity and nearby
          debris indicators across the catalogue.
        </span>

        <span className="menu-card-arrow">
          →
        </span>

      </button>


      {/* 4. HEATMAP */}
      <button
        className={`menu-card ${
          menuIndex === 3 ? 'selected' : ''
        }`}
        onClick={() => {
          setMenuIndex(3)
          setTab('Heatmap')
          setShowMenu(false)
        }}
      >

        <span className="menu-card-icon">
          ◈
        </span>

        <span className="menu-card-title">
          Heatmap
        </span>

        <span className="menu-card-detail">
          Visualize the spatial distribution of
          active satellites and debris across the
          near-Earth orbital environment.
        </span>

        <span className="menu-card-arrow">
          →
        </span>

      </button>


      {/* 5. METHODOLOGY */}
      <button
        className={`menu-card ${
          menuIndex === 4 ? 'selected' : ''
        }`}
        onClick={() => {
          setMenuIndex(4)
          setTab('Methodology')
          setShowMenu(false)
        }}
      >

        <span className="menu-card-icon">
          ⓘ
        </span>

        <span className="menu-card-title">
          Methodology
        </span>

        <span className="menu-card-detail">
          Understand how orbital propagation,
          relative motion and collision-risk
          indicators are calculated by the system.
        </span>

        <span className="menu-card-arrow">
          →
        </span>

      </button>

    </div>

  </div>


  {/* RIGHT ARROW */}
  <button
    className="carousel-arrow carousel-right"
    onClick={() =>
      setMenuIndex(
        (menuIndex + 1) % 5
      )
    }
  >
    ›
  </button>

</div>

</div>

        </section>
      )}
      {/* ========================================
          EXISTING WEBSITE
      ======================================== */}

      {!showIntro && !showLoading && !showMenu && (
        <div className="app-shell">

          {/* ALWAYS VISIBLE DASHBOARD */}
          <header className="topbar">

            <button
              className="wordmark"
              onClick={() =>
                setTab('Mission control')
              }
            >
              <img
  src={orbitalLogo}
  alt="Orbita"
  className="wordmark-logo"
/>

              <span>
                ORBITAL
              </span>
            </button>

            <nav>
              {tabs.map(x => (
                <button
                  className={
                    tab === x
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setTab(x)
                  }
                  key={x}
                >
                  {x}
                </button>
              ))}
            </nav>

          </header>

          {/* CONTENT BELOW DASHBOARD */}
          <main>

            <div
              className={
                tab === 'Mission control'
                  ? ''
                  : 'hidden-page'
              }
            >
              <SpaceView />
            </div>

            {tab === 'Catalog' && (
              <Catalog />
            )}

            {tab === 'Screening' && (
              <Screening />
            )}

            {tab === 'Heatmap' && (
              <Heatmap />
            )}

            {tab === 'Methodology' && (
              <Methodology />
            )}

          </main>

  

        </div>
      )}
    </>
  )
}