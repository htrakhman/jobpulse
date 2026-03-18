#!/usr/bin/env node
/**
 * Watches for file changes and auto-commits + pushes to GitHub.
 * Run: npm run auto:push (or run alongside dev in another terminal)
 * Railway deploys automatically when GitHub receives the push.
 */

const { spawn } = require("child_process");
const path = require("path");
const chokidar = require("chokidar");

const ROOT = path.resolve(__dirname, "..");
let debounceTimer = null;
let firstChangeAt = null;
let commitInProgress = false;
const pendingChanges = new Set();
const DEBOUNCE_MS = 20000; // Batch edits before committing
const MAX_BATCH_WAIT_MS = 120000; // Do not delay a batch forever
const MIN_PUSH_INTERVAL_MS = 10 * 60 * 1000; // At most one auto-push every 10 minutes
let lastPushAt = 0;

const NOISE_PATH_PATTERNS = [
  /^next-env\.d\.ts$/,
  /^lib\/generated\/prisma\//,
];

function run(cmd, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: false });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

function runAndCapture(cmd, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, shell: false });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error((err || out || `Exit ${code}`).trim()));
    });
  });
}

function isNoiseFile(file) {
  return NOISE_PATH_PATTERNS.some((pattern) => pattern.test(file));
}

function parseChangedFiles(status) {
  return [
    ...new Set(
      status
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const raw = line.slice(3).trim();
          if (raw.includes(" -> ")) return raw.split(" -> ").pop().trim();
          return raw;
        })
    ),
  ];
}

function inferArea(file) {
  if (file.startsWith("app/api/")) return "API routes";
  if (file.startsWith("app/(dashboard)/")) return "dashboard";
  if (file.startsWith("app/")) return "app";
  if (file.startsWith("components/dashboard/")) return "dashboard UI";
  if (file.startsWith("components/")) return "components";
  if (file.startsWith("lib/services/")) return "services";
  if (file.startsWith("lib/")) return "backend logic";
  if (file.startsWith("prisma/")) return "database schema";
  if (file.startsWith("scripts/")) return "automation scripts";
  return "project files";
}

function buildCommitMessage(files) {
  const areas = [...new Set(files.map(inferArea))];
  const areaLabel =
    areas.length === 1 ? areas[0] : areas.length <= 3 ? areas.join(", ") : "multiple areas";
  const title = `auto: update ${areaLabel} (${files.length} file${files.length === 1 ? "" : "s"})`;
  const listedFiles = files.slice(0, 8).map((f) => `- ${f}`).join("\n");
  const remaining = files.length > 8 ? `\n- ...and ${files.length - 8} more` : "";
  const body = `Auto-commit after local file changes.\n\nFiles changed:\n${listedFiles}${remaining}`;
  return { title, body };
}

async function commitAndPush() {
  if (commitInProgress) return;
  const now = Date.now();
  const cooldownMs = MIN_PUSH_INTERVAL_MS - (now - lastPushAt);
  if (cooldownMs > 0) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (pendingChanges.size > 0) commitAndPush();
    }, cooldownMs);
    console.log(
      `[auto-commit-push] batching changes; next push in ${Math.ceil(cooldownMs / 1000)}s`
    );
    return;
  }
  commitInProgress = true;
  try {
    await run("git", ["add", "-A"]);
    const status = await runAndCapture("git", ["status", "--porcelain"]);
    if (!status.trim()) {
      pendingChanges.clear();
      return;
    }
    const files = parseChangedFiles(status).filter((f) => !isNoiseFile(f));
    if (files.length === 0) {
      pendingChanges.clear();
      return;
    }
    const { title, body } = buildCommitMessage(files);
    await run("git", ["commit", "-m", title, "-m", body]);
    await run("git", ["push", "origin", "HEAD"]);
    lastPushAt = Date.now();
    pendingChanges.clear();
    firstChangeAt = null;
    console.log(`\n✓ Pushed to GitHub at ${new Date().toLocaleTimeString()}\n`);
  } catch (e) {
    if (e.message?.includes("Exit")) {
      console.warn("[auto-commit-push]", e.message);
    } else {
      console.error("[auto-commit-push]", e);
    }
  } finally {
    commitInProgress = false;
  }
}

function scheduleCommit(relativePath) {
  if (isNoiseFile(relativePath)) return;
  pendingChanges.add(relativePath);
  console.log(`  changed: ${relativePath}`);
  if (!firstChangeAt) firstChangeAt = Date.now();

  if (debounceTimer) clearTimeout(debounceTimer);
  const elapsed = Date.now() - firstChangeAt;
  const waitMs = Math.max(0, Math.min(DEBOUNCE_MS, MAX_BATCH_WAIT_MS - elapsed));

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (pendingChanges.size > 0) {
      commitAndPush();
    }
  }, waitMs);
}

const watcher = chokidar.watch(ROOT, {
  ignored: [
    /(^|[\/\\])\../,
    /node_modules/,
    /\.git/,
    /\.next/,
    /dist/,
    /\.env/,
    /\.DS_Store/,
  ],
  persistent: true,
  ignoreInitial: true, // Don't fire on existing files at startup
});

watcher.on("change", (p) => scheduleCommit(path.relative(ROOT, p)));
watcher.on("add", (p) => scheduleCommit(path.relative(ROOT, p)));

console.log("👀 Watching for changes. Auto-commit + push to GitHub (batched)\n");
console.log("   push cooldown:", `${MIN_PUSH_INTERVAL_MS / 60000} minutes`);
