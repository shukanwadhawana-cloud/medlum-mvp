import { readdir, readFile } from "node:fs/promises";

export type RazorpayCredentialSource = "environment" | "secret-file" | "missing";

const SECRET_DIR = "/etc/secrets";

/**
 * Render Secret Files are mounted at /etc/secrets/<Filename>.
 * The Filename in the Render dashboard must match (case-sensitive on Linux).
 * We also try a few safe aliases so minor naming differences still work.
 */
function candidateFilenames(name: string): string[] {
  const lower = name.toLowerCase();
  return [
    name,
    lower,
    `${name}.txt`,
    `${lower}.txt`,
  ];
}

async function readSecretFileVariants(name: string): Promise<{ value: string; filename: string } | null> {
  for (const filename of candidateFilenames(name)) {
    try {
      const value = await readFile(`${SECRET_DIR}/${filename}`, "utf8");
      const trimmed = value.trim();
      if (trimmed) return { value: trimmed, filename };
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** List secret filenames present under /etc/secrets (never contents). */
export async function listSecretFilenames(): Promise<string[] | null> {
  try {
    const entries = await readdir(SECRET_DIR);
    return entries.filter((e) => !e.startsWith(".")).sort();
  } catch {
    return null;
  }
}

export async function getRazorpayCredential(
  name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET"
) {
  const environmentValue = process.env[name]?.trim();
  if (environmentValue) {
    return { value: environmentValue, source: "environment" as const, filename: null as string | null };
  }

  const fromFile = await readSecretFileVariants(name);
  if (fromFile) {
    return { value: fromFile.value, source: "secret-file" as const, filename: fromFile.filename };
  }

  return { value: null, source: "missing" as const, filename: null as string | null };
}

/** MEDLUM_APP_URL from env or Render secret file (same mount rules). */
export async function getMedlumAppUrl(): Promise<{ value: string | null; source: RazorpayCredentialSource }> {
  const fromEnv = process.env.MEDLUM_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return { value: fromEnv, source: "environment" };

  const fromFile = await readSecretFileVariants("MEDLUM_APP_URL");
  if (fromFile) return { value: fromFile.value.replace(/\/+$/, ""), source: "secret-file" };

  return { value: null, source: "missing" };
}

export async function getRazorpayConfigStatus() {
  const [keyId, keySecret, webhookSecret, appUrl, secretFiles] = await Promise.all([
    getRazorpayCredential("RAZORPAY_KEY_ID"),
    getRazorpayCredential("RAZORPAY_KEY_SECRET"),
    getRazorpayCredential("RAZORPAY_WEBHOOK_SECRET"),
    getMedlumAppUrl(),
    listSecretFilenames(),
  ]);

  return {
    keyId: {
      configured: Boolean(keyId.value),
      source: keyId.source,
      secretFilename: keyId.filename,
      keyPrefix: keyId.value ? `${keyId.value.slice(0, 8)}…` : null,
    },
    keySecret: {
      configured: Boolean(keySecret.value),
      source: keySecret.source,
      secretFilename: keySecret.filename,
    },
    webhookSecret: {
      configured: Boolean(webhookSecret.value),
      source: webhookSecret.source,
      secretFilename: webhookSecret.filename,
    },
    medlumAppUrl: {
      configured: Boolean(appUrl.value),
      source: appUrl.source,
    },
    secretFilesPresent: secretFiles,
    hint:
      !keyId.value || !keySecret.value
        ? "On Render, either set Environment Variables named RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or add Secret Files whose Filename is exactly RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (available at /etc/secrets/<Filename>). Then redeploy."
        : null,
  };
}
