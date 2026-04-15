interface ImportMetaEnv {
  readonly VITE_OPENAI_KEY?: string
  readonly VITE_STORY_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
