export const dynamic = "force-dynamic";

export async function GET() {
  const gitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    "";

  return Response.json({
    status: "ok",
    service: "medlum",
    version: process.env.npm_package_version ?? "0.2.1",
    gitSha: gitSha || undefined,
    timestamp: new Date().toISOString(),
  });
}
