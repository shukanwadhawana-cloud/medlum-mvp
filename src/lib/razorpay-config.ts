import { readFile } from "node:fs/promises";

export type RazorpayCredentialSource = "environment" | "secret-file" | "missing";

async function readSecretFile(name: string): Promise<string | null> {
  try {
    const value = await readFile(`/etc/secrets/${name}`, "utf8");
    const trimmed = value.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export async function getRazorpayCredential(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET") {
  const environmentValue = process.env[name]?.trim();
  if (environmentValue) return { value: environmentValue, source: "environment" as const };

  const secretFileValue = await readSecretFile(name);
  if (secretFileValue) return { value: secretFileValue, source: "secret-file" as const };

  return { value: null, source: "missing" as const };
}

export async function getRazorpayConfigStatus() {
  const [keyId, keySecret, webhookSecret] = await Promise.all([
    getRazorpayCredential("RAZORPAY_KEY_ID"),
    getRazorpayCredential("RAZORPAY_KEY_SECRET"),
    getRazorpayCredential("RAZORPAY_WEBHOOK_SECRET"),
  ]);

  return {
    keyId: { configured: Boolean(keyId.value), source: keyId.source },
    keySecret: { configured: Boolean(keySecret.value), source: keySecret.source },
    webhookSecret: { configured: Boolean(webhookSecret.value), source: webhookSecret.source },
  };
}
