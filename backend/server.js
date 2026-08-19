const express = require('express')
const cors = require('cors')
const satellite = require('satellite.js')
const fs = require('fs')

const app = express()
const PORT = 3000

app.use(cors())

// ------------------------------------
// LOAD REAL LOCAL SATELLITE DATA
// ------------------------------------

const DATA_FILE = './active-real.json'

// ------------------------------------
// GET SATELLITES
// ------------------------------------

app.get('/api/satellites', (req, res) => {
  try {
    console.log('Loading real satellite data...')

    const rawData = fs.readFileSync(DATA_FILE, 'utf8')
    const data = JSON.parse(rawData)

    console.log('TOTAL REAL OBJECTS:', data.length)

    const now = new Date()
    const gmst = satellite.gstime(now)

    const satellites = []

    // Process all real objects
    for (const object of data) {
      try {
        const satrec = satellite.json2satrec(object)

        const state = satellite.propagate(
          satrec,
          now
        )

        if (
          !state ||
          !state.position ||
          typeof state.position.x !== 'number'
        ) {
          continue
        }

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

        satellites.push({
          id: String(object.NORAD_CAT_ID),

          name: object.OBJECT_NAME,

          longitude,

          latitude,

          altitude,

          noradId: object.NORAD_CAT_ID,

          epoch: object.EPOCH,
        })

      } catch (error) {
        // Ignore individual bad objects
      }
    }

    console.log(
      'SUCCESSFULLY PROCESSED:',
      satellites.length
    )

    res.json(satellites)

  } catch (error) {

    console.error(
      'Satellite data error:',
      error
    )

    res.status(500).json({
      error: 'Failed to process local satellite data',
      message: error.message,
    })
  }
})

app.listen(PORT, () => {
  console.log(
    `Backend running at http://localhost:${PORT}`
  )
})