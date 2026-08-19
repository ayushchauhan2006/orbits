const express = require('express')
const cors = require('cors')
const satellite = require('satellite.js')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3000

app.use(cors())

// ------------------------------------
// LOAD SATELLITE DATA ONCE
// ------------------------------------

const DATA_FILE = path.join(__dirname, 'active-real.json')

let satelliteRecords = []

try {
  const rawData = fs.readFileSync(DATA_FILE, 'utf8')
  const data = JSON.parse(rawData)

  satelliteRecords = data
    .map((object) => {
      try {
        return {
          object,
          satrec: satellite.json2satrec(object),
        }
      } catch (error) {
        return null
      }
    })
    .filter(Boolean)

  console.log(
    `Loaded ${satelliteRecords.length} satellite objects`
  )

} catch (error) {
  console.error(
    'Failed to load satellite data:',
    error
  )
}

// ------------------------------------
// GET CURRENT SATELLITE POSITIONS
// ------------------------------------

app.get('/api/satellites', (req, res) => {

  try {

    // IMPORTANT:
    // This is the current time.
    // SGP4 calculates the position for THIS time.

    const now = new Date()

    const gmst = satellite.gstime(now)

    const satellites = []

    for (const item of satelliteRecords) {

      try {

        const state = satellite.propagate(
          item.satrec,
          now
        )

        if (
          !state ||
          !state.position ||
          typeof state.position.x !== 'number'
        ) {
          continue
        }

        // --------------------------------
        // ECI → GEODETIC
        // --------------------------------

        const geodetic =
          satellite.eciToGeodetic(
            state.position,
            gmst
          )

        const longitude =
          satellite.radiansToDegrees(
            geodetic.longitude
          )

        const latitude =
          satellite.radiansToDegrees(
            geodetic.latitude
          )

        const altitude =
          geodetic.height * 1000

        // --------------------------------
        // VELOCITY
        // --------------------------------

        const velocity = state.velocity

        const speed =
          Math.sqrt(
            velocity.x * velocity.x +
            velocity.y * velocity.y +
            velocity.z * velocity.z
          )

        satellites.push({

          id: String(
            item.object.NORAD_CAT_ID
          ),

          name:
            item.object.OBJECT_NAME,

          longitude,

          latitude,

          altitude,

          noradId:
            item.object.NORAD_CAT_ID,

          epoch:
            item.object.EPOCH,

          // Velocity from SGP4
          velocity: {
            x: velocity.x,
            y: velocity.y,
            z: velocity.z,
          },

          speed,

          timestamp:
            now.toISOString(),
        })

      } catch (error) {
        // Ignore individual bad objects
      }
    }

    res.json(satellites)

  } catch (error) {

    console.error(
      'Satellite propagation error:',
      error
    )

    res.status(500).json({
      error:
        'Failed to calculate satellite positions',

      message:
        error.message,
    })
  }
})

// ------------------------------------
// START SERVER
// ------------------------------------

app.listen(PORT, () => {

  console.log(
    `Backend running at http://localhost:${PORT}`
  )

})