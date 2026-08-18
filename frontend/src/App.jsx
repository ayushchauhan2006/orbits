import './App.css'
import Header from './components/Header'
import StatCard from './components/StatCard'
import SpaceView from './components/SpaceView'

function App() {
  return (
    <div>
      <Header />

      <main>
        <h2>Dashboard</h2>

        <div className="stats">
          <StatCard
            title="Objects Tracked"
            value="12,543"
          />

          <StatCard
            title="Close Approaches"
            value="17"
          />

          <StatCard
            title="High Priority"
            value="3"
          />
        </div>

        <SpaceView />

        <p>Monitoring orbital objects and potential close approaches.</p>
      </main>
    </div>
  )
}

export default App