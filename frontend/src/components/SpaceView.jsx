import { useEffect, useRef } from 'react'

import {
  Ion,
  Viewer,
  Terrain,
  ImageryLayer,
  Cartesian3,
  Cartesian2,
  Color,
} from 'cesium'

import satellites from '../satellites'

import 'cesium/Build/Cesium/Widgets/widgets.css'

function SpaceView() {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Load Cesium ion token
    Ion.defaultAccessToken =
      import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN

    // Check that the token is loaded
    console.log(
      'Cesium token loaded:',
      Boolean(import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN)
    )

    let viewer

    try {
      // Create Cesium viewer
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

      // Enable day/night lighting
      viewer.scene.globe.enableLighting = true

      // Add satellite/debris objects
      satellites.forEach((satellite) => {
        viewer.entities.add({
          id: satellite.id,

          name: satellite.name,

          position: Cartesian3.fromDegrees(
            satellite.longitude,
            satellite.latitude,
            satellite.altitude
          ),

          point: {
            pixelSize: 10,
            color: Color.CYAN,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
          },

          label: {
            text: satellite.name,
            font: '14px sans-serif',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.BLACK.withAlpha(0.7),
            pixelOffset: new Cartesian2(0, -20),
          },
        })
      })

viewer.camera.flyHome(0)

      console.log('Cesium viewer created successfully')
    } catch (error) {
      console.error('Cesium error:', error)
    }

    // Cleanup when component is removed
    return () => {
      if (viewer && !viewer.isDestroyed()) {
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
    </section>
  )
}

export default SpaceView