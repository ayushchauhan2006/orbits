import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'


import * as THREE from 'three'
import * as satellite from 'satellite.js'

import {
  Canvas,
  useLoader,
  useFrame,
} from '@react-three/fiber'

import {
  OrbitControls,
  Line
} from '@react-three/drei'

function Earth() {
  const texture = useLoader(
    THREE.TextureLoader,
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
  )

  return (
    <mesh>
      <sphereGeometry args={[5, 64, 64]} />

      <meshStandardMaterial
        map={texture}
      />
    </mesh>
  )
}

function RealSatellite({
  orbitalData,
  objectIndex,
  onTelemetryUpdate
}) {
  const satelliteRef = useRef(null)

  // IMPORTANT:
  // This must be here, NOT inside useFrame()
  const lastTelemetryUpdate = useRef(0)

  const satrec = useRef(null)

  // Create SGP4 record only once
  if (!satrec.current && orbitalData) {
    satrec.current =
      satellite.json2satrec(orbitalData)
  }

  useFrame(() => {

    if (
      !satelliteRef.current ||
      !satrec.current
    ) {
      return
    }

    const now = new Date()

    // -----------------------------
    // SGP4 PROPAGATION
    // -----------------------------

    const state =
      satellite.propagate(
        satrec.current,
        now
      )

    if (
      !state ||
      !state.position ||
      !state.velocity
    ) {
      return
    }

    // -----------------------------
    // GMST
    // -----------------------------

    const gmst =
      satellite.gstime(now)

    // -----------------------------
    // ECI → ECF
    // -----------------------------

    const positionEcf =
      satellite.eciToEcf(
        state.position,
        gmst
      )

    // -----------------------------
    // ECI → GEODETIC
    // -----------------------------

    const positionGd =
      satellite.eciToGeodetic(
        state.position,
        gmst
      )

    const latitude =
      satellite.radiansToDegrees(
        positionGd.latitude
      )

    const longitude =
      satellite.radiansToDegrees(
        positionGd.longitude
      )

    const altitude =
      positionGd.height

    // -----------------------------
    // VELOCITY
    // -----------------------------

    const velocity =
      Math.sqrt(
        state.velocity.x ** 2 +
        state.velocity.y ** 2 +
        state.velocity.z ** 2
      )

    // -----------------------------
    // THREE.JS POSITION
    // -----------------------------

    const earthRadius = 6
    const realEarthRadius = 6378.137

    const scale =
      earthRadius / realEarthRadius

    satelliteRef.current.position.set(
      positionEcf.x * scale,
      positionEcf.z * scale,
      -positionEcf.y * scale
    )

    // -----------------------------
    // TELEMETRY UPDATE
    // -----------------------------

    const currentTime =
      performance.now()

    if (
      currentTime -
        lastTelemetryUpdate.current >
      200
    ) {

      lastTelemetryUpdate.current =
        currentTime

      onTelemetryUpdate((previous) => {

  const updated = [...previous]

  updated[objectIndex] = {
    name: orbitalData.OBJECT_NAME,
    noradId: orbitalData.NORAD_CAT_ID,

    latitude,
    longitude,
    altitude,

    positionX: state.position.x,
    positionY: state.position.y,
    positionZ: state.position.z,

    velocity,

    timestamp: new Date()
  }

  return updated
})
    }
  })

  return (
    <mesh ref={satelliteRef}>

      <sphereGeometry
        args={[0.15, 16, 16]}
      />

      <meshStandardMaterial
        color="red"
        emissive="red"
        emissiveIntensity={2}
      />

    </mesh>
  )
}

function OrbitPath({ orbitalData }) {
  const points = useMemo(() => {

    if (!orbitalData) {
      return []
    }

    const satrec =
      satellite.json2satrec(orbitalData)

    // SGP4 mean motion is radians/minute
    const meanMotion = satrec.no

    if (!meanMotion) {
      return []
    }

    // Orbital period in minutes
    const periodMinutes =
      (2 * Math.PI) / meanMotion

    const numberOfPoints = 360

    const earthRadius = 6
    const realEarthRadius = 6378.137

    const scale =
      earthRadius / realEarthRadius

    const startTime = new Date()

    const orbitPoints = []

    for (
      let i = 0;
      i <= numberOfPoints;
      i++
    ) {

      const minutesFromNow =
        (periodMinutes * i) /
        numberOfPoints

      const time =
        new Date(
          startTime.getTime() +
          minutesFromNow * 60 * 1000
        )

      // SGP4 propagation
      const state =
        satellite.propagate(
          satrec,
          time
        )

      if (
        !state ||
        !state.position
      ) {
        continue
      }

      const gmst =
        satellite.gstime(time)

      // ECI → ECF
      const positionEcf =
        satellite.eciToEcf(
          state.position,
          gmst
        )

      orbitPoints.push([
        positionEcf.x * scale,
        positionEcf.z * scale,
        -positionEcf.y * scale
      ])
    }

    return orbitPoints

  }, [orbitalData])

  if (points.length < 2) {
    return null
  }

  return (
    <Line
      points={points}
      color="#00d9ff"
      lineWidth={1.5}
    />
  )
}

function SatelliteSearch({
  catalog,
  selected,
  onSelect,
  label
}) {

  const [query, setQuery] =
    useState('')

  const [showResults, setShowResults] =
    useState(false)

  const results =
    useMemo(() => {

      if (!query.trim()) {
        return []
      }

      const search =
        query
          .toLowerCase()
          .trim()

      return catalog
        .filter((sat) => {

          const name =
            String(
              sat.OBJECT_NAME || ''
            ).toLowerCase()

          const norad =
            String(
              sat.NORAD_CAT_ID || ''
            )

          return (
            name.includes(search) ||
            norad.includes(search)
          )
        })
        .slice(0, 8)

    }, [catalog, query])

  const handleSelect = (satelliteObject) => {

    onSelect(satelliteObject)

    setQuery(
      satelliteObject.OBJECT_NAME
    )

    setShowResults(false)
  }

  return (
    <div className="satellite-search">

      <label>
        {label}
      </label>

      <input
        type="text"
        value={query}
        placeholder="Search name or NORAD ID..."
        onChange={(event) => {

          setQuery(event.target.value)

          setShowResults(true)
        }}
        onFocus={() => {
          setShowResults(true)
        }}
      />

      {showResults &&
        query.trim() &&
        results.length > 0 && (

        <div className="search-results">

          {results.map((sat) => (

            <button
              key={sat.NORAD_CAT_ID}
              type="button"
              onClick={() =>
                handleSelect(sat)
              }
            >

              <strong>
                {sat.OBJECT_NAME}
              </strong>

              <span>
                NORAD {sat.NORAD_CAT_ID}
              </span>

            </button>

          ))}

        </div>
      )}

      {selected && (
        <div className="selected-satellite">

          Selected:

          <strong>
            {selected.OBJECT_NAME}
          </strong>

          <span>
            NORAD {selected.NORAD_CAT_ID}
          </span>

        </div>
      )}

    </div>
  )
}



function ConjunctionAnalysis({
  orbitalData
}) {
  const [analysis, setAnalysis] =
    useState(null)

  useEffect(() => {

    if (
      !orbitalData ||
      orbitalData.length < 2
    ) {
      return
    }

    let cancelled = false

    const calculateConjunction = () => {

      const startTime = new Date()

      // =================================
      // CREATE SGP4 RECORDS
      // =================================

      const satrec1 =
        satellite.json2satrec(
          orbitalData[0]
        )

      const satrec2 =
        satellite.json2satrec(
          orbitalData[1]
        )

      // =================================
      // CURRENT POSITION
      // =================================

      const currentState1 =
        satellite.propagate(
          satrec1,
          startTime
        )

      const currentState2 =
        satellite.propagate(
          satrec2,
          startTime
        )

      if (
        !currentState1?.position ||
        !currentState1?.velocity ||
        !currentState2?.position ||
        !currentState2?.velocity
      ) {
        return
      }

      // =================================
      // CURRENT RELATIVE VALUES
      // =================================

      const currentDx =
        currentState2.position.x -
        currentState1.position.x

      const currentDy =
        currentState2.position.y -
        currentState1.position.y

      const currentDz =
        currentState2.position.z -
        currentState1.position.z

      const currentDistance =
        Math.sqrt(
          currentDx ** 2 +
          currentDy ** 2 +
          currentDz ** 2
        )

      const currentDvx =
        currentState2.velocity.x -
        currentState1.velocity.x

      const currentDvy =
        currentState2.velocity.y -
        currentState1.velocity.y

      const currentDvz =
        currentState2.velocity.z -
        currentState1.velocity.z

      const currentRelativeVelocity =
        Math.sqrt(
          currentDvx ** 2 +
          currentDvy ** 2 +
          currentDvz ** 2
        )

      // =================================
      // SEARCH FUTURE
      // =================================

      // Search next 60 minutes
      const predictionMinutes = 60

      // Check every 5 seconds initially
      const stepSeconds = 5

      let closestDistance =
        currentDistance

      let closestTime =
        startTime

      let closestRelativeVelocity =
        currentRelativeVelocity

      // =================================
      // PROPAGATE BOTH OBJECTS
      // =================================

      for (
        let seconds = stepSeconds;
        seconds <= predictionMinutes * 60;
        seconds += stepSeconds
      ) {

        const futureTime =
          new Date(
            startTime.getTime() +
            seconds * 1000
          )

        const state1 =
          satellite.propagate(
            satrec1,
            futureTime
          )

        const state2 =
          satellite.propagate(
            satrec2,
            futureTime
          )

        if (
          !state1?.position ||
          !state1?.velocity ||
          !state2?.position ||
          !state2?.velocity
        ) {
          continue
        }

        // -----------------------------
        // RELATIVE POSITION
        // -----------------------------

        const dx =
          state2.position.x -
          state1.position.x

        const dy =
          state2.position.y -
          state1.position.y

        const dz =
          state2.position.z -
          state1.position.z

        const distance =
          Math.sqrt(
            dx ** 2 +
            dy ** 2 +
            dz ** 2
          )

        // -----------------------------
        // RELATIVE VELOCITY
        // -----------------------------

        const dvx =
          state2.velocity.x -
          state1.velocity.x

        const dvy =
          state2.velocity.y -
          state1.velocity.y

        const dvz =
          state2.velocity.z -
          state1.velocity.z

        const relativeVelocity =
          Math.sqrt(
            dvx ** 2 +
            dvy ** 2 +
            dvz ** 2
          )

        // -----------------------------
        // CHECK FOR NEW MINIMUM
        // -----------------------------

        if (
          distance <
          closestDistance
        ) {

          closestDistance =
            distance

          closestTime =
            futureTime

          closestRelativeVelocity =
            relativeVelocity
        }
      }

      // =================================
      // TIME TO CLOSEST APPROACH
      // =================================

      const timeToTCA =
        Math.max(
          0,
          (closestTime.getTime() -
            startTime.getTime()) /
          1000
        )

      // =================================
      // RISK STATUS
      // =================================

      let risk = 'LOW'

      if (closestDistance < 1) {
        risk = 'CRITICAL'
      }
      else if (closestDistance < 10) {
        risk = 'HIGH'
      }
      else if (closestDistance < 50) {
        risk = 'WARNING'
      }

      // =================================
      // UPDATE UI
      // =================================

      if (!cancelled) {

        setAnalysis({

          currentDistance,

          currentRelativeVelocity,

          closestDistance,

          closestRelativeVelocity,

          closestTime,

          timeToTCA,

          risk,

          timestamp:
            new Date()
        })
      }
    }

    calculateConjunction()

    // Recalculate every 10 seconds
    const interval =
      setInterval(
        calculateConjunction,
        10000
      )

    return () => {

      cancelled = true

      clearInterval(interval)
    }

  }, [orbitalData])

  if (!analysis) {
    return null
  }

  // =================================
  // FORMAT TIME TO TCA
  // =================================

  const totalSeconds =
    Math.round(
      analysis.timeToTCA
    )

  const minutes =
    Math.floor(
      totalSeconds / 60
    )

  const seconds =
    totalSeconds % 60

  const timeToTCA =
    `${minutes}m ${seconds
      .toString()
      .padStart(2, '0')}s`

  return (
    <div className="conjunction-panel">

      <h3>
        CONJUNCTION ANALYSIS
      </h3>

      <div className="conjunction-object">
        <span>OBJECT 1</span>

        <strong>
          {orbitalData[0].OBJECT_NAME}
        </strong>
      </div>

      <div className="conjunction-object">
        <span>OBJECT 2</span>

        <strong>
          {orbitalData[1].OBJECT_NAME}
        </strong>
      </div>

      <hr />

      <h4>
        CURRENT
      </h4>

      <div className="conjunction-row">
        <span>Separation</span>

        <strong>
          {analysis.currentDistance.toFixed(3)}
          {' '}km
        </strong>
      </div>

      <div className="conjunction-row">
        <span>Relative Velocity</span>

        <strong>
          {analysis.currentRelativeVelocity.toFixed(5)}
          {' '}km/s
        </strong>
      </div>

      <hr />

      <h4>
        CLOSEST APPROACH
      </h4>

      <div className="conjunction-row">
        <span>Miss Distance</span>

        <strong>
          {analysis.closestDistance.toFixed(3)}
          {' '}km
        </strong>
      </div>

      <div className="conjunction-row">
        <span>Time to TCA</span>

        <strong>
          {timeToTCA}
        </strong>
      </div>

      <div className="conjunction-row">
        <span>TCA</span>

        <strong>
          {analysis.closestTime
            .toLocaleTimeString()}
        </strong>
      </div>

      <div className="conjunction-row">
        <span>Relative Velocity @ TCA</span>

        <strong>
          {analysis.closestRelativeVelocity
            .toFixed(5)}
          {' '}km/s
        </strong>
      </div>

      <hr />

      <div className="conjunction-row">
        <span>Risk</span>

        <strong className={
          `risk-${analysis.risk.toLowerCase()}`
        }>
          {analysis.risk}
        </strong>
      </div>

      <div className="conjunction-updated">
        ● LIVE&nbsp;&nbsp;
        {analysis.timestamp
          .toLocaleTimeString()}
      </div>

    </div>
  )
}

function SpaceView() {
  const [selectedSatellite, setSelectedSatellite] =
    useState(null)
  const [satelliteInfo, setSatelliteInfo] =
  useState([])
  const [orbitalData, setOrbitalData] =
  useState([])

  const [selectedSatellites, setSelectedSatellites] =
  useState([
    null,
    null
  ])

  useEffect(() => {
  fetch('http://localhost:3000/api/orbital-data')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch orbital data')
      }

      return response.json()
    })
    .then((data) => {
  console.log('Orbital data received:', data)
  console.log('Number of objects:', data.length)
  console.log('Object 1:', data[0])
  console.log('Object 2:', data[1])

  if (data.length > 0) {
  setOrbitalData(data)
}
})
    .catch((error) => {
      console.error('Orbital data error:', error)
    })
}, [])
  return (
  <section className="space-view">
    <div className="satellite-search-panel">

  <SatelliteSearch
    catalog={orbitalData}
    selected={selectedSatellites[0]}
    label="SATELLITE 1"
    onSelect={(sat) => {

      setSelectedSatellites(
        (previous) => [
          sat,
          previous[1]
        ]
      )

      setSatelliteInfo([])
    }}
  />

  <SatelliteSearch
    catalog={orbitalData}
    selected={selectedSatellites[1]}
    label="SATELLITE 2"
    onSelect={(sat) => {

      setSelectedSatellites(
        (previous) => [
          previous[0],
          sat
        ]
      )

      setSatelliteInfo([])
    }}
  />

</div>

    <h2>Space Visualization</h2>

    <div className="three-container">

      <Canvas
        camera={{
          position: [0, 0, 8],
          fov: 45,
        }}
        style={{
          width: '100%',
          height: '100%',
        }}
      >

        <ambientLight intensity={1} />

        <directionalLight
          position={[10, 10, 10]}
          intensity={2}
        />

       <Earth />

{selectedSatellites[0] &&
 selectedSatellites[1] && (

  <>

    {/* SATELLITE 1 */}

    <OrbitPath
      orbitalData={
        selectedSatellites[0]
      }
    />

    <RealSatellite
      orbitalData={
        selectedSatellites[0]
      }
      objectIndex={0}
      onTelemetryUpdate={
        setSatelliteInfo
      }
    />


    {/* SATELLITE 2 */}

    <OrbitPath
      orbitalData={
        selectedSatellites[1]
      }
    />

    <RealSatellite
      orbitalData={
        selectedSatellites[1]
      }
      objectIndex={1}
      onTelemetryUpdate={
        setSatelliteInfo
      }
    />

  </>
)}
<OrbitControls />

</Canvas>

{selectedSatellites[0] &&
 selectedSatellites[1] && (

  <ConjunctionAnalysis
    orbitalData={selectedSatellites}
  />

)}

      {/* PUT THE TELEMETRY CODE HERE */}

      <div className="telemetry-container">

  {satelliteInfo.map((info, index) => {

    if (!info) {
      return null
    }

    return (
      <div
        className="satellite-telemetry"
        key={info.noradId || index}
      >

        <h3>
          🛰 {info.name || 'Unknown'}
        </h3>

        <div className="telemetry-row">
          <span>NORAD ID</span>
          <strong>
            {info.noradId || 'Unknown'}
          </strong>
        </div>

        <hr />

        <div className="telemetry-row">
          <span>Latitude</span>
          <strong>
            {info.latitude.toFixed(4)}°
          </strong>
        </div>

        <div className="telemetry-row">
          <span>Longitude</span>
          <strong>
            {info.longitude.toFixed(4)}°
          </strong>
        </div>

        <div className="telemetry-row">
          <span>Altitude</span>
          <strong>
            {info.altitude.toFixed(2)} km
          </strong>
        </div>

        <hr />

        <div className="telemetry-row">
          <span>Velocity</span>
          <strong>
            {info.velocity.toFixed(3)} km/s
          </strong>
        </div>

        <hr />

        <div className="telemetry-row">
          <span>ECI X</span>
          <strong>
            {info.positionX.toFixed(2)} km
          </strong>
        </div>

        <div className="telemetry-row">
          <span>ECI Y</span>
          <strong>
            {info.positionY.toFixed(2)} km
          </strong>
        </div>

        <div className="telemetry-row">
          <span>ECI Z</span>
          <strong>
            {info.positionZ.toFixed(2)} km
          </strong>
        </div>

        <div className="telemetry-updated">
          ● LIVE&nbsp;&nbsp;
          {info.timestamp.toLocaleTimeString()}
        </div>

      </div>
    )
  })}

</div>
    </div>

  </section>
)}

export default SpaceView