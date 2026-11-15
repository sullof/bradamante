#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CONFIG_PATH = path.join(os.homedir(), ".bradamante-config.js");

const DEFAULTS = {
  pollMs: 60 * 60 * 1000,
  timeoutMs: 8000,
  failureThreshold: 2,
  resumeGapFactor: 1.5,
  connectivityUrls: [
    "https://www.google.com/generate_204",
    "https://cloudflare.com/cdn-cgi/trace",
  ],
  alertSoundFile: "",
  alertSoundCmd: "",
};

const cli = parseArgs(process.argv.slice(2));

if (cli.help) {
  printHelp();
  process.exit(0);
}

if (!fs.existsSync(CONFIG_PATH)) {
  if (!cli.urls.length) {
    console.error(`Missing ${CONFIG_PATH}`);
    console.error("First run: pass the sites to watch, separated by commas or spaces.");
    console.error("Example:");
    console.error("  bradamante https://example.com/,https://example.org/");
    process.exit(1);
  }
  assertHttpUrls(cli.urls);
  writeConfig(cli.urls, {
    pollMs: cli.pollMs ?? DEFAULTS.pollMs,
    timeoutMs: cli.timeoutMs ?? DEFAULTS.timeoutMs,
    failureThreshold: cli.failureThreshold ?? DEFAULTS.failureThreshold,
  });
  console.log(`Wrote ${CONFIG_PATH}`);
  console.log("From now on, edit that file to change the list.");
} else if (cli.urls.length) {
  console.error(`Config already exists: ${CONFIG_PATH}`);
  console.error("Edit that file to change the sites. This run uses the file as it is.");
}

const config = loadConfig();
if (!config.connectivityUrls.length) {
  console.error(`${CONFIG_PATH}: connectivityUrls must contain at least one URL.`);
  process.exit(1);
}
const urls = config.urls;
const pollMs = cli.pollMs ?? config.pollMs;
const timeoutMs = cli.timeoutMs ?? config.timeoutMs;
const failureThreshold = cli.failureThreshold ?? config.failureThreshold;
const resumeGapFactor = config.resumeGapFactor;
const connectivityUrls = config.connectivityUrls;
const alertSoundFile = config.alertSoundFile;
const alertSoundCmd = config.alertSoundCmd;

if (!urls.length) {
  console.error(`No URLs configured. Edit ${CONFIG_PATH} or pass URLs on the command line.`);
  process.exit(1);
}

const states = new Map(
  urls.map((url) => [
    url,
    {
      isDown: false,
      consecutiveFailures: 0,
    },
  ])
);

let lastLoopStart = Date.now();
let internetIsDown = false;

function printHelp() {
  console.log(`bradamante — check URLs and alert when one goes down

Usage:
  bradamante <url>[,<url>...]        first run: save these sites to ${CONFIG_PATH} and start
  bradamante                         later runs: watch the sites in that file
  bradamante --help

Options:
  --poll-ms <ms>                     interval between cycles
  --timeout-ms <ms>                  request timeout
  --threshold <n>                    consecutive failures before a down alert
`);
}

function assertHttpUrls(urls) {
  const invalid = urls.filter((url) => !/^https?:\/\/\S+$/i.test(url));
  if (invalid.length) {
    console.error(`Not a URL: ${invalid.join(", ")}`);
    process.exit(1);
  }
}

function splitUrlArg(value) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function writeConfig(urls, settings) {
  const body = `module.exports = {
  urls: [
${urls.map((url) => `    ${JSON.stringify(url)},`).join("\n")}
  ],
  pollMs: ${settings.pollMs},
  timeoutMs: ${settings.timeoutMs},
  failureThreshold: ${settings.failureThreshold},
  resumeGapFactor: ${DEFAULTS.resumeGapFactor},
  connectivityUrls: [
${DEFAULTS.connectivityUrls.map((url) => `    ${JSON.stringify(url)},`).join("\n")}
  ],
  alertSoundFile: "",
  alertSoundCmd: "",
};
`;
  fs.writeFileSync(CONFIG_PATH, body);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Missing ${CONFIG_PATH}`);
    console.error("First run: pass the sites to watch, separated by commas or spaces.");
    process.exit(1);
  }

  let loaded;
  try {
    loaded = require(CONFIG_PATH);
  } catch (error) {
    console.error(`Could not load ${CONFIG_PATH}: ${error.message}`);
    process.exit(1);
  }

  if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
    console.error(`${CONFIG_PATH} must export an object.`);
    process.exit(1);
  }

  const urls = asUrlList(loaded.urls, "urls");
  return {
    urls,
    pollMs: asPositiveNumber(loaded.pollMs, DEFAULTS.pollMs, "pollMs"),
    timeoutMs: asPositiveNumber(loaded.timeoutMs, DEFAULTS.timeoutMs, "timeoutMs"),
    failureThreshold: asPositiveNumber(loaded.failureThreshold, DEFAULTS.failureThreshold, "failureThreshold"),
    resumeGapFactor: asPositiveNumber(loaded.resumeGapFactor, DEFAULTS.resumeGapFactor, "resumeGapFactor"),
    connectivityUrls: loaded.connectivityUrls == null
      ? DEFAULTS.connectivityUrls
      : asUrlList(loaded.connectivityUrls, "connectivityUrls"),
    alertSoundFile: asOptionalString(loaded.alertSoundFile, "alertSoundFile"),
    alertSoundCmd: asOptionalString(loaded.alertSoundCmd, "alertSoundCmd"),
  };
}

function asUrlList(value, name) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    console.error(`${CONFIG_PATH}: ${name} must be an array of URL strings.`);
    process.exit(1);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function asPositiveNumber(value, fallback, name) {
  if (value == null || value === "") {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    console.error(`${CONFIG_PATH}: ${name} must be a number greater than 0.`);
    process.exit(1);
  }
  return number;
}

function asOptionalString(value, name) {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value !== "string") {
    console.error(`${CONFIG_PATH}: ${name} must be a string.`);
    process.exit(1);
  }
  return value;
}

function parseArgs(argv) {
  const result = {
    help: false,
    urls: [],
    pollMs: undefined,
    timeoutMs: undefined,
    failureThreshold: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--poll-ms" || arg === "--timeout-ms" || arg === "--threshold") {
      const raw = argv[index + 1];
      if (raw == null || raw.startsWith("--")) {
        console.error(`Missing value for ${arg}`);
        process.exit(1);
      }
      const number = Number(raw);
      if (!Number.isFinite(number) || number <= 0) {
        console.error(`${arg} must be a number greater than 0.`);
        process.exit(1);
      }
      if (arg === "--poll-ms") {
        result.pollMs = number;
      } else if (arg === "--timeout-ms") {
        result.timeoutMs = number;
      } else {
        result.failureThreshold = number;
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
    result.urls.push(...splitUrlArg(arg));
  }

  return result;
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", " UTC");
}

function logLine(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function playAlertSound() {
  if (alertSoundCmd) {
    const [cmd, ...args] = alertSoundCmd.split(" ").filter(Boolean);
    if (cmd) {
      spawn(cmd, args, { stdio: "ignore" }).on("error", () => {
        process.stdout.write("\u0007");
      });
      return;
    }
  }

  if (process.platform === "darwin") {
    const args = alertSoundFile ? [alertSoundFile] : ["/System/Library/Sounds/Funk.aiff"];
    spawn("afplay", args, { stdio: "ignore" }).on("error", () => {
      process.stdout.write("\u0007");
    });
    return;
  }

  process.stdout.write("\u0007");
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });

    const elapsed = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        elapsed,
        reason: `HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status, elapsed };
  } catch (error) {
    const elapsed = Date.now() - started;
    const reason = error?.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : error.message;
    return { ok: false, elapsed, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkInternetConnectivity() {
  const checks = await Promise.all(connectivityUrls.map((url) => checkUrl(url)));
  const firstSuccess = checks.find((result) => result.ok);
  if (firstSuccess) {
    return { ok: true, details: firstSuccess };
  }

  const firstFailure = checks[0] || { reason: "Unknown connectivity error", elapsed: 0 };
  return { ok: false, details: firstFailure };
}

async function runCycle() {
  const internet = await checkInternetConnectivity();
  if (!internet.ok) {
    if (!internetIsDown) {
      internetIsDown = true;
      logLine(
        `ALERT: Internet connectivity check failed (${internet.details.elapsed}ms) - ${internet.details.reason}`
      );
      playAlertSound();
    } else {
      logLine(
        `INTERNET DOWN: connectivity check failed (${internet.details.elapsed}ms) - ${internet.details.reason}`
      );
    }
    logLine("Skipping target URL checks until internet connectivity is restored.");
    return;
  }

  if (internetIsDown) {
    internetIsDown = false;
    logLine("RECOVERED: Internet connectivity restored.");
  }

  const checks = await Promise.all(urls.map((url) => checkUrl(url)));

  checks.forEach((result, index) => {
    const url = urls[index];
    const state = states.get(url);
    if (!state) {
      return;
    }

    if (result.ok) {
      if (state.isDown) {
        logLine(`RECOVERED: ${url} (${result.elapsed}ms, HTTP ${result.status})`);
      } else {
        logLine(`OK: ${url} (${result.elapsed}ms, HTTP ${result.status})`);
      }

      state.isDown = false;
      state.consecutiveFailures = 0;
      return;
    }

    state.consecutiveFailures += 1;
    logLine(
      `FAIL ${state.consecutiveFailures}/${failureThreshold}: ${url} (${result.elapsed}ms) - ${result.reason}`
    );

    if (!state.isDown && state.consecutiveFailures >= failureThreshold) {
      state.isDown = true;
      logLine(`ALERT: ${url} is DOWN`);
      playAlertSound();
    }
  });
}

async function loop() {
  const now = Date.now();
  const elapsedSinceLastLoop = now - lastLoopStart;
  const resumeThresholdMs = Math.max(pollMs * resumeGapFactor, pollMs + timeoutMs);
  if (elapsedSinceLastLoop > resumeThresholdMs) {
    logLine(
      `Resume detected after ${elapsedSinceLastLoop}ms idle gap; running immediate health checks.`
    );
  }
  lastLoopStart = now;

  try {
    await runCycle();
  } catch (error) {
    logLine(`Unexpected monitor error: ${error.message}`);
  } finally {
    setTimeout(loop, pollMs);
  }
}

logLine(`Bradamante started. Poll every ${pollMs}ms; timeout ${timeoutMs}ms; threshold ${failureThreshold}.`);
logLine(`Monitoring ${urls.length} URL(s): ${urls.join(", ")}`);
logLine(`Connectivity pre-check URLs: ${connectivityUrls.join(", ")}`);
loop();
