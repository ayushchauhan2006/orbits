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

// The active CelesTrak GP feed does not always include OBJECT_TYPE. Infer a
// debris class from standard catalogue naming conventions when it is missing.
function isDebrisObject(object) {
  if (object.OBJECT_TYPE === 'DEBRIS') return true;
  const name = String(object.OBJECT_NAME || '');
  return /\b(DEB|DEBRIS|R\/B|ROCKET BODY|FREGAT|BREEZE|PAYLOAD ADAPTER)\b/i.test(name);
}

async function fetchLiveData() {
  try {
    console.log("Attempting to fetch active catalog AND major debris catalogs...");
    
    // FETCH THE "BIG THREE" DEBRIS CLOUDS PLUS ACTIVE SATELLITES
    const [activeRes, cosmosRes, iridiumRes, fengyunRes] = await Promise.all([
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'),
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=json'), 
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=json'),
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=json')
    ]);
    
    if (!activeRes.ok || !cosmosRes.ok || !iridiumRes.ok || !fengyunRes.ok) {
        throw new Error("Celestrak API failed or rate-limited.");
    }

    const activeData = await activeRes.json();
    const cosmosData = await cosmosRes.json();
    const iridiumData = await iridiumRes.json();
    const fengyunData = await fengyunRes.json();

    // TAG THE DATA SO THE FRONTEND KNOWS WHAT IS JUNK
    activeData.forEach(d => d.OBJECT_TYPE = 'ACTIVE');
    
    // Combine all three debris clouds into one massive array
    const debrisData = [...cosmosData, ...iridiumData, ...fengyunData];
    debrisData.forEach(d => d.OBJECT_TYPE = 'DEBRIS');

    // Merge active and debris into the master catalog
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
    console.log("FALLING BACK TO LOCAL CACHE...");

    try {
// Helper function to safely load, validate, and tag offline files
      const loadJson = (filename, type) => {
        const filePath = path.join(__dirname, filename);
        if (fs.existsSync(filePath)) {
          try {
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(rawContent);
            if (Array.isArray(data)) {
              data.forEach(d => d.OBJECT_TYPE = type);
              return data;
            }
            console.warn(`Warning: ${filename} is not a valid JSON array.`);
          } catch (parseErr) {
            console.warn(`Warning: Could not parse ${filename}. It may contain rate-limit text.`);
          }
        } else {
          console.warn(`Warning: Backup file ${filename} not found.`);
        }
        return [];
      };

      // 1. Safely load all 4 local files
      const activeData = loadJson('active-real.json', 'ACTIVE');
      const cosmosData = loadJson('debris-real.json', 'DEBRIS');
      const iridiumData = loadJson('iridium-real.json', 'DEBRIS');
      const fengyunData = loadJson('fengyun-real.json', 'DEBRIS');

      // 2. Merge them together
      const combinedData = [...activeData, ...cosmosData, ...iridiumData, ...fengyunData];
      rawOrbitalData = combinedData;

      satelliteRecords = combinedData
        .map((object) => {
          try {
            return { object, satrec: satellite.json2satrec(object) }
          } catch (err) { return null }
        }).filter(Boolean);

      const totalDebris = cosmosData.length + iridiumData.length + fengyunData.length;
      console.log(`FALLBACK SUCCESS: Loaded ${activeData.length} Active and ${totalDebris} Debris offline!`);
      
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
// FLAT-MAP DENSITY HEATMAP
// ------------------------------------
app.get('/api/heatmap', (req, res) => {
  try {
    const columns = 72;
    const rows = 36;
    const activeGrid = Array(columns * rows).fill(0);
    const debrisGrid = Array(columns * rows).fill(0);
    const now = new Date();
    const gmst = satellite.gstime(now);

    for (const item of satelliteRecords) {
      try {
        const state = satellite.propagate(item.satrec, now);
        if (!state?.position) continue;
        const gd = satellite.eciToGeodetic(state.position, gmst);
        const latitude = satellite.radiansToDegrees(gd.latitude);
        const longitude = satellite.radiansToDegrees(gd.longitude);
        const col = Math.min(columns - 1, Math.max(0, Math.floor((longitude + 180) / 360 * columns)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor((90 - latitude) / 180 * rows)));
        const bucket = item.object.OBJECT_TYPE === 'DEBRIS' ? debrisGrid : activeGrid;
        bucket[row * columns + col] += 1;
      } catch (_) {}
    }

    res.json({ columns, rows, satellite: activeGrid, debris: debrisGrid, timestamp: now.toISOString() });
  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({ error: 'Failed to calculate heatmap' });
  }
});
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
          epoch: item.object.EPOCH,
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
                type1: sat1.type,
                epoch1: sat1.epoch,
                object2: sat2.name,
                norad2: sat2.id,
                type2: sat2.type,
                epoch2: sat2.epoch,
                missDistanceKm: distanceKm,
                relativeVelocityKmS: relativeVelocity,
                riskLevel: distanceKm < 10 ? 'CRITICAL' : 'HIGH'
              });
            }
          }
        }
      }
    }

    // 4. Turn propagated proximity, local debris concentration and element
    // freshness into a qualitative Estimated Collision Likelihood.
    // This is deliberately not an operational probability of collision (Pc).
    const debrisNearby = new Map();
    for (const pair of highRiskPairs) {
      if (pair.missDistanceKm > 5) continue;
      const key = String(pair.type1 === 'DEBRIS' ? pair.norad2 : pair.norad1);
      debrisNearby.set(key, (debrisNearby.get(key) || 0) + 1);
    }
    const likelihoodRank = { HIGH: 4, MEDIUM: 3, LOW: 2, 'VERY LOW': 1 };
    for (const pair of highRiskPairs) {
      const localCount = debrisNearby.get(String(pair.type1 === 'DEBRIS' ? pair.norad2 : pair.norad1)) || 0;
      pair.nearbyDebrisCount = localCount;
      const activeEpoch = pair.type1 === 'DEBRIS' ? pair.epoch2 : pair.epoch1;
      pair.elementAgeDays = activeEpoch ? Math.max(0, (now - new Date(activeEpoch)) / 86400000) : null;
      if (pair.missDistanceKm < 2) pair.estimatedLikelihood = 'HIGH';
      else if (pair.missDistanceKm < 5 && localCount >= 3) pair.estimatedLikelihood = 'HIGH';
      else if (pair.missDistanceKm < 5) pair.estimatedLikelihood = 'MEDIUM';
      else if (pair.missDistanceKm < 20) pair.estimatedLikelihood = 'LOW';
      else pair.estimatedLikelihood = 'VERY LOW';
    }

    // Sort the qualitative likelihood first, then the apparent separation.
    highRiskPairs.sort((a, b) => likelihoodRank[b.estimatedLikelihood] - likelihoodRank[a.estimatedLikelihood] || a.missDistanceKm - b.missDistanceKm);
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

// ------------------------------------
// DEBRIS WATCH WITH PREDICTION
// ------------------------------------
app.use(express.json()); // Enable JSON body parsing

app.post('/api/debris-watch', (req, res) => {
  try {
    const { satelliteNoradIds } = req.body;

    if (!Array.isArray(satelliteNoradIds) || satelliteNoradIds.length === 0) {
      return res.status(400).json({ error: 'satelliteNoradIds array required' });
    }

    const now = new Date();
    const WATCH_RADIUS_KM = 50;
    const PREDICTION_HOURS = 2;
    const results = [];

    // Helper function for 3D distance
    const distance3D = (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    for (const noradId of satelliteNoradIds) {
      // Find the satellite record
      const satRecord = satelliteRecords.find(r => r.object.NORAD_CAT_ID === noradId);

      if (!satRecord) {
        results.push({
          satelliteNorad: noradId,
          error: 'Satellite not found',
          nearestDebris: null,
          closestApproach: null,
          insideRange: false,
          predictedThreat: false
        });
        continue;
      }

      // Propagate satellite at current time
      const satState = satellite.propagate(satRecord.satrec, now);

      if (!satState?.position) {
        results.push({
          satelliteNorad: noradId,
          error: 'Failed to propagate satellite',
          nearestDebris: null,
          closestApproach: null,
          insideRange: false,
          predictedThreat: false
        });
        continue;
      }

      let nearestNow = null;
      let closestApproach = null;

      // Check all debris
      for (const item of satelliteRecords) {
        if (item.object.OBJECT_TYPE !== 'DEBRIS') continue;

        try {
          // Current separation
          const debrisState = satellite.propagate(item.satrec, now);
          if (!debrisState?.position) continue;

          const currentDist = distance3D(satState.position, debrisState.position);

          // Track nearest debris RIGHT NOW
          if (!nearestNow || currentDist < nearestNow.distance) {
            nearestNow = {
              name: item.object.OBJECT_NAME,
              norad: item.object.NORAD_CAT_ID,
              distance: currentDist,
              when: 'now'
            };
          }

          // PREDICTIVE: Sample the next 2 hours in 5-minute intervals
          // Only predict for debris that's somewhat close (within 200km)
          if (currentDist < 200) {
            for (let minutes = 0; minutes <= PREDICTION_HOURS * 60; minutes += 5) {
              const futureTime = new Date(now.getTime() + minutes * 60000);
              const futureSat = satellite.propagate(satRecord.satrec, futureTime);
              const futureDeb = satellite.propagate(item.satrec, futureTime);

              if (!futureSat?.position || !futureDeb?.position) continue;

              const futureDist = distance3D(futureSat.position, futureDeb.position);

              if (!closestApproach || futureDist < closestApproach.distance) {
                closestApproach = {
                  name: item.object.OBJECT_NAME,
                  norad: item.object.NORAD_CAT_ID,
                  distance: futureDist,
                  when: minutes === 0 ? 'now' : `${minutes} min`,
                  timestamp: futureTime.toISOString()
                };
              }
            }
          }
        } catch (error) {
          // Skip individual bad debris objects
        }
      }

      results.push({
        satelliteNorad: noradId,
        nearestDebris: nearestNow,
        closestApproach: closestApproach,
        insideRange: nearestNow && nearestNow.distance <= WATCH_RADIUS_KM,
        predictedThreat: closestApproach && closestApproach.distance <= WATCH_RADIUS_KM
      });
    }

    res.json({
      results,
      timestamp: now.toISOString(),
      debrisChecked: satelliteRecords.filter(r => r.object.OBJECT_TYPE === 'DEBRIS').length
    });

  } catch (error) {
    console.error('Debris watch error:', error);
    res.status(500).json({ error: 'Failed to process debris watch', message: error.message });
  }
});

app.listen(PORT, () => {

  console.log(
    `Backend running at http://localhost:${PORT}`
  )

})
