import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

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

const readMaterialDbFromFile = async (): Promise<
  Record<string, unknown>[]
> => {
  const dbPath = path.join(process.cwd(), "data", "material-database.json");
  const raw = await readFile(dbPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>[];
};

/**
 * Get material database with Redis caching when configured.
 * Falls back to in-memory cache, then file read when Redis is not available.
 */
export const getMaterialDatabase = async (): Promise<
  Record<string, unknown>[]
> => {
  const redis = getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(MATERIAL_DB_CACHE_KEY);
      if (cached) {
        console.log("[materialDbCache] Redis HIT — using cached material DB from Redis");
        if (Array.isArray(cached)) {
          return cached as Record<string, unknown>[];
        }
        if (typeof cached === "string") {
          return JSON.parse(cached) as Record<string, unknown>[];
        }
      }
    } catch (err) {
      console.warn("[materialDbCache] Redis get failed, falling back to file:", err);
    }

    console.log("[materialDbCache] Redis MISS — loading from file and caching to Redis");
    const data = await readMaterialDbFromFile();
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
  if (
    memoryCache &&
    now - memoryCache.cachedAt < MEMORY_CACHE_TTL_MS
  ) {
    console.log("[materialDbCache] In-memory HIT — using cached material DB from memory");
    return memoryCache.data;
  }

  console.log("[materialDbCache] In-memory MISS — loading from file");
  const data = await readMaterialDbFromFile();
  memoryCache = { data, cachedAt: now };
  return data;
};
