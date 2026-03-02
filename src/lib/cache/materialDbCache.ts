import { Redis } from "@upstash/redis";
import { getAllMaterials } from "@/lib/db/materials";

const MATERIAL_DB_CACHE_KEY = "material-database:json";
const CACHE_TTL_SECONDS = 3600; // 1 hour

// In-memory fallback when Redis is not configured (e.g. local dev)
let memoryCache: { data: Record<string, unknown>[]; cachedAt: number } | null =
  null;
const MEMORY_CACHE_TTL_MS = 3600 * 1000; // 1 hour

const getRedisClient = (): Redis | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
};

const fetchFromSupabase = async (): Promise<Record<string, unknown>[]> => {
  const { data, error } = await getAllMaterials();
  if (error) {
    throw new Error(
      `Failed to fetch material database from Supabase: ${error.message}`,
    );
  }
  return (data ?? []) as unknown as Record<string, unknown>[];
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
      await redis.del(MATERIAL_DB_CACHE_KEY);
      console.log("[materialDbCache] Cache invalidated");
    } catch (err) {
      console.warn("[materialDbCache] Redis del failed during invalidation:", err);
    }
  }
};

/**
 * Get material database with Redis caching when configured.
 * Source of truth is Supabase spec_database.
 * Falls back to in-memory cache, then direct Supabase query when Redis is unavailable.
 */
export const getMaterialDatabase = async (): Promise<
  Record<string, unknown>[]
> => {
  const redis = getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(MATERIAL_DB_CACHE_KEY);
      if (cached) {
        console.log("[materialDbCache] Redis HIT — using cached material DB");
        if (Array.isArray(cached)) {
          return cached as Record<string, unknown>[];
        }
        if (typeof cached === "string") {
          return JSON.parse(cached) as Record<string, unknown>[];
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
    try {
      await redis.set(MATERIAL_DB_CACHE_KEY, data, {
        ex: CACHE_TTL_SECONDS,
      });
    } catch (err) {
      console.warn("[materialDbCache] Redis set failed:", err);
    }
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
  memoryCache = { data, cachedAt: now };
  return data;
};
