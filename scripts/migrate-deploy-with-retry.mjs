import { spawn } from "node:child_process";

const maxAttempts = 5;
const delayMs = 15000;

function runMigrate() {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      output += chunk.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`[db:migrate:deploy] attempt ${attempt}/${maxAttempts}`);
  const result = await runMigrate();

  if (result.code === 0) {
    process.exit(0);
  }

  const lockFailure =
    result.output.includes("P1002") ||
    result.output.includes("pg_advisory_lock") ||
    result.output.includes("advisory lock");

  if (!lockFailure || attempt === maxAttempts) {
    process.exit(result.code);
  }

  console.warn(`[db:migrate:deploy] advisory-lock timeout; waiting ${delayMs / 1000}s before retry`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

process.exit(1);
