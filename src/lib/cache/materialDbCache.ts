import { Redis } from "@upstash/redis";
import { getAllMaterials } from "@/lib/db/materials";
import { MaterialDefinition } from "@/types";

const MATERIAL_DB_CACHE_KEY = "material-database:json";
const MATERIAL_DB_CACHE_META_KEY = "material-database:meta";
const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_VERSION_PREFIX = "material-db";

// In-memory fallback when Redis is not configured (e.g. local dev)
interface MaterialDbCacheEnvelope {
  version: string;
  cachedAt: number;
  data: MaterialDefinition[];
}

let memoryCache: MaterialDbCacheEnvelope | null =
  null;
const MEMORY_CACHE_TTL_MS = 3600 * 1000; // 1 hour

const getRedisClient = (): Redis | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
};

const fetchFromSupabase = async (): Promise<MaterialDefinition[]> => {
  const { data, error } = await getAllMaterials();
  if (error) {
    throw new Error(
      `Failed to fetch material database from Supabase: ${error.message}`,
    );
  }
  return data ?? [];
};

const buildCacheEnvelope = (
  data: MaterialDefinition[],
  version = `${CACHE_VERSION_PREFIX}:${Date.now()}`,
): MaterialDbCacheEnvelope => ({
  version,
  cachedAt: Date.now(),
  data,
});

const setMemoryCache = (envelope: MaterialDbCacheEnvelope) => {
  memoryCache = envelope;
};

const writeCache = async (data: MaterialDefinition[]): Promise<MaterialDbCacheEnvelope> => {
  const envelope = buildCacheEnvelope(data);
  setMemoryCache(envelope);
  const redis = getRedisClient();
  if (!redis) return envelope;
  try {
    await redis.set(MATERIAL_DB_CACHE_KEY, envelope, {
      ex: CACHE_TTL_SECONDS,
    });
    await redis.set(
      MATERIAL_DB_CACHE_META_KEY,
      { version: envelope.version, cachedAt: envelope.cachedAt },
      { ex: CACHE_TTL_SECONDS },
    );
  } catch (err) {
    console.warn("[materialDbCache] Redis set failed:", err);
  }
  return envelope;
};

/**
 * Invalidate the material database cache in both Redis and in-memory.
 * Call this after any create / update / delete operation on materials.
 */
export const invalidateMaterialDbCache = async (): Promise<void> => {
  memoryCache = null;
  const redis = getRedisClient();
  if (redis) {
    try {
      await Promise.all([
        redis.del(MATERIAL_DB_CACHE_KEY),
        redis.del(MATERIAL_DB_CACHE_META_KEY),
      ]);
      console.log("[materialDbCache] Cache invalidated");
    } catch (err) {
      console.warn("[materialDbCache] Redis del failed during invalidation:", err);
    }
  }
};

/**
 * Refresh the cache from Supabase after a write so subsequent reads stay warm.
 */
export const refreshMaterialDbCache = async (): Promise<MaterialDefinition[]> => {
  const data = await fetchFromSupabase();
  await writeCache(data);
  return data;
};

/**
 * Write-through helper when the caller already has the full dataset.
 */
export const primeMaterialDbCache = async (
  data: MaterialDefinition[],
): Promise<void> => {
  await writeCache(data);
};

/**
 * Get material database with Redis caching when configured.
 * Source of truth is Supabase spec_database.
 * Falls back to in-memory cache, then direct Supabase query when Redis is unavailable.
 */
export const getMaterialDatabase = async (): Promise<MaterialDefinition[]> => {
  const redis = getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(MATERIAL_DB_CACHE_KEY);
      if (cached) {
        console.log("[materialDbCache] Redis HIT — using cached material DB");
        if (
          typeof cached === "object" &&
          cached !== null &&
          "data" in cached &&
          Array.isArray((cached as MaterialDbCacheEnvelope).data)
        ) {
          const envelope = cached as MaterialDbCacheEnvelope;
          setMemoryCache(envelope);
          return envelope.data;
        }
        if (Array.isArray(cached)) {
          const envelope = buildCacheEnvelope(cached as MaterialDefinition[]);
          setMemoryCache(envelope);
          return envelope.data;
        }
        if (typeof cached === "string") {
          const parsed = JSON.parse(cached) as
            | MaterialDbCacheEnvelope
            | MaterialDefinition[];
          if (Array.isArray(parsed)) {
            const envelope = buildCacheEnvelope(parsed);
            setMemoryCache(envelope);
            return envelope.data;
          }
          setMemoryCache(parsed);
          return parsed.data;
        }
      }
    } catch (err) {
      console.warn(
        "[materialDbCache] Redis get failed, falling back to Supabase:",
        err,
      );
    }

    console.log(
      "[materialDbCache] Redis MISS — fetching from Supabase and caching",
    );
    const data = await fetchFromSupabase();
    await writeCache(data);
    return data;
  }

  // In-memory fallback
  const now = Date.now();
  if (memoryCache && now - memoryCache.cachedAt < MEMORY_CACHE_TTL_MS) {
    console.log("[materialDbCache] In-memory HIT");
    return memoryCache.data;
  }

  console.log("[materialDbCache] In-memory MISS — fetching from Supabase");
  const data = await fetchFromSupabase();
  setMemoryCache(buildCacheEnvelope(data));
  return data;
};
