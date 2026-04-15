// Mock AI story generator. Later you can hook this to a real AI service.
import { VITE_OPENAI_KEY } from './_env'

const STORY_PROXY = import.meta.env.VITE_STORY_PROXY_URL || ''

export async function generateStorySnippet(context: { playerName: string; enemyName: string; turn: number; event: string; location?: string; }) {
  const { playerName, enemyName, turn, event, location = 'Dearborn, MI' } = context

  // Prefer a local dev server proxy if configured.
  if (STORY_PROXY) {
    try {
      const res = await fetch(`${STORY_PROXY.replace(/\/$/, '')}/api/story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, enemyName, turn, event, location })
      })
      if (res.ok) {
        const json = await res.json()
        const text = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || json.choices?.[0]?.text
        if (text) return text.trim()
      }
    } catch (err) {
      // ignore and fallback
    }
  }

  // If a Vite env key is present, attempt a direct call to OpenAI's Chat Completions API.
  // Note: embedding API keys in frontend builds is convenient for local dev but not secure for production.
  if (VITE_OPENAI_KEY) {
    try {
      const prompt = `Write one short (1-2 sentence) evocative story snippet about ${playerName} from ${location} and ${enemyName} that references the event: ${event}. Keep it grounded, local, and in a human tone.`
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${VITE_OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 120
        })
      })

      if (res.ok) {
        const json = await res.json()
        const text = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || json.choices?.[0]?.text
        if (text) return text.trim()
      }
      // fall through to mock if AI call fails
    } catch (err) {
      // ignore and fallback to local generator
    }
  }

  // Local/mock fallback (deterministic-ish for debugging)
  const snippets = [
    `${playerName} remembers a childhood summer in ${location} while ${enemyName} lunges forward. ${event}`,
    `A memory flashes: ${playerName} and friends on Telegraph Road — then ${enemyName} appears. ${event}`,
    `${enemyName} snarls; ${playerName} feels the weight of a long, ordinary life in ${location}. ${event}`,
    `${playerName} mutters a proverb from back home in ${location} as the battle continues. ${event}`
  ]

  const idx = Math.abs(hashString(playerName + enemyName + turn + event)) % snippets.length
  return Promise.resolve(snippets[idx])
}

function hashString(s: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return h >>> 0
}
