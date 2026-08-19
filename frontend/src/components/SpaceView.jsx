import { useEffect, useRef, useState } from 'react'
import {
  Ion,
  Viewer,
  Terrain,
  ImageryLayer,
  Cartesian3,
  Cartesian2,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  HeadingPitchRange,
  CustomDataSource,
} from 'cesium'

import 'cesium/Build/Cesium/Widgets/widgets.css'

function SpaceView() {
  const containerRef = useRef(null)

  // --------------------------------
  // SELECTED SATELLITE INFORMATION
  // --------------------------------

  const [selectedSatellite, setSelectedSatellite] =
    useState(null)

  useEffect(() => {
    if (!containerRef.current) return

    Ion.defaultAccessToken =
      import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN

    let viewer
    let clickHandler
    let selectedEntity = null
    let isActive = true
    let satelliteDataSource

    const loadSatellites = async () => {
      try {
        // --------------------------------
        // CREATE CESIUM VIEWER
        // --------------------------------

        viewer = new Viewer(containerRef.current, {
          baseLayer: ImageryLayer.fromWorldImagery(),
          terrain: Terrain.fromWorldTerrain(),

          baseLayerPicker: false,
          animation: false,
          timeline: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
        })

        viewer.scene.globe.enableLighting = true

        // --------------------------------
        // CREATE SATELLITE DATA SOURCE
        // --------------------------------

        satelliteDataSource =
          new CustomDataSource('satellites')

        viewer.dataSources.add(
          satelliteDataSource
        )

        // --------------------------------
        // ENABLE CLUSTERING
        // --------------------------------

        satelliteDataSource.clustering.enabled =
          true

        satelliteDataSource.clustering.pixelRange =
          50

        satelliteDataSource.clustering.minimumClusterSize =
          4

        // --------------------------------
        // FETCH REAL SATELLITE DATA
        // --------------------------------

        console.log(
          'Fetching real satellite data...'
        )

        const response = await fetch(
          'http://localhost:3000/api/satellites'
        )

        if (!response.ok) {
          throw new Error(
            'Failed to fetch satellite data'
          )
        }

        const satellites = await response.json()

        if (!isActive) {
          return
        }

        console.log(
          'REAL SATELLITE RESPONSE:',
          satellites
        )

        console.log(
          'NUMBER OF SATELLITES:',
          satellites.length
        )

        // --------------------------------
        // ADD SATELLITES
        // --------------------------------

        satellites.forEach((satellite) => {
          const longitude =
            Number(satellite.longitude)

          const latitude =
            Number(satellite.latitude)

          const altitude =
            Number(satellite.altitude)

          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(altitude)
          ) {
            return
          }

          satelliteDataSource.entities.add({
            id: String(satellite.id),

            name: satellite.name,

            // Store our API information
            // directly on the entity
            satelliteInfo: {
              name: satellite.name,
              noradId: satellite.noradId,
              latitude,
              longitude,
              altitude,
              epoch: satellite.epoch,
            },

            position: Cartesian3.fromDegrees(
              longitude,
              latitude,
              altitude
            ),

            // --------------------------------
            // SATELLITE MARKER
            // --------------------------------

            point: {
              pixelSize: 8,

              color: Color.CYAN,

              outlineColor: Color.WHITE,

              outlineWidth: 2,
            },

            // --------------------------------
            // HIDDEN LABEL
            // --------------------------------

            label: {
              text: satellite.name,

              font: '15px sans-serif',

              fillColor: Color.WHITE,

              showBackground: true,

              backgroundColor:
                Color.BLACK.withAlpha(0.8),

              pixelOffset:
                new Cartesian2(0, -25),

              show: false,
            },
          })
        })

        console.log(
          'CESIUM SATELLITES:',
          satelliteDataSource.entities.values.length
        )

        // --------------------------------
        // GLOBAL STARTING VIEW
        // --------------------------------

        if (
          !isActive ||
          viewer.isDestroyed()
        ) {
          return
        }

        viewer.camera.setView({
          destination:
            Cartesian3.fromDegrees(
              0,
              20,
              16000000
            ),
        })

        // --------------------------------
        // CLICK HANDLER
        // --------------------------------

        if (
          !isActive ||
          viewer.isDestroyed()
        ) {
          return
        }

        clickHandler =
          new ScreenSpaceEventHandler(
            viewer.scene.canvas
          )

clickHandler.setInputAction(
  (click) => {
    if (
      !isActive ||
      viewer.isDestroyed()
    ) {
      return
    }

    const pickedObject =
      viewer.scene.pick(click.position)

    if (
      !pickedObject ||
      !pickedObject.id
    ) {
      return
    }

    // --------------------------------
    // CHECK FOR CLUSTER
    // --------------------------------

    if (
      pickedObject.id.billboard &&
      pickedObject.id.position
    ) {
      const clusterPosition =
        pickedObject.id.position

      console.log(
        'CLUSTER CLICKED'
      )

      // Zoom into the cluster
      viewer.camera.flyTo({
        destination: clusterPosition,

        duration: 1.5,

        offset:
          new HeadingPitchRange(
            0,
            -Math.PI / 3,
            4000000
          ),
      })

      // Do not open satellite panel
      return
    }

    // --------------------------------
    // INDIVIDUAL SATELLITE
    // --------------------------------

    const entity =
      pickedObject.id

    if (!entity.position) {
      return
    }

    // --------------------------------
    // HIDE PREVIOUS LABEL
    // --------------------------------

    if (
      selectedEntity &&
      selectedEntity.label
    ) {
      selectedEntity.label.show = false
    }

    // --------------------------------
    // SELECT SATELLITE
    // --------------------------------

    selectedEntity = entity

    if (
      selectedEntity.label
    ) {
      selectedEntity.label.show = true
    }

    viewer.selectedEntity =
      selectedEntity

    // --------------------------------
    // INFORMATION PANEL
    // --------------------------------

    const info =
      selectedEntity.satelliteInfo

    if (info) {
      setSelectedSatellite({
        name: info.name,

        noradId: info.noradId,

        latitude: info.latitude,

        longitude: info.longitude,

        altitude: info.altitude,

        epoch: info.epoch,
      })
    }

    // --------------------------------
    // CURRENT POSITION
    // --------------------------------

    const position =
      selectedEntity.position.getValue(
        viewer.clock.currentTime
      )

    if (!position) {
      return
    }

    // --------------------------------
    // ZOOM TO SATELLITE
    // --------------------------------

    viewer.camera.flyTo({
      destination: position,

      duration: 2,

      offset:
        new HeadingPitchRange(
          0,
          -Math.PI / 6,
          1000000
        ),
    })

    console.log(
      'SELECTED SATELLITE:',
      selectedEntity.name
    )
  },
  ScreenSpaceEventType.LEFT_CLICK
)

        console.log(
          'Cesium + real satellite visualization working'
        )

      } catch (error) {
        console.error(
          'Satellite loading error:',
          error
        )
      }
    }

    loadSatellites()

    // --------------------------------
    // CLEANUP
    // --------------------------------

    return () => {
      isActive = false

      if (clickHandler) {
        clickHandler.destroy()
      }

      if (
        viewer &&
        !viewer.isDestroyed()
      ) {
        viewer.destroy()
      }
    }
  }, [])

  return (
    <section className="space-view">

      <h2>Space Visualization</h2>

      <div
        ref={containerRef}
        className="cesium-container"
      />

      {/* --------------------------------
          SATELLITE INFORMATION PANEL
          -------------------------------- */}

      {selectedSatellite && (
        <div
          className="satellite-info-panel"
          style={{
            position: 'absolute',
            top: '80px',
            right: '20px',
            width: '280px',
            padding: '20px',
            background: 'rgba(10, 15, 25, 0.92)',
            color: 'white',
            borderRadius: '12px',
            zIndex: 1000,
            boxShadow:
              '0 10px 30px rgba(0,0,0,0.4)',
          }}
        >

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '15px',
            }}
          >

            <h3
              style={{
                margin: 0,
                fontSize: '18px',
              }}
            >
              Satellite
            </h3>

            <button
              onClick={() => {
                setSelectedSatellite(null)

                if (
                  selectedEntity &&
                  selectedEntity.label
                ) {
                  selectedEntity.label.show =
                    false
                }

                if (viewer) {
                  viewer.selectedEntity =
                    undefined
                }

                selectedEntity = null
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
              }}
            >
              ×
            </button>

          </div>

          <div
            style={{
              marginBottom: '15px',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            {selectedSatellite.name}
          </div>

          <div>
            <strong>NORAD ID:</strong>{' '}
            {selectedSatellite.noradId}
          </div>

          <div>
            <strong>Latitude:</strong>{' '}
            {selectedSatellite.latitude.toFixed(4)}°
          </div>

          <div>
            <strong>Longitude:</strong>{' '}
            {selectedSatellite.longitude.toFixed(4)}°
          </div>

          <div>
            <strong>Altitude:</strong>{' '}
            {(
              selectedSatellite.altitude / 1000
            ).toFixed(1)} km
          </div>

          <div>
            <strong>Epoch:</strong>{' '}
            {selectedSatellite.epoch}
          </div>

        </div>
      )}

    </section>
  )
}

export default SpaceView