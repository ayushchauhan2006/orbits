const express = require('express')
const cors = require('cors')
const satellite = require('satellite.js')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3000

app.use(cors())

// ------------------------------------
// FETCH LIVE DATA FROM CELESTRAK
// ------------------------------------
// ------------------------------------
// FETCH LIVE DATA WITH LOCAL FALLBACK
// ------------------------------------
// ------------------------------------
// FETCH LIVE DATA WITH LOCAL FALLBACK
// ------------------------------------
let satelliteRecords = [];
let rawOrbitalData = [];

async function fetchLiveData() {
  try {
    console.log("Attempting to fetch active catalog AND debris catalog...");
    
    // FETCH BOTH SIMULTANEOUSLY
    const [activeResponse, debrisResponse] = await Promise.all([
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'),
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=json') // Real 2009 Collision Debris
    ]);
    
    if (!activeResponse.ok || !debrisResponse.ok) {
        throw new Error("Celestrak API failed or rate-limited.");
    }

    const activeData = await activeResponse.json();
    const debrisData = await debrisResponse.json();

    // TAG THE DATA SO THE FRONTEND KNOWS WHAT IS JUNK
    activeData.forEach(d => d.OBJECT_TYPE = 'ACTIVE');
    debrisData.forEach(d => d.OBJECT_TYPE = 'DEBRIS');

    // Combine them into one massive array
    const combinedData = [...activeData, ...debrisData];
    rawOrbitalData = combinedData; 
    
    satelliteRecords = combinedData
      .map((object) => {
        try {
          return { object, satrec: satellite.json2satrec(object) }
        } catch (error) { return null }
      }).filter(Boolean);

    console.log(`SUCCESS: Loaded ${activeData.length} Active Satellites and ${debrisData.length} Debris Fragments!`);

  } catch (error) {
    console.warn(`API Error: ${error.message}`);
    // ... Keep your existing fallback logic here if you want it ...
    console.log("FALLING BACK TO LOCAL CACHE: Loading active-real.json...");

try {
      // 1. Load the Offline Active Satellites
      const ACTIVE_FILE = path.join(__dirname, 'active-real.json');
      const activeRaw = fs.readFileSync(ACTIVE_FILE, 'utf8');
      const activeData = JSON.parse(activeRaw);
      activeData.forEach(d => d.OBJECT_TYPE = 'ACTIVE'); // Tag for search

      // 2. Load the Offline Cosmos Debris
      const DEBRIS_FILE = path.join(__dirname, 'debris-real.json');
      const debrisRaw = fs.readFileSync(DEBRIS_FILE, 'utf8');
      const debrisData = JSON.parse(debrisRaw);
      debrisData.forEach(d => d.OBJECT_TYPE = 'DEBRIS'); // Tag for swarm

      // 3. Merge them together!
      const combinedData = [...activeData, ...debrisData];
      rawOrbitalData = combinedData;

      satelliteRecords = combinedData
        .map((object) => {
          try {
            return { object, satrec: satellite.json2satrec(object) }
          } catch (err) { return null }
        }).filter(Boolean);

      console.log(`FALLBACK SUCCESS: Loaded ${activeData.length} Active and ${debrisData.length} Debris offline!`);
    } catch (fallbackError) {
      console.error("FATAL ERROR: Could not load local fallback files.", fallbackError);
    }
  }
}

// Start the download as soon as the server turns on
fetchLiveData();
// ------------------------------------
// AUTOMATICALLY REFRESH EVERY 2 HOURS
// ------------------------------------
// 2 hours = 7,200,000 milliseconds
setInterval(() => {
  console.log("2-hour timer triggered: Refreshing orbital data...");
  fetchLiveData();
}, 2 * 60 * 60 * 1000);
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

app.get('/api/orbital-data', (req, res) => {
  // Just send the live data we downloaded earlier!
  res.json(rawOrbitalData);
})
// ------------------------------------
// CONJUNCTION RISK ENGINE (O(N) Spatial Grid)
// ------------------------------------
app.get('/api/conjunction-risks', (req, res) => {
  try {
    const now = new Date();
    const gmst = satellite.gstime(now);
    
    // 1. The Hash Map to hold our 3D Grid Sectors
    const spatialGrid = new Map();
    const GRID_SIZE_KM = 50; // Each sector is a 50x50x50 km box

    const activeSatellites = [];

    // 2. Propagate all satellites and assign them to a sector
    for (const item of satelliteRecords) {
      try {
        const state = satellite.propagate(item.satrec, now);

        if (!state || !state.position || typeof state.position.x !== 'number') {
          continue;
        }

        // Use ECI coordinates (in km)
        const { x, y, z } = state.position;
        const velocity = state.velocity;

        // Create a unique String key for the sector (e.g., "150_-42_12")
        const gridX = Math.floor(x / GRID_SIZE_KM);
        const gridY = Math.floor(y / GRID_SIZE_KM);
        const gridZ = Math.floor(z / GRID_SIZE_KM);
        const sectorKey = `${gridX}_${gridY}_${gridZ}`;

const satData = {
          id: item.object.NORAD_CAT_ID,
          name: item.object.OBJECT_NAME,
          type: item.object.OBJECT_TYPE, // NEW: Tell the grid if this is ACTIVE or DEBRIS
          x, y, z,
          vx: velocity.x, vy: velocity.y, vz: velocity.z
        };

        // Add satellite to its specific grid sector
        if (!spatialGrid.has(sectorKey)) {
          spatialGrid.set(sectorKey, []);
        }
        spatialGrid.get(sectorKey).push(satData);

      } catch (error) {
        // Skip bad data
      }
    }

    // 3. Screen each sector and its 26 neighbours. Restricting comparisons to
    // the same cell misses objects separated by a grid boundary.
    const highRiskPairs = [];
    const seenPairs = new Set();

    for (const [sector, occupants] of spatialGrid.entries()) {
      const [sectorX, sectorY, sectorZ] = sector.split('_').map(Number);
      const candidates = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            candidates.push(...(spatialGrid.get(`${sectorX + dx}_${sectorY + dy}_${sectorZ + dz}`) || []));
          }
        }
      }
      if (occupants.length && candidates.length > 1) {
        for (const sat1 of occupants) {
          for (const sat2 of candidates) {
            if (sat1.id === sat2.id) continue;
            const pairKey = [sat1.id, sat2.id].sort().join('_');
if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            // NEW: If they are the same type (Sat vs Sat, or Deb vs Deb), skip them immediately!
            if (sat1.type === sat2.type) continue; 

            // Calculate exact distance using 3D Pythagorean theorem
            const dx = sat2.x - sat1.x;
            const dy = sat2.y - sat1.y;
            const dz = sat2.z - sat1.z;
            const distanceKm = Math.sqrt(dx**2 + dy**2 + dz**2);

            // Calculate relative velocity
            const dvx = sat2.vx - sat1.vx;
            const dvy = sat2.vy - sat1.vy;
            const dvz = sat2.vz - sat1.vz;
            const relativeVelocity = Math.sqrt(dvx**2 + dvy**2 + dvz**2);

            // Push ALL valid Satellite-vs-Debris risks to the array
            if (distanceKm > 0.1) {
              highRiskPairs.push({
                object1: sat1.name,
                norad1: sat1.id,
                object2: sat2.name,
                norad2: sat2.id,
                missDistanceKm: distanceKm,
                relativeVelocityKmS: relativeVelocity,
                riskLevel: distanceKm < 10 ? 'CRITICAL' : 'HIGH'
              });
            }
          }
        }
      }
    }

    // 4. Sort by closest distance and return the Top 20 worst risks
    highRiskPairs.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
    const topRisks = highRiskPairs.slice(0, 20);

    res.json({
      totalObjectsProcessed: satelliteRecords.length,
      highRiskCount: topRisks.length,
      risks: topRisks,
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('Conjunction analysis error:', error);
    res.status(500).json({ error: 'Failed to run spatial analysis' });
  }
});
app.listen(PORT, () => {

  console.log(
    `Backend running at http://localhost:${PORT}`
  )

})
