import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CACHE_DIR = path.resolve('./data/cache');
const TTL_MINUTES = parseInt(process.env.CACHE_TTL_MINUTES ?? '30', 10);

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

export function get<T>(key: string): T | null {
  ensureCacheDir();
  const filePath = cacheFilePath(key);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entry: CacheEntry<T> = JSON.parse(raw);
    const ageMinutes = (Date.now() - entry.timestamp) / 1000 / 60;
    if (ageMinutes > TTL_MINUTES) {
      fs.unlinkSync(filePath);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function set<T>(key: string, data: T): void {
  ensureCacheDir();
  const filePath = cacheFilePath(key);
  const entry: CacheEntry<T> = { timestamp: Date.now(), data };
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(entry, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function invalidate(key: string): void {
  const filePath = cacheFilePath(key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function clearAll(): void {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(CACHE_DIR, file));
  }
}
