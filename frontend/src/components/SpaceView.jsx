import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Line, OrbitControls, Stars } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'

import earthTexture from '../assets/earth-texture.png'
import './SpaceView.css'
import './MissionPolish.css'


const API = 'http://localhost:3000', RADIUS = 6378.137, DISPLAY = 3.2, SCALE = DISPLAY / RADIUS
const colors = ['#48d7ff', '#ffb454']
const DEBRIS_WATCH_RADIUS_KM = 50
const toScene = p => [p.x * SCALE, p.z * SCALE, -p.y * SCALE]
const mag = v => Math.hypot(v.x, v.y, v.z)
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

function Earth() {
  const mesh = useRef(), texture = useLoader(THREE.TextureLoader, earthTexture)
  texture.colorSpace = THREE.SRGBColorSpace
  useFrame((_, delta) => { if (mesh.current) mesh.current.rotation.y += delta * .035 })
  return <group><mesh ref={mesh}><sphereGeometry args={[DISPLAY, 64, 64]} />
  <meshStandardMaterial map={texture} roughness={.7} metalness={.05} emissive="#061827" emissiveIntensity={.34} /></mesh><mesh scale={1.012}><sphereGeometry args={[DISPLAY, 64, 64]} />
  <meshBasicMaterial color="#67ceff" transparent opacity={0.14} side={THREE.BackSide} /></mesh></group>
}

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
        const debrisState = satellite.propagate(debris.rec, now)
        if (!debrisState?.position) continue
        const separation = distance(state.position, debrisState.position)
        if (!nearest || separation < nearest.distanceKm) nearest = { name: debris.name, norad: debris.norad, distanceKm: separation }
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
  const now = new Date(), a = satellite.json2satrec(first), b = satellite.json2satrec(second); let best = null
  const check = time => { const l = satellite.propagate(a, time), r = satellite.propagate(b, time); if (!l?.position || !r?.position) return; const d = distance(l.position, r.position); if (!best || d < best.distance) best = { distance: d, time, relativeSpeed: mag({ x: l.velocity.x - r.velocity.x, y: l.velocity.y - r.velocity.y, z: l.velocity.z - r.velocity.z }) } }
  for (let m = 0; m <= 1440; m += 2) check(new Date(now.getTime() + m * 60000)); if (best) { const centre = best.time; for (let s = -120; s <= 120; s += 5) check(new Date(centre.getTime() + s * 1000)) }; if (!best) return null
  const ca = satellite.propagate(a, now), cb = satellite.propagate(b, now)
  return { ...best, currentDistance: distance(ca.position, cb.position), currentSpeed: mag({ x: ca.velocity.x - cb.velocity.x, y: ca.velocity.y - cb.velocity.y, z: ca.velocity.z - cb.velocity.z }), hours: (best.time - now) / 3600000 }
}

function Search({ catalog, label, selected, color, onSelect }) {
  const [term, setTerm] = useState('')
  const results = useMemo(() => term.trim() ? catalog.filter(x => x.OBJECT_TYPE === 'ACTIVE' && `${x.OBJECT_NAME} ${x.NORAD_CAT_ID}`.toLowerCase().includes(term.toLowerCase())).slice(0, 6) : [], [catalog, term])
  return <div className="object-picker"><label>{label}</label><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Name or NORAD ID" />{results.length > 0 && <div className="picker-results">{results.map(x => <button key={x.NORAD_CAT_ID} onClick={() => { onSelect(x); setTerm(x.OBJECT_NAME) }}><span>{x.OBJECT_NAME}</span><small>NORAD {x.NORAD_CAT_ID}</small></button>)}</div>}{selected && <div className="selected-object"><i style={{ background: color }} />{selected.OBJECT_NAME}</div>}</div>
}

const Metric = ({ label, value, hint }) => <div className="metric"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
const signed = n => `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)} km`
function InspectionCard({ item, color }) { return <div className="telemetry-card"><div><i style={{ background: color }} /><span>{item.name}</span></div><p>NORAD ID <b>{item.norad}</b></p><section><span>LATITUDE <b>{item.latitude.toFixed(4)}°</b></span><span>LONGITUDE <b>{item.longitude.toFixed(4)}°</b></span><span>ALTITUDE <b>{item.altitude.toFixed(2)} km</b></span><span>VELOCITY <b>{item.speed.toFixed(3)} km/s</b></span><span>ECI X <b>{signed(item.eci.x)}</b></span><span>ECI Y <b>{signed(item.eci.y)}</b></span><span>ECI Z <b>{signed(item.eci.z)}</b></span></section><em>● LIVE {item.updatedAt.toLocaleTimeString()}</em></div> }
function DebrisWatchPanel({ selected, watches }) { return <section className="debris-watch-panel"><h3>DEBRIS WATCH · 50 KM RANGE</h3>{selected.some(Boolean) ? selected.map((item, index) => { const watch = watches[index]; return item && <div className={`watch-result ${watch?.insideRange ? 'alert' : ''}`} key={item.NORAD_CAT_ID}><div><i style={{ background: colors[index] }} /><strong>{item.OBJECT_NAME}</strong></div><b>{watch ? (watch.insideRange ? 'DEBRIS DETECTED' : 'CLEAR') : 'CHECKING…'}</b>{watch?.distanceKm && <span>{watch.insideRange ? `${watch.name} is ${watch.distanceKm.toFixed(1)} km away` : `Nearest debris: ${watch.distanceKm.toFixed(1)} km away`}</span>}</div> }) : <p>Select a satellite to start the live debris watch.</p>}</section> }

function OrbitDisplay({ selected }) {
  return (
    <div className="orbit-display">

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
  const [catalog, setCatalog] = useState([]), [selected, setSelected] = useState([null, null]), [inspection, setInspection] = useState(null), [screening, setScreening] = useState(null), [error, setError] = useState(''), [panelWidth, setPanelWidth] = useState(380), [resizing, setResizing] = useState(false), [leftCollapsed, setLeftCollapsed] = useState(false), [rightCollapsed, setRightCollapsed] = useState(false), [debrisWatch, setDebrisWatch] = useState([null, null])
  const [showAllActive, setShowAllActive] = useState(false)
  useEffect(() => { fetch(`${API}/api/orbital-data`).then(r => r.ok ? r.json() : Promise.reject()).then(setCatalog).catch(() => setError('Catalog service is offline. Start the backend on port 3000.')) }, [])
  useEffect(() => { if (!selected[0] || !selected[1]) return setScreening(null); const run = () => setScreening(screenPair(selected[0], selected[1])); run(); const id = setInterval(run, 30000); return () => clearInterval(id) }, [selected])
  useEffect(() => { const move = e => { if (resizing) setPanelWidth(Math.max(380, Math.min(window.innerWidth - 430, window.innerWidth - e.clientX))) }; const stop = () => setResizing(false); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) } }, [resizing])
  const watchRecords = useMemo(() => catalog.filter(item => item.OBJECT_TYPE === 'DEBRIS').slice(0, 1200).map(item => ({ name: item.OBJECT_NAME, norad: item.NORAD_CAT_ID, rec: satellite.json2satrec(item) })), [catalog])
  const choose = (index, item) => { setSelected(old => old.map((x, i) => i === index ? item : x)); setDebrisWatch(old => old.map((x, i) => i === index ? null : x)); setInspection(null) }
  const inspect = (value, color) => setInspection({ ...value, color })
  const handleSwarmClick = (satelliteData) => {
    // 1. Set the raw clicked satellite as Object A in the left panel
    setSelected(prev => [satelliteData, prev[1]]);
    
    // 2. Safely generate the exact telemetry format the InspectionCard expects
    try {
      const rec = satellite.json2satrec(satelliteData);
      const info = snapshot(satelliteData, rec);
      if (info) {
        setInspection({ ...info, color: colors[0] });
      }
    } catch (e) {
      setInspection(null);
    }
  };
  return <section className="mission-view" style={{ gridTemplateColumns: `${leftCollapsed ? 48 : 320}px minmax(300px, 1fr) ${rightCollapsed ? 48 : panelWidth}px` }}>
    <aside className={`mission-rail ${leftCollapsed ? 'collapsed' : ''}`}><button className="collapse-toggle left" onClick={() => setLeftCollapsed(x => !x)} title="Collapse or expand controls">{leftCollapsed ? '›' : '‹'}</button><div className="rail-content"><div className="eyebrow"><b /> LIVE ORBIT SCREENING</div><h1>Understand the space around Earth.</h1><p className="mission-copy">Select two catalogued objects to visualise their propagated paths and simplified relative-motion indicators.</p>
    <div className="picker-stack old-picker-stack"><Search catalog={catalog} label="OBJECT A" selected={selected[0]} color={colors[0]} onSelect={x => choose(0, x)} /><Search catalog={catalog} label="OBJECT B" selected={selected[1]} color={colors[1]} onSelect={x => choose(1, x)} />
      {/* NEW TOGGLE BUTTON */}
  <button 
    className="primary-button" 
    style={{ marginTop: '12px', width: '100%' }} 
    onClick={() => setShowAllActive(!showAllActive)}
  >
    {showAllActive ? 'HIDE ALL SATELLITES' : `SHOW ALL ${catalog.filter(c => c.OBJECT_TYPE === 'ACTIVE').length.toLocaleString()} SATELLITES`}
  </button></div><DebrisWatchPanel selected={selected} watches={debrisWatch} />{error ? <p className="service-error">{error}</p> : <div className="catalog-live"><b /> {catalog.length ? `${catalog.length.toLocaleString()} catalogued objects loaded` : 'Connecting to catalog…'}</div>}<div className="method-note"><strong>Screening context</strong><p>Paths use SGP4 propagation. Results are visual indicators, not operational collision-avoidance advice.</p></div></div></aside>
  
  <div className="orbital-stage">

  <OrbitDisplay selected={selected} />

  <div className="stage-top">
    <span>EARTH-CENTERED INERTIAL VIEW</span>
    <span>DRAG TO ORBIT · SCROLL TO ZOOM</span>
  </div>

  <Canvas
    camera={{ position: [7.8, 4.2, 8.4], fov: 42 }}
    dpr={[1, 1.7]}
  >

    <color attach="background" args={['#07101d']} />

    <ambientLight intensity={.6} />

    <pointLight
      position={[9, 6, 7]}
      intensity={42}
      color="#a6e5ff"
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
          active={inspection?.norad === item.NORAD_CAT_ID}
          watch={debrisWatch[i]}
        />

        <SatelliteMarker
          data={item}
          color={colors[i]}
          active={inspection?.norad === item.NORAD_CAT_ID}
          watch={debrisWatch[i]}
          debrisRecords={watchRecords}
          onInspect={x => inspect(x, colors[i])}
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

  <div className="stage-legend">
    <span><i className="cyan" /> OBJECT A</span>
    <span><i className="amber" /> OBJECT B</span>
    <span><i className="orbit-key" /> PROPAGATED PATH</span>
  </div>

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
      <span>CONJUNCTION ANALYSIS</span>
      <b>24 HORIZON</b>
    </div>

    {screening ? (
      <>
        <div className="pair-names">
          <span>
            OBJECT 1
            <b>{selected[0].OBJECT_NAME}</b>
          </span>

          <span>
            OBJECT 2
            <b>{selected[1].OBJECT_NAME}</b>
          </span>
        </div>

        <h4>CURRENT</h4>

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

        <div className="screening-state">
          <span>SCREENING STATUS</span>

          <strong className={screening.distance < 10 ? 'attention' : ''}>
            {screening.distance < 10
              ? 'REVIEW RECOMMENDED'
              : 'MONITOR'}
          </strong>

          <p>
            Thresholds flag a closer look; they do not estimate collision probability.
          </p>
        </div>
      </>
    ) : (
      <div className="analysis-empty">
        Choose both objects to calculate a 24-hour minimum-separation screening window.
      </div>
    )}

    <div className="telemetry-heading">
      INFORMATION · CLICK A SATELLITE
    </div>

    {inspection ? (
      <InspectionCard
        item={inspection}
        color={inspection.color}
      />
    ) : (
      <p className="analysis-empty">
        Individual data stays hidden until you click a glowing satellite marker.
      </p>
    )}

  </div>

</aside>

</section>
}
   

