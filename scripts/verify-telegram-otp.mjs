import fs from "node:fs";
const otp = fs.readFileSync("src/lib/otp.ts", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const checks = [
  ["Telegram delivery", otp.includes("api.telegram.org") && otp.includes("sendMessage")],
  ["No Gmail dependency", !otp.includes("GMAIL_SMTP") && !pkg.dependencies?.nodemailer && !pkg.devDependencies?.["@types/nodemailer"]],
  ["Telegram identity", schema.includes("model TelegramIdentity") && schema.includes("telegramChatId")],
  ["Link challenge", schema.includes("model TelegramLinkChallenge") && schema.includes("tokenHash")],
  ["OTP remains hashed", otp.includes("bcrypt.hash") && otp.includes("bcrypt.compare")],
  ["Production fail-closed", otp.includes('NODE_ENV !== "production"') && otp.includes("Telegram account is not linked")],
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error("FAIL: " + name);
  console.log("PASS:", name);
}
