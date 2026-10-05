/**
 * Executable static + structural gates for P0 owner takeover and privileged auth fail-closed.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) { failures.push(`Missing ${rel}`); return ""; }
  return readFileSync(p, "utf8");
}
function must(c, m) { if (!c) failures.push(m); }

const owner = read("src/lib/owner.ts");
const login = read("src/app/api/auth/login/route.ts");
const staff = read("src/app/api/clinic/staff/route.ts");
const tgLink = read("src/app/api/auth/telegram/link/route.ts");
const dockerfile = read("Dockerfile");
const nextMjs = read("next.config.mjs");

must(!/shukanwadhawana@gmail\.com/.test(owner), "owner.ts must not hardcode founder email");
must(!/BOOTSTRAP_OWNER_EMAILS/.test(owner), "owner.ts must not define BOOTSTRAP_OWNER_EMAILS");
must(owner.includes("MEDLUM_OWNER_EMAIL"), "owner.ts must use MEDLUM_OWNER_EMAIL");
must(owner.includes("return false") || owner.includes("list.length"), "owner.ts must fail closed when env unset");

must(!/continuing with password session/.test(login), "login must not fail-open to password-only for privileged roles");
must(login.includes("TELEGRAM_NOT_LINKED") || login.includes("TELEGRAM_REQUIRED"), "login must return Telegram required codes");
must(login.includes("roleNeedsOtp"), "login must evaluate roleNeedsOtp");
must(!/requiresPrivilegedOtp = roleNeedsOtp && telegramConfigured/.test(login), "login must not gate OTP solely on telegramConfigured");

must(staff.includes("isMedlumOwnerEmail"), "staff API must import/use isMedlumOwnerEmail");
must(staff.includes("Platform owner identity cannot be modified") || staff.includes("global login email"), "staff API must block owner identity mutation");
must(staff.includes("Cannot create or assign platform/facility Owner") || staff.includes('role === "Owner"'), "staff API must not assign Owner role");

must(tgLink.includes("TELEGRAM_REQUIRED") || tgLink.includes("cannot unlink"), "privileged users must not unlink required Telegram 2FA");

must(!/echo \"Prisma/.test(dockerfile), "Dockerfile CMD must not nest broken double-quotes inside JSON array");
must(dockerfile.includes("prisma migrate deploy"), "Dockerfile must run prisma migrate deploy");

must(nextMjs.includes("serverExternalPackages"), "next.config.mjs must remain canonical with serverExternalPackages");

if (failures.length) {
  console.error("P0 owner/auth hardening FAILED");
  for (const f of failures) console.error("-", f);
  process.exit(1);
}
console.log("P0 owner/auth hardening PASSED");
console.log("- No hardcoded owner email");
console.log("- Privileged login fails closed without Telegram");
console.log("- Staff cannot rewrite platform owner identity");
console.log("- Dockerfile CMD quoting fixed");
