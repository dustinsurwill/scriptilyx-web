import { Link } from 'react-router-dom'
import { gameList } from '../games/registry'

/** "Pick a game" entry point. Each card links straight to `/:gameId` —
 * the editor shell itself has no notion of "which game" until it reads
 * that route param, so this is the only place that lists every game. */
export function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 16px',
      }}
    >
      <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>WireRig</h1>
      <p style={{ opacity: 0.75, margin: '0 0 32px', textAlign: 'center', maxWidth: 480 }}>
        A node-graph visual editor for building in-game automation scripts. Pick a game to start wiring.
      </p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', width: '100%', maxWidth: 720 }}>
        {gameList.map((game) => (
          <Link
            key={game.id}
            to={`/${game.id}`}
            style={{
              display: 'block',
              padding: 20,
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: 8,
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{game.label}</div>
            <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>{game.tagline}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
