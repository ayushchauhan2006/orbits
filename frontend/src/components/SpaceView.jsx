import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Line, OrbitControls, Stars } from '@react-three/drei'
import earthTexture from '../assets/earth-texture.png'
import './SpaceView.css'

const API = 'http://localhost:3000'
const EARTH_RADIUS_KM = 6378.137
const DISPLAY_RADIUS = 3.2
const SCALE = DISPLAY_RADIUS / EARTH_RADIUS_KM
const palette = ['#48d7ff', '#ffb454']
const toScene = p => [p.x * SCALE, p.z * SCALE, -p.y * SCALE]
const magnitude = v => Math.hypot(v.x, v.y, v.z)
const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

function Earth() {
  const earth = useRef()
  const texture = useLoader(THREE.TextureLoader, earthTexture)
  texture.colorSpace = THREE.SRGBColorSpace
  useFrame((_, delta) => { if (earth.current) earth.current.rotation.y += delta * 0.035 })
  return <group>
    <mesh ref={earth}><sphereGeometry args={[DISPLAY_RADIUS, 64, 64]} /><meshStandardMaterial map={texture} roughness={0.7} metalness={0.05} emissive="#02101d" emissiveIntensity={0.25} /></mesh>
    <mesh scale={1.024}><sphereGeometry args={[DISPLAY_RADIUS, 64, 64]} /><meshBasicMaterial color="#4bc4ff" transparent opacity={0.12} side={THREE.BackSide} /></mesh>
  </group>
}

function Orbit({ data, color }) {
  const points = useMemo(() => {
    try {
      const satrec = satellite.json2satrec(data), period = (2 * Math.PI) / satrec.no, start = new Date(), path = []
      for (let i = 0; i <= 240; i += 1) {
        const state = satellite.propagate(satrec, new Date(start.getTime() + period * i / 240 * 60000))
        if (state?.position) path.push(toScene(state.position))
      }
      return path
    } catch { return [] }
  }, [data])
  return points.length > 2 ? <Line points={points} color={color} transparent opacity={0.68} lineWidth={1.25} /> : null
}

function SatelliteMarker({ data, color, onInspect }) {
  const marker = useRef()
  const satrec = useMemo(() => satellite.json2satrec(data), [data])
  useFrame(() => {
    const state = satellite.propagate(satrec, new Date())
    if (state?.position && marker.current) marker.current.position.set(...toScene(state.position))
  })
  const inspect = event => {
    event.stopPropagation()
    const now = new Date(), state = satellite.propagate(satrec, now)
    if (!state?.position || !state.velocity) return
    const gd = satellite.eciToGeodetic(state.position, satellite.gstime(now))
    onInspect({ name: data.OBJECT_NAME, norad: data.NORAD_CAT_ID, altitude: gd.height, speed: magnitude(state.velocity), latitude: satellite.radiansToDegrees(gd.latitude), longitude: satellite.radiansToDegrees(gd.longitude), eci: state.position, epoch: data.EPOCH, updatedAt: now })
  }
  return <group ref={marker}><mesh onClick={inspect}><sphereGeometry args={[0.115, 18, 18]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.8} /></mesh><mesh scale={1.9}><sphereGeometry args={[0.115, 18, 18]} /><meshBasicMaterial color={color} transparent opacity={0.16} /></mesh></group>
}

function screenPair(first, second) {
  const now = new Date(), a = satellite.json2satrec(first), b = satellite.json2satrec(second)
  let best = null
  const check = time => {
    const left = satellite.propagate(a, time), right = satellite.propagate(b, time)
    if (!left?.position || !right?.position) return
    const distance = separation(left.position, right.position)
    if (!best || distance < best.distance) best = { distance, time, relativeSpeed: magnitude({ x: left.velocity.x - right.velocity.x, y: left.velocity.y - right.velocity.y, z: left.velocity.z - right.velocity.z }) }
  }
  for (let minute = 0; minute <= 1440; minute += 2) check(new Date(now.getTime() + minute * 60000))
  if (best) { const centre = best.time; for (let second = -120; second <= 120; second += 5) check(new Date(centre.getTime() + second * 1000)) }
  if (!best) return null
  const currentA = satellite.propagate(a, now), currentB = satellite.propagate(b, now)
  return { ...best, currentDistance: separation(currentA.position, currentB.position), currentSpeed: magnitude({ x: currentA.velocity.x - currentB.velocity.x, y: currentA.velocity.y - currentB.velocity.y, z: currentA.velocity.z - currentB.velocity.z }), hours: (best.time - now) / 3600000 }
}

function Search({ catalog, label, selected, accent, onSelect }) {
  const [term, setTerm] = useState('')
  const results = useMemo(() => term.trim() ? catalog.filter(item => `${item.OBJECT_NAME} ${item.NORAD_CAT_ID}`.toLowerCase().includes(term.toLowerCase())).slice(0, 6) : [], [catalog, term])
  return <div className="object-picker"><label>{label}</label><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Name or NORAD ID" />{results.length > 0 && <div className="picker-results">{results.map(item => <button key={item.NORAD_CAT_ID} onClick={() => { onSelect(item); setTerm(item.OBJECT_NAME) }}><span>{item.OBJECT_NAME}</span><small>NORAD {item.NORAD_CAT_ID}</small></button>)}</div>}{selected && <div className="selected-object"><i style={{ background: accent }} />{selected.OBJECT_NAME}</div>}</div>
}

const Metric = ({ label, value, hint }) => <div className="metric"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
const signed = value => `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)} km`

function InspectionCard({ item, color }) {
  return <div className="telemetry-card"><div><i style={{ background: color }} /><span>{item.name}</span></div><p>NORAD ID <b>{item.norad}</b></p><section><span>LATITUDE <b>{item.latitude.toFixed(4)}°</b></span><span>LONGITUDE <b>{item.longitude.toFixed(4)}°</b></span><span>ALTITUDE <b>{item.altitude.toFixed(2)} km</b></span><span>VELOCITY <b>{item.speed.toFixed(3)} km/s</b></span><span>ECI X <b>{signed(item.eci.x)}</b></span><span>ECI Y <b>{signed(item.eci.y)}</b></span><span>ECI Z <b>{signed(item.eci.z)}</b></span></section><em>● LIVE {item.updatedAt.toLocaleTimeString()}</em></div>
}

export default function SpaceView() {
  const [catalog, setCatalog] = useState([]), [selected, setSelected] = useState([null, null]), [inspection, setInspection] = useState(null), [screening, setScreening] = useState(null), [error, setError] = useState(''), [panelWidth, setPanelWidth] = useState(500), [resizing, setResizing] = useState(false)
  useEffect(() => { fetch(`${API}/api/orbital-data`).then(r => r.ok ? r.json() : Promise.reject()).then(setCatalog).catch(() => setError('Catalog service is offline. Start the backend on port 3000.')) }, [])
  useEffect(() => { if (!selected[0] || !selected[1]) return setScreening(null); const run = () => setScreening(screenPair(selected[0], selected[1])); run(); const id = setInterval(run, 30000); return () => clearInterval(id) }, [selected])
  useEffect(() => { const move = e => { if (resizing) setPanelWidth(Math.max(380, Math.min(window.innerWidth - 430, window.innerWidth - e.clientX))) }; const stop = () => setResizing(false); window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) } }, [resizing])
  const setObject = (index, item) => { setSelected(previous => previous.map((x, i) => i === index ? item : x)); setInspection(null) }
  return <section className="mission-view" style={{ gridTemplateColumns: `320px minmax(300px, 1fr) ${panelWidth}px` }}>
    <aside className="mission-rail"><div className="eyebrow"><b /> LIVE ORBIT SCREENING</div><h1>Understand the space around Earth.</h1><p className="mission-copy">Select two catalogued objects to visualise their propagated paths and simplified relative-motion indicators.</p><div className="picker-stack"><Search catalog={catalog} label="OBJECT A" selected={selected[0]} accent={palette[0]} onSelect={item => setObject(0, item)} /><Search catalog={catalog} label="OBJECT B" selected={selected[1]} accent={palette[1]} onSelect={item => setObject(1, item)} /></div>{error ? <p className="service-error">{error}</p> : <div className="catalog-live"><b /> {catalog.length ? `${catalog.length.toLocaleString()} catalogued objects loaded` : 'Connecting to catalog…'}</div>}<div className="method-note"><strong>Screening context</strong><p>Paths use SGP4 propagation. Results are visual indicators, not operational collision-avoidance advice.</p></div></aside>
    <div className="orbital-stage"><div className="stage-top"><span>EARTH-CENTERED INERTIAL VIEW</span><span>DRAG TO ORBIT · SCROLL TO ZOOM</span></div><Canvas camera={{ position: [7.8, 4.2, 8.4], fov: 42 }} dpr={[1, 1.7]}><color attach="background" args={['#020611']} /><ambientLight intensity={0.45} /><pointLight position={[9, 6, 7]} intensity={38} color="#90d9ff" /><Stars radius={80} depth={40} count={2700} factor={2.3} saturation={0} fade speed={0.25} /><Earth />{selected.map((item, index) => item && <group key={item.NORAD_CAT_ID}><Orbit data={item} color={palette[index]} /><SatelliteMarker data={item} color={palette[index]} onInspect={value => setInspection({ ...value, color: palette[index] })} /></group>)}<OrbitControls enablePan={false} minDistance={4.8} maxDistance={20} /></Canvas>{!selected[0] && <div className="empty-stage"><span>01</span><strong>Select objects to begin</strong><p>The visualisation will plot orbital paths in a stable inertial reference frame.</p></div>}<div className="stage-legend"><span><i className="cyan" /> OBJECT A</span><span><i className="amber" /> OBJECT B</span><span><i className="orbit-key" /> PROPAGATED PATH</span></div></div>
    <aside className="analysis-rail"><button className="resize-handle" title="Drag to resize analysis panel" onPointerDown={e => { e.preventDefault(); setResizing(true) }}><span /></button><div className="panel-heading"><span>CONJUNCTION ANALYSIS</span><b>24 HORIZON</b></div>{screening ? <><div className="pair-names"><span>OBJECT 1 <b>{selected[0].OBJECT_NAME}</b></span><span>OBJECT 2 <b>{selected[1].OBJECT_NAME}</b></span></div><h4>CURRENT</h4><Metric label="Separation" value={`${screening.currentDistance.toFixed(2)} km`} /><Metric label="Relative velocity" value={`${screening.currentSpeed.toFixed(4)} km/s`} /><h4>CLOSEST APPROACH</h4><Metric label="Miss distance" value={`${screening.distance.toFixed(2)} km`} /><Metric label="Time to TCA" value={`${screening.hours.toFixed(1)} h`} hint={screening.time.toLocaleTimeString()} /><Metric label="Relative velocity @ TCA" value={`${screening.relativeSpeed.toFixed(4)} km/s`} /><div className="screening-state"><span>SCREENING STATUS</span><strong className={screening.distance < 10 ? 'attention' : ''}>{screening.distance < 10 ? 'REVIEW RECOMMENDED' : 'MONITOR'}</strong><p>Thresholds flag a closer look; they do not estimate collision probability.</p></div></> : <div className="analysis-empty">Choose both objects to calculate a 24-hour minimum-separation screening window.</div>}<div className="telemetry-heading">INFORMATION · CLICK A SATELLITE</div>{inspection ? <InspectionCard item={inspection} color={inspection.color} /> : <p className="analysis-empty">Individual data stays hidden until you click a glowing satellite marker.</p>}</aside>
  </section>
}
