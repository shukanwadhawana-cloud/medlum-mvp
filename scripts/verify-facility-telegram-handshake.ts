import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
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
assert.match(ownerRoute, /repair-webhook/, "Master Owner can repair and diagnose the webhook");
assert.match(ownerRoute, /isMedlumOwnerEmail/, "webhook diagnostics remain Master Owner protected");
assert.match(ownerUi, /Diagnose \/ repair webhook/, "owner UI exposes webhook diagnostics");
assert.match(ownerUi, /Send test notification/, "owner UI can verify outbound delivery");
assert.match(ownerUi, /LINK EXPIRED/, "expired connection links are visible");

console.log("Facility Telegram start-handshake regression tests PASSED");
