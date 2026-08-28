import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls, Stars, useGLTF } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'

import earthModel from '../assets/earth.glb'
import earthTexture from '../assets/earth-texture.png'
const earthTextureLoader = new THREE.TextureLoader()
const earthTexturePreloaded = earthTextureLoader.load(earthTexture)

earthTexturePreloaded.colorSpace = THREE.SRGBColorSpace
earthTexturePreloaded.wrapS = THREE.ClampToEdgeWrapping
earthTexturePreloaded.wrapT = THREE.ClampToEdgeWrapping
earthTexturePreloaded.anisotropy = 8
import './SpaceView.css'
import './MissionPolish.css'

async function fetchSatelliteInfo(noradId) {
  if (!noradId) return null

  try {
    const response = await fetch(
      `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=JSON`
    )

    if (!response.ok) {
      throw new Error('CelesTrak request failed')
    }

    const data = await response.json()

    return Array.isArray(data) ? data[0] : data
  } catch (error) {
    console.error('CelesTrak SATCAT error:', error)
    return null
  }
}



const API = 'http://localhost:3000', RADIUS = 6378.137, DISPLAY = 3.2, SCALE = DISPLAY / RADIUS
const colors = ['#48d7ff', '#ffb454']
const DEBRIS_WATCH_RADIUS_KM = 50
const toScene = p => [p.x * SCALE, p.z * SCALE, -p.y * SCALE]
const mag = v => Math.hypot(v.x, v.y, v.z)
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

function Earth() {
  const earthRef = useRef()

  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.02
    }
  })

  return (
    <mesh ref={earthRef}>
      <sphereGeometry args={[3.2, 96, 96]} />

      <meshStandardMaterial
        map={earthTexturePreloaded}
        color="#ffffff"
        roughness={0.85}
        metalness={0}
      />
    </mesh>
  )
}


useGLTF.preload(earthModel)

function Orbit({ data, color }) {
  const points = useMemo(() => {
    try { const rec = satellite.json2satrec(data), period = 2 * Math.PI / rec.no, start = new Date(), result = []; for (let i = 0; i <= 240; i++) { const state = satellite.propagate(rec, new Date(start.getTime() + period * i / 240 * 60000)); if (state?.position) result.push(toScene(state.position)) } return result } catch { return [] }
  }, [data])
  return points.length > 2 ? <Line points={points} color={color} transparent opacity={.68} lineWidth={1.25} /> : null
}

function snapshot(data, rec) {
  const now = new Date(), state = satellite.propagate(rec, now)
  if (!state?.position || !state.velocity) return null
  const gd = satellite.eciToGeodetic(state.position, satellite.gstime(now))
  return { name: data.OBJECT_NAME, norad: data.NORAD_CAT_ID, altitude: gd.height, speed: mag(state.velocity), latitude: satellite.radiansToDegrees(gd.latitude), longitude: satellite.radiansToDegrees(gd.longitude), eci: state.position, updatedAt: now }
}

function SatelliteMarker({ data, color, active, watch, debrisRecords, onInspect, onWatchUpdate }) {
  const marker = useRef(), lastUpdate = useRef(0), lastWatchUpdate = useRef(0), rec = useMemo(() => satellite.json2satrec(data), [data])
  useFrame(({ clock }) => {
    const now = new Date(), state = satellite.propagate(rec, now)
    if (state?.position && marker.current) marker.current.position.set(...toScene(state.position))
    if (active && clock.elapsedTime - lastUpdate.current > 1) { lastUpdate.current = clock.elapsedTime; const info = snapshot(data, rec); if (info) onInspect(info) }
    if (state?.position && clock.elapsedTime - lastWatchUpdate.current > 1.5) {
      lastWatchUpdate.current = clock.elapsedTime
      let nearest = null
      for (const debris of debrisRecords) {

  try {

    const debrisState =
      satellite.propagate(
        debris.rec,
        now
      )

    if (
      !debrisState?.position
    ) {
      continue
    }

    const separation =
      distance(
        state.position,
        debrisState.position
      )

    if (
      !Number.isFinite(separation)
    ) {
      continue
    }

    if (
      !nearest ||
      separation <
        nearest.distanceKm
    ) {
      nearest = {
        name: debris.name,
        norad: debris.norad,
        distanceKm: separation
      }
    }

  } catch {
    continue
  }
}
      onWatchUpdate({ ...nearest, insideRange: Boolean(nearest && nearest.distanceKm <= DEBRIS_WATCH_RADIUS_KM) })
    }
  })
  const watchColor = watch?.insideRange ? '#ff4d63' : '#55dfff'
  return <group ref={marker}><mesh onClick={e => { e.stopPropagation(); const info = snapshot(data, rec); if (info) onInspect(info) }}><sphereGeometry args={[.115, 18, 18]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.8} /></mesh><mesh scale={1.9}><sphereGeometry args={[.115, 18, 18]} /><meshBasicMaterial color={watchColor} transparent opacity={watch?.insideRange ? .42 : .17} /></mesh></group>
}

// NEW: Highly Optimized Instanced Mesh for unlimited debris
function DebrisSwarm({ catalog }) {
  const meshRef = useRef()
  
  // Get ALL debris, completely bypassing the old 500 limit
  const debrisSats = useMemo(() => {
    return catalog.filter(x => x.OBJECT_TYPE === 'DEBRIS').map(x => {
      try { return satellite.json2satrec(x) } catch (e) { return null }
    }).filter(Boolean)
  }, [catalog])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    if (!meshRef.current || debrisSats.length === 0) return
    const now = new Date()
    let count = 0
    
    // Loop through all debris objects instantly
    for (const rec of debrisSats) {
      try {
        const state = satellite.propagate(rec, now)
        if (state?.position) {
          dummy.position.set(...toScene(state.position))
          dummy.updateMatrix()
          meshRef.current.setMatrixAt(count, dummy.matrix)
          count++
        }
      } catch (e) {}
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  // We only draw ONE mesh, but tell WebGL to instance it 'debrisSats.length' times
  return (
    <instancedMesh ref={meshRef} args={[null, null, debrisSats.length]}>
      <sphereGeometry args={[.015, 4, 4]} />
      <meshBasicMaterial color="#ff3b3b" transparent opacity={1} toneMapped={false} />
    </instancedMesh>
  )
}
// NEW: Highly Optimized Instanced Mesh for 16,000+ objects in a single draw call
export function ActiveSwarm({ catalog, visible, onSatClick }) {
  const meshRef = useRef()
  
  const activeSats = useMemo(() => {
    if (!visible) return []
    return catalog.filter(x => x.OBJECT_TYPE === 'ACTIVE').map(x => {
      // FIX: Save both the raw JSON data AND the SGP4 math record
      try { return { raw: x, rec: satellite.json2satrec(x) } } catch (e) { return null }
    }).filter(Boolean)
  }, [catalog, visible])

  const dummy = useMemo(() => new THREE.Object3D(), [])

useFrame(() => {
    if (!visible || !meshRef.current || activeSats.length === 0) return
    const now = new Date()
    
    // FIX: We use a standard 'for' loop so the index (i) perfectly 
    // matches the instanceId when you click on it!
    for (let i = 0; i < activeSats.length; i++) {
      try {
        const state = satellite.propagate(activeSats[i].rec, now)
        if (state?.position) {
          dummy.position.set(...toScene(state.position))
          dummy.scale.set(1, 1, 1) // Normal size
        } else {
          dummy.scale.set(0, 0, 0) // Hide broken satellites, but keep the index!
        }
      } catch (e) {
        dummy.scale.set(0, 0, 0) // Hide broken satellites, but keep the index!
      }
      
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix) // Update exactly at index 'i'
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (!visible) return null
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, activeSats.length]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSatClick && e.instanceId !== undefined) { 
          // FIX: Pass only the raw JSON data back to the click handler
          onSatClick(activeSats[e.instanceId].raw);
        }
      }}
    >
      <sphereGeometry args={[.02, 4, 4]} />
      <meshBasicMaterial color="#00a2ff" transparent opacity={0.47} toneMapped={false} />
    </instancedMesh>
  )
}
function screenPair(first, second) {
  if (!first || !second) return null

  try {
    const a = satellite.json2satrec(first)
    const b = satellite.json2satrec(second)

    const now = new Date()

    let best = null

    const check = (time) => {
      try {
        const l = satellite.propagate(a, time)
        const r = satellite.propagate(b, time)

        if (
          !l?.position ||
          !l?.velocity ||
          !r?.position ||
          !r?.velocity
        ) {
          return
        }

        const d = distance(
          l.position,
          r.position
        )

        const relativeSpeed = mag({
          x: l.velocity.x - r.velocity.x,
          y: l.velocity.y - r.velocity.y,
          z: l.velocity.z - r.velocity.z
        })

        if (
          !Number.isFinite(d) ||
          !Number.isFinite(relativeSpeed)
        ) {
          return
        }

        if (
          !best ||
          d < best.distance
        ) {
          best = {
            distance: d,
            time,
            relativeSpeed
          }
        }

      } catch {
        // Ignore invalid propagation sample
      }
    }

    // Search next 24 hours
    for (
      let m = 0;
      m <= 1440;
      m += 2
    ) {
      check(
        new Date(
          now.getTime() +
          m * 60000
        )
      )
    }

    if (!best) return null

    // Refine around closest approach
    const centre = best.time

    for (
      let s = -120;
      s <= 120;
      s += 5
    ) {
      check(
        new Date(
          centre.getTime() +
          s * 1000
        )
      )
    }

    const ca = satellite.propagate(a, now)
    const cb = satellite.propagate(b, now)

    if (
      !ca?.position ||
      !ca?.velocity ||
      !cb?.position ||
      !cb?.velocity
    ) {
      return null
    }

    const currentDistance =
      distance(
        ca.position,
        cb.position
      )

    const currentSpeed =
      mag({
        x: ca.velocity.x - cb.velocity.x,
        y: ca.velocity.y - cb.velocity.y,
        z: ca.velocity.z - cb.velocity.z
      })

    return {
      ...best,
      currentDistance,
      currentSpeed,
      hours:
        (best.time - now) / 3600000
    }

  } catch (error) {
    console.error(
      'Satellite screening error:',
      error
    )

    return null
  }
}

function Search({ catalog, label, selected, color, onSelect, onRemove }) {
  const [term, setTerm] = useState('')
  const results = useMemo(() => term.trim() ? catalog.filter(x => x.OBJECT_TYPE === 'ACTIVE' && `${x.OBJECT_NAME} ${x.NORAD_CAT_ID}`.toLowerCase().includes(term.toLowerCase())).slice(0, 6) : [], [catalog, term])
  const removeSelection = () => {
  onSelect(null)
  setTerm('')
}
  return <div className="object-picker"><label>{label}</label><div className="search-input-wrap"><input
  value={selected ? selected.OBJECT_NAME : term}
  onChange={e => {
    if (selected) {
      onSelect(null)
    }
    setTerm(e.target.value)
  }}
  placeholder="Name or NORAD ID"
 />{selected && <button className="remove-selection" type="button" onClick={removeSelection} title={`Remove ${selected.OBJECT_NAME}`} aria-label={`Remove ${selected.OBJECT_NAME}`}>×</button>}</div>{results.length > 0 && <div className="picker-results">{results.map(x => <button key={x.NORAD_CAT_ID} onClick={() => { onSelect(x); setTerm('') }}><span>{x.OBJECT_NAME}</span><small>NORAD {x.NORAD_CAT_ID}</small></button>)}</div>}{selected && <div className="selected-object"><i style={{ background: color }} />{selected.OBJECT_NAME}</div>}</div>
}

const Metric = ({ label, value, hint }) => (
  <div className="metric-box">
    <div className="metric-box-header">
      {label}
    </div>

    <div className="metric-box-value">
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  </div>
)
const signed = n => `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)} km`
function InspectionCard({ item, color }) { return <div className="telemetry-card"><div><i style={{ background: color }} /><span>{item.name}</span></div><p>NORAD ID <b>{item.norad}</b></p><section><span>LATITUDE <b>{item.latitude.toFixed(4)}°</b></span><span>LONGITUDE <b>{item.longitude.toFixed(4)}°</b></span><span>ALTITUDE <b>{item.altitude.toFixed(2)} km</b></span><span>VELOCITY <b>{item.speed.toFixed(3)} km/s</b></span><span>ECI X <b>{signed(item.eci.x)}</b></span><span>ECI Y <b>{signed(item.eci.y)}</b></span><span>ECI Z <b>{signed(item.eci.z)}</b></span></section><em>● LIVE {item.updatedAt.toLocaleTimeString()}</em></div> }
function DebrisWatchPanel({ selected, watches }) { return <section className="debris-watch-panel"><h3>DEBRIS WATCH · 50 KM RANGE</h3>{selected.some(Boolean) ? selected.map((item, index) => { const watch = watches[index]; return item && <div className={`watch-result ${watch?.insideRange ? 'alert' : ''}`} key={item.NORAD_CAT_ID}><div><i style={{ background: colors[index] }} /><strong>{item.OBJECT_NAME}</strong></div><b>{watch ? (watch.insideRange ? 'DEBRIS DETECTED' : 'CLEAR') : 'CHECKING…'}</b>{watch?.distanceKm && <span>{watch.insideRange ? `${watch.name} is ${watch.distanceKm.toFixed(1)} km away` : `Nearest debris: ${watch.distanceKm.toFixed(1)} km away`}</span>}</div> }) : <p>Select a satellite to start the live debris watch.</p>}</section> }

function OrbitDisplay({ selected, leftCollapsed, showAllActive, setShowAllActive, satelliteCount }) {
  return (
    <div className={`orbit-display ${leftCollapsed ? 'orbit-display-left-collapsed' : ''}`}>
      <button
  className="primary-button orbit-display-toggle"
  onClick={() => setShowAllActive(!showAllActive)}
>
  {showAllActive
    ? 'HIDE ALL SATELLITES'
    : `SHOW ALL ${satelliteCount.toLocaleString()} SATELLITES`}
</button>
      <div className="orbit-display-box orbit-display-a">

        <div className="orbit-display-title">
          <span className="orbit-display-dot cyan-dot"></span>
          <strong>ORBIT A</strong>
        </div>

        <div className="orbit-display-name">
          {selected[0]
            ? selected[0].OBJECT_NAME
            : 'NO OBJECT SELECTED'}
        </div>

        {selected[0] && (
          <div className="orbit-display-norad">
            NORAD {selected[0].NORAD_CAT_ID}
          </div>
        )}

      </div>


      <div className="orbit-display-box orbit-display-b">

        <div className="orbit-display-title">
          <span className="orbit-display-dot amber-dot"></span>
          <strong>ORBIT B</strong>
        </div>

        <div className="orbit-display-name">
          {selected[1]
            ? selected[1].OBJECT_NAME
            : 'NO OBJECT SELECTED'}
        </div>

        {selected[1] && (
          <div className="orbit-display-norad">
            NORAD {selected[1].NORAD_CAT_ID}
          </div>
        )}

      </div>

    </div>
  )
}

export default function SpaceView() {
  const [catalog, setCatalog] = useState([]),
  [selected, setSelected] = useState([null, null]),
  [inspection, setInspection] = useState([null, null]),
  [screening, setScreening] = useState(null),
  [error, setError] = useState(''),
  [panelWidth, setPanelWidth] = useState(380),
  [resizing, setResizing] = useState(false),
  [leftCollapsed, setLeftCollapsed] = useState(true),
  [rightCollapsed, setRightCollapsed] = useState(true),
  [debrisWatch, setDebrisWatch] = useState([null, null])
  const [showAllActive, setShowAllActive] = useState(false)
  const [objectInfo, setObjectInfo] = useState({
  A: null,
  B: null
})
  useEffect(() => { fetch(`${API}/api/orbital-data`).then(r => r.ok ? r.json() : Promise.reject()).then(setCatalog).catch(() => setError('Catalog service is offline. Start the backend on port 3000.')) }, [])
  
  useEffect(() => {

  if (!selected[0] || !selected[1]) {
    setScreening(null)
    return
  }

  let cancelled = false

  const run = () => {

    const result =
      screenPair(
        selected[0],
        selected[1]
      )

    if (!cancelled) {
      setScreening(result)
    }
  }

  run()

  const id =
    setInterval(run, 30000)

  return () => {
    cancelled = true
    clearInterval(id)
  }

}, [selected])

  useEffect(() => {
    const updateTelemetry = () => {
      setInspection(selected.map((item, index) => {
        if (!item) return null

        try {
          const rec = satellite.json2satrec(item)
          const info = snapshot(item, rec)
          return info ? { ...info, color: colors[index] } : null
        } catch {
          return null
        }
      }))
    }

    updateTelemetry()
    const id = setInterval(updateTelemetry, 1000)

    return () => clearInterval(id)
  }, [selected])

  useEffect(() => { const move = e => { if (resizing) setPanelWidth(Math.max(380, Math.min(window.innerWidth - 430, window.innerWidth - e.clientX))) }; const stop = () => setResizing(false); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) } }, [resizing])
  const watchRecords = useMemo(() => {

  return catalog
    .filter(
      item =>
        item.OBJECT_TYPE === 'DEBRIS'
    )
    .slice(0, 1200)
    .map(item => {

      try {
        return {
          name: item.OBJECT_NAME,
          norad: item.NORAD_CAT_ID,
          rec: satellite.json2satrec(item)
        }
      } catch {
        return null
      }

    })
    .filter(Boolean)

}, [catalog])
  const inspect = (item, index) => {
  setInspection(prev => {
    const next = [...prev]
    next[index] = {
      ...item,
      color: colors[index]
    }
    return next
  })
}

  const choose = (index, item) => {

  // Clear old analysis immediately
  setScreening(null)

  // Clear debris warning for this slot
  setDebrisWatch(old =>
    old.map((x, i) =>
      i === index ? null : x
    )
  )

  // Replace selected satellite
  setSelected(old =>
    old.map((x, i) =>
      i === index ? item : x
    )
  )
}
  const handleSwarmClick = (satelliteData) => {
    // 1. Set the raw clicked satellite as Object A in the left panel
    setSelected(prev => [satelliteData, prev[1]]);
    
    // 2. Safely generate the exact telemetry format the InspectionCard expects
    try {
      const rec = satellite.json2satrec(satelliteData);
      const info = snapshot(satelliteData, rec);
      if (info) {
        setInspection(prev => {
  const next = [...prev]
  next[0] = {
    ...info,
    color: colors[0]
  }
  return next
})
      }
    } catch (e) {
       setInspection([null, null]);
    }
  };
  return <section
    className="mission-view"
    style={{
      gridTemplateColumns: `${leftCollapsed ? 48 : 320}px minmax(300px, 1fr) ${rightCollapsed ? 48 : panelWidth}px`
    }}>
    <aside className={`mission-rail ${leftCollapsed ? 'collapsed' : ''}`}><button className="collapse-toggle left" onClick={() => setLeftCollapsed(x => !x)} title="Collapse or expand controls">{leftCollapsed ? '›' : '‹'}</button><div className="rail-content"><h1>
  Monitor the<br />
  Space Around<br />
  Earth.
</h1><p className="mission-copy">
  Track orbital paths, monitor nearby debris, and screen potential conjunctions.
</p>
    <div className="picker-stack old-picker-stack"><Search catalog={catalog} label="OBJECT A" selected={selected[0]} color={colors[0]} onSelect={x => choose(0, x)} /><Search catalog={catalog} label="OBJECT B" selected={selected[1]} color={colors[1]} onSelect={x => choose(1, x)} />
      {/* NEW TOGGLE BUTTON */}
  <button 
    className="primary-button" 
    style={{ marginTop: '12px', width: '100%' }} 
    onClick={() => setShowAllActive(!showAllActive)}
  >
    {showAllActive ? 'HIDE ALL SATELLITES' : `SHOW ALL ${catalog.filter(c => c.OBJECT_TYPE === 'ACTIVE').length.toLocaleString()} SATELLITES`}
  </button></div><DebrisWatchPanel selected={selected} watches={debrisWatch} />{error ? <p className="service-error">{error}</p> : <div className="catalog-live"><b /> {catalog.length ? `${catalog.length.toLocaleString()} catalogued objects loaded` : 'Connecting to catalog…'}</div>}</div></aside>
  
  <div className="orbital-stage">

  

  <div className="stage-top">
    <span>EARTH-CENTERED INERTIAL VIEW</span>
    <span>DRAG TO ORBIT · SCROLL TO ZOOM</span>
  </div>

  <Canvas
    camera={{ position: [7.8, 4.2, 8.4], fov: 36  }}
    dpr={[1, 1.7]}
  >

    <color attach="background" args={['#07101d']} />

    <ambientLight intensity={2.2} />

<hemisphereLight
  skyColor="#8fd8ff"
  groundColor="#0b4fa3"
  intensity={1.8}
/>

<directionalLight
  position={[8, 6, 8]}
  intensity={0.9}
  color="#ffffff"
/>

    <Stars
      radius={80}
      depth={40}
      count={2700}
      factor={2.3}
      saturation={0}
      fade
      speed={.25}
    />

    <Earth />

    <DebrisSwarm catalog={catalog} />

    <ActiveSwarm
      catalog={catalog}
      visible={showAllActive}
      onSatClick={handleSwarmClick}
    />

    {selected.map((item, i) => item && (
      <group key={item.NORAD_CAT_ID}>

        <Orbit
          data={item}
          color={colors[i]}
          active={inspection[i]?.norad === item.NORAD_CAT_ID}
          watch={debrisWatch[i]}
        />

        <SatelliteMarker
          data={item}
          color={colors[i]}
          active={inspection[i]?.norad === item.NORAD_CAT_ID}
          watch={debrisWatch[i]}
          debrisRecords={watchRecords}
          onInspect={x => inspect(x, i)}
          onWatchUpdate={watch =>
            setDebrisWatch(old =>
              old.map((x, index) =>
                index === i ? watch : x
              )
            )
          }
        />

      </group>
    ))}

    <EffectComposer disableNormalPass>
      <Bloom
        luminanceThreshold={0.15}
        mipmapBlur
        intensity={1.2}
      />
    </EffectComposer>

    <OrbitControls
      enablePan={false}
      minDistance={4.8}
      maxDistance={20}
    />

  </Canvas>

<OrbitDisplay
  selected={selected}
  leftCollapsed={leftCollapsed}
  showAllActive={showAllActive}
  setShowAllActive={setShowAllActive}
  satelliteCount={catalog.filter(c => c.OBJECT_TYPE === 'ACTIVE').length}
/>

</div>

<aside className={`analysis-rail ${rightCollapsed ? 'collapsed' : ''}`}>

  <button
    className="collapse-toggle right"
    onClick={() => setRightCollapsed(x => !x)}
    title="Collapse or expand analysis"
  >
    {rightCollapsed ? '‹' : '›'}
  </button>

  {!rightCollapsed && (
    <button
      className="resize-handle"
      title="Drag to resize analysis panel"
      onPointerDown={e => {
        e.preventDefault()
        setResizing(true)
      }}
    >
      <span />
    </button>
  )}

  <div className="rail-content">

    <div className="panel-heading">
      <span>CLOSE APPROACH ASSESSMENT</span>
      <b>24 HORIZON</b>
    </div>

    {screening ? (
      <>
        <div className="pair-names">
          <span>
            OBJECT A
            <b>{selected[0].OBJECT_NAME}</b>
          </span>

          <span>
            OBJECT B
            <b>{selected[1].OBJECT_NAME}</b>
          </span>
        </div>

        <h4>CURRENT STATE</h4>

        <Metric
          label="Separation"
          value={`${screening.currentDistance.toFixed(2)} km`}
        />

        <Metric
          label="Relative velocity"
          value={`${screening.currentSpeed.toFixed(4)} km/s`}
        />

        <h4>CLOSEST APPROACH</h4>

        <Metric
          label="Miss distance"
          value={`${screening.distance.toFixed(2)} km`}
        />

        <Metric
          label="Time to TCA"
          value={`${screening.hours.toFixed(1)} h`}
          hint={screening.time.toLocaleTimeString()}
        />

        <Metric
          label="Relative velocity @ TCA"
          value={`${screening.relativeSpeed.toFixed(4)} km/s`}
        />

  <Metric
  label="Screening Status"
  value={
    screening.distance < 10
      ? 'REVIEW RECOMMENDED'
      : 'MONITOR'
  }
/>

<div className="screening-context">
  <span>SCREENING METHODOLOGY</span>
  <p>
   24-hour screening uses SGP4-propagated positions. Thresholds flag close approach for review; they do not estimate collision probability.
  </p>
</div>
        
      </>
    ) : (
      <div className="analysis-empty">
        Choose both objects to calculate a 24-hour minimum-separation screening window.
      </div>
    )}
    

    <div className="telemetry-heading">
      SELECTED OBJECTS
    </div>

{inspection[0] && (
  <>
    <h4>OBJECT A</h4>
    <InspectionCard
      item={inspection[0]}
      color={colors[0]}
    />
  </>
)}

{inspection[1] && (
  <>
    <h4>OBJECT B</h4>
    <InspectionCard
      item={inspection[1]}
      color={colors[1]}
    />
  </>
)}

{!inspection[0] && !inspection[1] && (
  <p className="analysis-empty">
    Click either selected orbital satellite to view its live telemetry.
  </p>
)}

  </div>

</aside>

</section>
}
   
