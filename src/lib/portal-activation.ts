import crypto from "node:crypto";
import { resolveSessionSecretBytes } from "@/lib/session-secret";

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function createPortalActivationToken(payload: { patientId: string; clinicId: string; expiresAt: number }) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", resolveSessionSecretBytes()).update(body).digest("base64url");
  return body + "." + sig;
}

export function verifyPortalActivationToken(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", resolveSessionSecretBytes()).update(body).digest();
  const supplied = Buffer.from(sig, "base64url");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      patientId?: string; clinicId?: string; expiresAt?: number;
    };
    if (!payload.patientId || !payload.clinicId || !payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload as { patientId: string; clinicId: string; expiresAt: number };
  } catch {
    return null;
  }
}
