import React from 'react'
import Game from './game/Game'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Welcome to Moe's Procedural RPG</h1>
        <p>A minimal turn-based demo with procedurally generated story snippets.</p>
      </header>
      <main style={{ width: '100%', maxWidth: 980, margin: '2rem auto' }}>
        <Game />
      </main>
    </div>
  )
}
