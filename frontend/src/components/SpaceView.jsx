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

function SpaceView() {
  const [selectedSatellite, setSelectedSatellite] =
    useState(null)
  const [satelliteInfo, setSatelliteInfo] =
  useState([])
  const [orbitalData, setOrbitalData] =
  useState([])
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

  if (data.length >= 2) {
    setOrbitalData([
      data[0],
      data[1]
    ])
  }
})
    .catch((error) => {
      console.error('Orbital data error:', error)
    })
}, [])
  return (
  <section className="space-view">

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

{orbitalData.length >= 2 && (
  <>
    <OrbitPath
      orbitalData={orbitalData[0]}
    />

    <RealSatellite
      orbitalData={orbitalData[0]}
      objectIndex={0}
      onTelemetryUpdate={setSatelliteInfo}
    />


    <OrbitPath
      orbitalData={orbitalData[1]}
    />

    <RealSatellite
      orbitalData={orbitalData[1]}
      objectIndex={1}
      onTelemetryUpdate={setSatelliteInfo}
    />
  </>
)}

<OrbitControls />

      </Canvas>


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