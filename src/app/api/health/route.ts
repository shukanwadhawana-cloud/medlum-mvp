export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "medlum",
    version: process.env.npm_package_version ?? "0.2.1",
    timestamp: new Date().toISOString(),
  });
}
