import { Redis } from '@upstash/redis';
import { getAllMaterialRows } from '@/lib/db/materialDatabase';
import { getAllLabour } from '@/lib/db/labourDatabase';
import { getAllAssemblyBunches } from '@/lib/db/assemblyBunchDatabase';
import type { MaterialDatabaseRow, LabourDatabaseRow, AssemblyBunchBranch } from '@/types';

// Tables only change when an import script is manually run — 4 hour TTL is safe.
const CACHE_TTL_SECONDS = 14400;
const MEMORY_CACHE_TTL_MS = 14400 * 1000;

// ─── Redis client (shared, lazy) ─────────────────────────────────────────────

const getRedis = (): Redis | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
};

// ─── Generic cache helpers ────────────────────────────────────────────────────

interface CacheEnvelope<T> {
  cachedAt: number;
  data: T;
}

async function readFromRedis<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    if (typeof cached === 'object' && cached !== null && 'data' in cached) {
      return (cached as CacheEnvelope<T>).data;
    }
    if (typeof cached === 'string') {
      const parsed = JSON.parse(cached) as CacheEnvelope<T>;
      return parsed.data;
    }
    return cached as T;
  } catch (err) {
    console.warn(`[matcherDbCache] Redis get failed (${key}):`, err);
    return null;
  }
}

async function writeToRedis<T>(key: string, data: T): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, { cachedAt: Date.now(), data } satisfies CacheEnvelope<T>, {
      ex: CACHE_TTL_SECONDS,
    });
  } catch (err) {
    console.warn(`[matcherDbCache] Redis set failed (${key}):`, err);
  }
}

async function deleteFromRedis(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.warn(`[matcherDbCache] Redis del failed (${key}):`, err);
  }
}

// ─── Material Database ────────────────────────────────────────────────────────

const MAT_KEY = 'matcher:material-database:v1';

let matMemCache: CacheEnvelope<MaterialDatabaseRow[]> | null = null;

export async function getMatcherMaterials(): Promise<MaterialDatabaseRow[]> {
  // 1. in-memory
  const now = Date.now();
  if (matMemCache && now - matMemCache.cachedAt < MEMORY_CACHE_TTL_MS) {
    console.log('[matcherDbCache] material DB — memory HIT');
    return matMemCache.data;
  }

  // 2. Redis
  const cached = await readFromRedis<MaterialDatabaseRow[]>(MAT_KEY);
  if (cached) {
    console.log('[matcherDbCache] material DB — Redis HIT');
    matMemCache = { cachedAt: now, data: cached };
    return cached;
  }

  // 3. Supabase
  console.log('[matcherDbCache] material DB — fetching from Supabase');
  const { data, error } = await getAllMaterialRows();
  if (error) throw new Error(`[matcherDbCache] material_database fetch failed: ${error.message}`);
  const rows = data ?? [];
  matMemCache = { cachedAt: now, data: rows };
  void writeToRedis(MAT_KEY, rows);
  return rows;
}

export async function invalidateMatcherMaterials(): Promise<void> {
  matMemCache = null;
  await deleteFromRedis(MAT_KEY);
  console.log('[matcherDbCache] material DB cache invalidated');
}

// ─── Labour Database ──────────────────────────────────────────────────────────

const LAB_KEY = 'matcher:labour-database:v1';

let labMemCache: CacheEnvelope<LabourDatabaseRow[]> | null = null;

export async function getMatcherLabour(): Promise<LabourDatabaseRow[]> {
  const now = Date.now();
  if (labMemCache && now - labMemCache.cachedAt < MEMORY_CACHE_TTL_MS) {
    console.log('[matcherDbCache] labour DB — memory HIT');
    return labMemCache.data;
  }

  const cached = await readFromRedis<LabourDatabaseRow[]>(LAB_KEY);
  if (cached) {
    console.log('[matcherDbCache] labour DB — Redis HIT');
    labMemCache = { cachedAt: now, data: cached };
    return cached;
  }

  console.log('[matcherDbCache] labour DB — fetching from Supabase');
  const { data, error } = await getAllLabour();
  if (error) throw new Error(`[matcherDbCache] labour_database fetch failed: ${error.message}`);
  const rows = data ?? [];
  labMemCache = { cachedAt: now, data: rows };
  void writeToRedis(LAB_KEY, rows);
  return rows;
}

export async function invalidateMatcherLabour(): Promise<void> {
  labMemCache = null;
  await deleteFromRedis(LAB_KEY);
  console.log('[matcherDbCache] labour DB cache invalidated');
}

// ─── Assembly Bunch Database ──────────────────────────────────────────────────

const BUNCH_KEY = 'matcher:assembly-bunch-database:v1';

let bunchMemCache: CacheEnvelope<AssemblyBunchBranch[]> | null = null;

export async function getMatcherAssemblyBunches(): Promise<AssemblyBunchBranch[]> {
  const now = Date.now();
  if (bunchMemCache && now - bunchMemCache.cachedAt < MEMORY_CACHE_TTL_MS) {
    console.log('[matcherDbCache] assembly bunch DB — memory HIT');
    return bunchMemCache.data;
  }

  const cached = await readFromRedis<AssemblyBunchBranch[]>(BUNCH_KEY);
  if (cached) {
    console.log('[matcherDbCache] assembly bunch DB — Redis HIT');
    bunchMemCache = { cachedAt: now, data: cached };
    return cached;
  }

  console.log('[matcherDbCache] assembly bunch DB — fetching from Supabase');
  const { data, error } = await getAllAssemblyBunches();
  if (error) throw new Error(`[matcherDbCache] assembly_bunch_database fetch failed: ${error.message}`);
  const branches = data ?? [];
  bunchMemCache = { cachedAt: now, data: branches };
  void writeToRedis(BUNCH_KEY, branches);
  return branches;
}

export async function invalidateMatcherAssemblyBunches(): Promise<void> {
  bunchMemCache = null;
  await deleteFromRedis(BUNCH_KEY);
  console.log('[matcherDbCache] assembly bunch DB cache invalidated');
}
