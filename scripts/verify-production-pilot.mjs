const baseUrl = (process.env.PILOT_BASE_URL || "https://medlum-mvp.onrender.com").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: { "User-Agent": "MedLum-Pilot-Verification/1.0", ...(options.headers || {}) },
  });
  return response;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request("/api/health");
assert(health.status === 200, `Health endpoint returned ${health.status}`);
const healthBody = await health.json();
assert(healthBody.status === "ok", "Health status is not ok");
assert(healthBody.service === "medlum", "Health service identifier mismatch");
assert(typeof healthBody.timestamp === "string", "Health timestamp missing");

const login = await request("/login");
assert([200, 301, 302, 307, 308].includes(login.status), `Login route returned ${login.status}`);

const patients = await request("/api/patients");
assert(patients.status === 401, `Unauthenticated patient API expected 401, got ${patients.status}`);

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "cross-origin-resource-policy": "same-origin",
};
for (const [name, expected] of Object.entries(securityHeaders)) {
  assert(login.headers.get(name) === expected, `Missing or incorrect ${name}`);
}

const hsts = login.headers.get("strict-transport-security");
assert(hsts && hsts.includes("max-age="), "Production HSTS header missing");

console.log(`Phase 16 production pilot smoke verification passed for ${baseUrl}.`);
console.log("Validated: health, login reachability, unauthenticated patient API protection, and production security headers.");
