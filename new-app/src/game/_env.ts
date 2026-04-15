// Simple Vite env wrapper so other modules can import without referencing import.meta directly.
// Create a `.env` file at project root with VITE_OPENAI_KEY=your_key to enable AI story generation.

export const VITE_OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY || ''
