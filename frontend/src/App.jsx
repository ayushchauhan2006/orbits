import { useEffect, useState } from 'react'
import SpaceView from './components/SpaceView'
import './App.css'

function App() {
  const [activePage, setActivePage] = useState('Dashboard')

  const [satellites, setSatellites] = useState([])

  const [loadingSatellites, setLoadingSatellites] =
    useState(false)

  const [searchTerm, setSearchTerm] = useState('')

  const [currentPage, setCurrentPage] = useState(1)

  const ITEMS_PER_PAGE = 50
  // --------------------------------
  // LOAD CONJUNCTION RISKS (STEP 3)
  // --------------------------------
  const [riskData, setRiskData] = useState([])
  const [loadingRisks, setLoadingRisks] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  const loadRisks = async () => {
    try {
      setLoadingRisks(true)
      // Hit the spatial partitioning algorithm endpoint!
      const response = await fetch('http://localhost:3000/api/conjunction-risks')
      
      if (!response.ok) throw new Error('Failed to fetch risks')
      
      const data = await response.json()
      setRiskData(data.risks || [])
      setLastUpdated(new Date(data.timestamp).toLocaleTimeString())
    } catch (error) {
      console.error('Risk fetch error:', error)
    } finally {
      setLoadingRisks(false)
    }
  }

  // Automatically fetch the risks whenever the Debris page opens
  useEffect(() => {
    if (activePage === 'Debris') {
      loadRisks()
    }
  }, [activePage])

  // --------------------------------
  // LOAD REAL SATELLITE DATA
  // --------------------------------

  const loadSatellites = async () => {
    try {
      setLoadingSatellites(true)

      const response = await fetch(
        'http://localhost:3000/api/satellites'
      )

      if (!response.ok) {
        throw new Error(
          'Failed to fetch satellites'
        )
      }

      const data = await response.json()

      setSatellites(data)

    } catch (error) {
      console.error(
        'Satellite list error:',
        error
      )

    } finally {
      setLoadingSatellites(false)
    }
  }

  // --------------------------------
  // LOAD WHEN SATELLITES PAGE OPENS
  // --------------------------------

  useEffect(() => {
    if (activePage === 'Satellites') {
      loadSatellites()
    }
  }, [activePage])

  // --------------------------------
  // SEARCH
  // --------------------------------

  const filteredSatellites =
    satellites.filter((satellite) => {
      const search =
        searchTerm
          .toLowerCase()
          .trim()

      if (!search) {
        return true
      }

      return (
        satellite.name
          ?.toLowerCase()
          .includes(search) ||

        String(
          satellite.noradId
        ).includes(search)
      )
    })

  // --------------------------------
  // PAGINATION
  // --------------------------------

  const totalPages = Math.ceil(
    filteredSatellites.length /
      ITEMS_PER_PAGE
  )

  const safeCurrentPage =
    Math.min(
      currentPage,
      Math.max(totalPages, 1)
    )

  const startIndex =
    (safeCurrentPage - 1) *
    ITEMS_PER_PAGE

  const visibleSatellites =
    filteredSatellites.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE
    )

  // --------------------------------
  // CHANGE SEARCH
  // --------------------------------

  const handleSearch = (value) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // --------------------------------
  // CHANGE PAGE
  // --------------------------------

  const changePage = (page) => {
    if (
      page < 1 ||
      page > totalPages
    ) {
      return
    }

    setCurrentPage(page)
  }

  return (
    <div className="app">

      {/* ========================================
          TOP NAVIGATION
          ======================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-mark">
            O
          </div>

          <div>

            <div className="brand-name">
              ORBITS
            </div>

            <div className="brand-subtitle">
              SPACE INTELLIGENCE
            </div>

          </div>

        </div>


        <nav className="navigation">

          <button
            className={`nav-item ${
              activePage === 'Dashboard'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActivePage('Dashboard')
            }
          >
            Dashboard
          </button>


          <button
            className={`nav-item ${
              activePage === 'Satellites'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActivePage('Satellites')
            }
          >
            Satellites
          </button>


          <button
            className={`nav-item ${
              activePage === 'Debris'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActivePage('Debris')
            }
          >
            Debris
          </button>


          <button
            className={`nav-item ${
              activePage === 'About'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setActivePage('About')
            }
          >
            About
          </button>

        </nav>


        <div className="status">

          <span className="status-dot" />

          SYSTEM ONLINE

        </div>

      </header>


      {/* ========================================
          MAIN CONTENT
          ======================================== */}

      <main className="main">

        {/* ========================================
            DASHBOARD
            ======================================== */}

        {activePage === 'Dashboard' && (
          <SpaceView />
        )}


        {/* ========================================
            SATELLITES
            ======================================== */}

        {activePage === 'Satellites' && (

          <section className="page">

            <div className="page-header">

              <div>

                <div className="page-kicker">
                  ORBITAL CATALOG
                </div>

                <h1>
                  Satellites
                </h1>

                <p>
                  Browse the complete real-time
                  orbital catalog.
                </p>

              </div>


              <div className="catalog-count">

                <span>
                  TOTAL OBJECTS
                </span>

                <strong>
                  {satellites.length.toLocaleString()}
                </strong>

              </div>

            </div>


            {/* SEARCH */}

            <div className="catalog-controls">

              <input
                type="text"
                value={searchTerm}
                onChange={(event) =>
                  handleSearch(
                    event.target.value
                  )
                }
                placeholder="Search by satellite name or NORAD ID..."
                className="satellite-search"
              />

              <div className="result-count">

                {filteredSatellites.length.toLocaleString()}

                {' '}

                results

              </div>

            </div>


            {/* TABLE */}

            {loadingSatellites ? (

              <div className="loading">
                Loading satellite catalog...
              </div>

            ) : (

              <>

                <div className="satellite-table-wrapper">

                  <table className="satellite-table">

                    <thead>

                      <tr>

                        <th>
                          NAME
                        </th>

                        <th>
                          NORAD ID
                        </th>

                        <th>
                          LATITUDE
                        </th>

                        <th>
                          LONGITUDE
                        </th>

                        <th>
                          ALTITUDE
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {visibleSatellites.map(
                        (satellite) => (

                          <tr
                            key={
                              satellite.id
                            }
                          >

                            <td className="satellite-name">

                              {satellite.name}

                            </td>


                            <td>

                              {satellite.noradId}

                            </td>


                            <td>

                              {Number(
                                satellite.latitude
                              ).toFixed(2)}
                              °

                            </td>


                            <td>

                              {Number(
                                satellite.longitude
                              ).toFixed(2)}
                              °

                            </td>


                            <td>

                              {(
                                Number(
                                  satellite.altitude
                                ) / 1000
                              ).toFixed(1)}

                              {' '}km

                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>


                  {visibleSatellites.length ===
                    0 && (

                    <div className="no-results">

                      No satellites found.

                    </div>

                  )}

                </div>


                {/* PAGINATION */}

                {totalPages > 1 && (

                  <div className="pagination">

                    <button
                      className="page-button"
                      disabled={
                        safeCurrentPage === 1
                      }
                      onClick={() =>
                        changePage(
                          safeCurrentPage - 1
                        )
                      }
                    >
                      ←
                    </button>


                    <span className="page-number">

                      Page{' '}

                      {safeCurrentPage}

                      {' '}of{' '}

                      {totalPages}

                    </span>


                    <button
                      className="page-button"
                      disabled={
                        safeCurrentPage ===
                        totalPages
                      }
                      onClick={() =>
                        changePage(
                          safeCurrentPage + 1
                        )
                      }
                    >
                      →
                    </button>

                  </div>

                )}

              </>

            )}

          </section>

        )}


        {/* ========================================
            DEBRIS / CONJUNCTION DASHBOARD
            ======================================== */}

        {activePage === 'Debris' && (
          <section className="page">
            <div className="page-header">
              <div>
                <div className="page-kicker">SPATIAL ANALYSIS</div>
                <h1>Top 10 Collision Risks</h1>
                <p>Live prediction of closest orbital approaches using 3D spatial partitioning.</p>
              </div>
              
              <div className="catalog-count">
                <span>LAST UPDATED</span>
                <strong>{lastUpdated || 'Loading...'}</strong>
              </div>
            </div>

            {loadingRisks ? (
              <div className="loading">Running spatial collision analysis...</div>
            ) : (
              <div className="satellite-table-wrapper">
                <table className="satellite-table">
                  <thead>
                    <tr>
                      <th>RISK LEVEL</th>
                      <th>OBJECT 1</th>
                      <th>OBJECT 2</th>
                      <th>MISS DISTANCE</th>
                      <th>REL. VELOCITY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Slicing the array to strictly show the Top 10 */}
                    {riskData.slice(0, 10).map((risk, index) => (
                      <tr key={index}>
                        <td>
                          <strong style={{
                            color: risk.riskLevel === 'CRITICAL' ? '#ff0000' : '#ffb703'
                          }}>
                            {risk.riskLevel}
                          </strong>
                        </td>
                        <td className="satellite-name">
                          {risk.object1} <br/>
                          <span style={{fontSize: '0.8em', color: '#888'}}>ID: {risk.norad1}</span>
                        </td>
                        <td className="satellite-name">
                          {risk.object2} <br/>
                          <span style={{fontSize: '0.8em', color: '#888'}}>ID: {risk.norad2}</span>
                        </td>
                        <td>
                          {risk.missDistanceKm.toFixed(2)} km
                        </td>
                        <td>
                          {risk.relativeVelocityKmS.toFixed(3)} km/s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {riskData.length === 0 && (
                  <div className="no-results">No high-risk conjunctions detected in current sectors.</div>
                )}
              </div>
            )}
          </section>
        )}


        {/* ========================================
            ABOUT
            ======================================== */}

        {activePage === 'About' && (

          <section className="page simple-page">

            <div className="page-kicker">
              ORBITS
            </div>

            <h1>
              Space Intelligence
            </h1>

            <p className="about-text">

              ORBITS is a satellite tracking and
              orbital visualization project designed
              to visualize real orbital objects using
              orbital element data and Cesium.

            </p>


            <div className="about-grid">

              <div className="feature-card">

                <h3>
                  Real Data
                </h3>

                <p>
                  Satellite orbital data is obtained
                  from the CelesTrak catalog.
                </p>

              </div>


              <div className="feature-card">

                <h3>
                  Orbital Propagation
                </h3>

                <p>
                  satellite.js calculates estimated
                  positions from orbital data.
                </p>

              </div>


              <div className="feature-card">

                <h3>
                  3D Visualization
                </h3>

                <p>
                  Cesium provides the interactive
                  Earth and orbital visualization.
                </p>

              </div>

            </div>

          </section>

        )}

      </main>


      {/* ========================================
          BOTTOM STATUS BAR
          ======================================== */}

      <footer className="statusbar">

        <div className="status-item">

          <span className="status-label">
            TRACKED OBJECTS
          </span>

          <span className="status-value">
            {satellites.length > 0
              ? satellites.length.toLocaleString()
              : '16,342'}
          </span>

        </div>


        <div className="divider" />


        <div className="status-item">

          <span className="status-label">
            ACTIVE
          </span>

          <span className="status-value active-value">
            ●
          </span>

        </div>


        <div className="divider" />


        <div className="status-item">

          <span className="status-label">
            DATA SOURCE
          </span>

          <span className="status-value">
            CATALOG
          </span>

        </div>


        <div className="status-spacer" />


        <div className="status-item">

          <span className="status-label">
            ORBITS
          </span>

          <span className="status-value">
            LIVE
          </span>

        </div>

      </footer>

    </div>
  )
}

export default App