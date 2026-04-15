# new-app

Vite + React + TypeScript starter scaffold.

Quick start

1. Install dependencies

```bash
cd new-app
npm install
```

2. Run dev server

```bash
npm run dev
```

Type checking

```bash
npm run type-check
```

Build

```bash
npm run build
npm run preview
```

If you want, I can run `npm install` and start the dev server for you.

AI story generation

You can enable real AI-generated story snippets by creating a `.env` file at the project root with:

```bash
# .env
VITE_OPENAI_KEY=sk-...your-openai-key-here...
```

When `VITE_OPENAI_KEY` is present the client will attempt a direct request to OpenAI's Chat Completions API and fall back to a local deterministic generator if the request fails. For production use you should proxy requests through a server so the API key is not embedded in the frontend.

Server proxy (recommended)

Start a small server that forwards story requests to OpenAI (keeps your key secret):

1. Create a server env (or export in your shell):

```bash
# .env.server
OPENAI_API_KEY=sk-...your-openai-key-here...
```

2. Install server deps and start the proxy (from project root):

```bash
npm install express node-fetch cors
node server/index.js
```

3. Tell the client to use the proxy by setting `VITE_STORY_PROXY_URL` in `.env` (or export it):

```bash
VITE_STORY_PROXY_URL=http://localhost:5174
```

Restart the client dev server and it will prefer the server proxy for story generation.
