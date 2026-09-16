import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// An isolated, disposable PostgreSQL cluster. Never reads production credentials.
const [command, ...args] = process.argv.slice(2);
if (!command || !["vitest", "playwright"].includes(command)) {
  throw new Error("Use this test helper with vitest or playwright.");
}
for (const binary of ["initdb", "pg_ctl"]) {
  const check = spawnSync(binary, ["--version"], { stdio: "ignore" });
  if (check.status !== 0) throw new Error(`${binary} is required. Install PostgreSQL and add its bin directory to PATH. Run as a non-root user.`);
}

const directory = await mkdtemp(join(tmpdir(), "ghostkey-test-"));
const dataDirectory = join(directory, "data");
const listener = createServer();
await new Promise((resolveListen, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolveListen); });
const address = listener.address();
if (!address || typeof address === "string") throw new Error("No test database port is available.");
const port = address.port;
await new Promise((resolveClose) => listener.close(resolveClose));

function run(binary, arguments_) {
  const result = spawnSync(binary, arguments_, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.stdout}`);
}

let started = false;
let child;
let shuttingDown = false;
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (started) spawnSync("pg_ctl", ["-D", dataDirectory, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
  await rm(directory, { recursive: true, force: true });
}

try {
  run("initdb", ["-D", dataDirectory, "-A", "trust", "--no-locale", "-E", "UTF8", "-U", "ghostkey_test"]);
  run("pg_ctl", ["-D", dataDirectory, "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${directory} -c fsync=off`, "-w", "start"]);
  started = true;
  // Use the fresh cluster's default database; the role is an unmistakable test role.
  const databaseUrl = `postgresql://ghostkey_test@127.0.0.1:${port}/postgres`;
  child = spawn(resolve("node_modules/.bin", command), args, {
    stdio: "inherit",
    env: { ...process.env, GHOSTKEY_TEST_DATABASE_URL: databaseUrl },
  });
  const onSignal = (signal) => { child?.kill(signal); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await cleanup();
}

