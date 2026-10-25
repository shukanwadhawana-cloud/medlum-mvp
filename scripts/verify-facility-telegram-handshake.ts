import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  facilityTelegramWebhookUrl,
  parseFacilityTelegramStartCommand,
  validateFacilityTelegramStartPayload,
} from "../src/lib/facility-telegram";

const now = 1_800_000_000_000;
const code = "synthetic-one-time-telegram-code";
const hash = createHash("sha256").update(code).digest("hex");
const expiry = new Date(now + 30 * 60 * 1000);

assert.deepEqual(parseFacilityTelegramStartCommand("/start"), { isStart: true, payload: "" });
assert.deepEqual(parseFacilityTelegramStartCommand(`/start ${code}`), { isStart: true, payload: code });
assert.deepEqual(
  parseFacilityTelegramStartCommand(`/start@MedlumHealthSanskriti_bot ${code}`),
  { isStart: true, payload: code },
  "Telegram may include @BotName in a start command",
);
assert.deepEqual(parseFacilityTelegramStartCommand("/help"), { isStart: false, payload: "" });

assert.equal(validateFacilityTelegramStartPayload(`/start ${code}`, hash, expiry, now).valid, true);
assert.equal(validateFacilityTelegramStartPayload(`/start@MedlumHealthSanskriti_bot ${code}`, hash, expiry, now).valid, true);
assert.equal(validateFacilityTelegramStartPayload("/start", hash, expiry, now).reason, "missing_payload");
assert.equal(validateFacilityTelegramStartPayload(`/start ${code}`, null, expiry, now).reason, "missing_pending_code");
assert.equal(validateFacilityTelegramStartPayload(`/start ${code}`, hash, new Date(now), now).reason, "expired");
assert.equal(validateFacilityTelegramStartPayload("/start wrong-code", hash, expiry, now).reason, "code_mismatch");
assert.equal(validateFacilityTelegramStartPayload("/help", hash, expiry, now).reason, "not_start");

// Production must use the canonical domain if deployment URL env vars are absent.
const savedMedlumAppUrl = process.env.MEDLUM_APP_URL;
const savedPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const savedVercelEnv = process.env.VERCEL_ENV;
try {
  delete process.env.MEDLUM_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  process.env.VERCEL_ENV = "production";
  assert.equal(
    facilityTelegramWebhookUrl("clinic-test"),
    "https://medlumhealth.com/api/telegram/facility/clinic-test",
  );
} finally {
  if (savedMedlumAppUrl === undefined) delete process.env.MEDLUM_APP_URL;
  else process.env.MEDLUM_APP_URL = savedMedlumAppUrl;
  if (savedPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedPublicAppUrl;
  if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedVercelEnv;
}

const lib = readFileSync("src/lib/facility-telegram.ts", "utf8");
const webhook = readFileSync("src/app/api/telegram/facility/[clinicId]/route.ts", "utf8");
const ownerRoute = readFileSync("src/app/api/owner/facilities/[clinicId]/telegram/connect/route.ts", "utf8");
const ownerUi = readFileSync("src/app/owner/hospitals/page.tsx", "utf8");

assert.match(lib, /30 \* 60 \* 1000/, "one-time connection link stays valid for 30 minutes");
assert.match(lib, /getWebhookInfo/, "connection diagnostics read Telegram webhook state");
assert.match(lib, /current\.url !== expectedUrl/, "webhook URL is verified after setWebhook");
assert.match(webhook, /x-telegram-bot-api-secret-token/, "webhook validates Telegram's secret header");
assert.match(webhook, /could not reply to rejected start command/, "failed /start replies are logged");
assert.match(webhook, /handshake accepted/, "successful connection handshake is logged without chat IDs");
assert.match(webhook, /chatType !== "private"/, "facility Telegram linking rejects group and non-private chats");
assert.match(ownerRoute, /repair-webhook/, "Master Owner can repair and diagnose the webhook");
assert.match(ownerRoute, /isMedlumOwnerEmail/, "webhook diagnostics remain Master Owner protected");
assert.match(ownerUi, /Diagnose \/ repair webhook/, "owner UI exposes webhook diagnostics");
assert.match(ownerUi, /Send test notification/, "owner UI can verify outbound delivery");
assert.match(ownerUi, /LINK EXPIRED/, "expired connection links are visible");

// Replay of the same payload after the pending hash is cleared (post-bind) must fail closed.
assert.equal(
  validateFacilityTelegramStartPayload(`/start ${code}`, null, expiry, now).reason,
  "missing_pending_code",
  "reused start after code clear is rejected",
);

// Facility mismatch is enforced by path clinicId + pending hash scoped to that row (static contract).
assert.match(webhook, /updateMany/, "handshake uses atomic updateMany claim");
assert.match(webhook, /handshake claim lost/, "duplicate concurrent claims are logged without binding twice");
assert.match(webhook, /connectionCodeHash: integration\.connectionCodeHash/, "claim is scoped to the pending hash");
assert.match(webhook, /status: "PENDING"/, "claim requires PENDING status");

// Webhook secret must be required and compared in constant application path (presence checked).
assert.match(webhook, /if \(!expected \|\| supplied !== expected\)/, "missing or mismatched secret returns 401");

console.log("Facility Telegram start-handshake regression tests PASSED");
