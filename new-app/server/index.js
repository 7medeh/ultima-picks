#!/usr/bin/env node
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 5174

app.get('/', (req, res) => res.send('Moe story proxy running'))

app.post('/api/story', async (req, res) => {
  const { playerName, enemyName, turn, event, location } = req.body || {}
  const key = process.env.OPENAI_API_KEY
  if (!key) return res.status(400).json({ error: 'OPENAI_API_KEY not set on server' })

  try {
    const prompt = `Write one short (1-2 sentence) evocative story snippet about ${playerName} from ${location || 'Dearborn, MI'} and ${enemyName} that references the event: ${event}. Keep it grounded, local, and in a human tone.`

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120
      })
    })

    const json = await r.json()
    // Mirror the client-side expectation: return the raw API response so the client can extract text
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.listen(PORT, () => console.log(`Story proxy listening on http://localhost:${PORT}`))
