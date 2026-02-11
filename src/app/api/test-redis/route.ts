import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export async function GET() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return NextResponse.json({
      ok: false,
      message: "Redis not configured (missing env vars)",
    });
  }

  try {
    const redis = new Redis({ url, token });
    const testKey = "health-check:material-cache";
    const testValue = Date.now().toString();

    await redis.set(testKey, testValue, { ex: 60 });
    const fetched = await redis.get(testKey);

    if (String(fetched) === testValue) {
      return NextResponse.json({
        ok: true,
        message: "Redis is working",
      });
    }

    return NextResponse.json({
      ok: false,
      message: "Redis read/write mismatch",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({
      ok: false,
      message: `Redis error: ${message}`,
    });
  }
}