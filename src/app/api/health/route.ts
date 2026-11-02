import { isDatabaseUrlValid, prisma, withDatabaseRecovery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    "";

  let database: "ok" | "invalid_configuration" | "unreachable" = "unreachable";

  if (!isDatabaseUrlValid()) {
    database = "invalid_configuration";
  } else {
    try {
      await withDatabaseRecovery(() => prisma.$queryRaw`SELECT 1`);
      database = "ok";
    } catch (error) {
      const candidate = error && typeof error === "object"
        ? (error as { code?: unknown; errorCode?: unknown })
        : {};
      console.error("[health] database probe failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: String(candidate.code ?? candidate.errorCode ?? "UNKNOWN"),
      });
    }
  }

  const ready = database === "ok";

  return Response.json(
    {
      status: ready ? "ok" : "degraded",
      service: "medlum",
      ready,
      checks: { database },
      version: process.env.npm_package_version ?? "0.2.1",
      gitSha: gitSha || undefined,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
