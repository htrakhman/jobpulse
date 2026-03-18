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
const DEBOUNCE_MS = 3000; // Wait 3s after last change before committing

function run(cmd, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

async function commitAndPush() {
  try {
    await run("git", ["add", "-A"]);
    const status = await new Promise((resolve, reject) => {
      const p = spawn("git", ["status", "--porcelain"], { cwd: ROOT });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`Exit ${code}`))));
    });
    if (!status.trim()) return;
    const msg = `auto: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    await run("git", ["commit", "-m", msg]);
    await run("git", ["push", "origin", "HEAD"]);
    console.log(`\n✓ Pushed to GitHub at ${new Date().toLocaleTimeString()}\n`);
  } catch (e) {
    if (e.message?.includes("Exit")) {
      console.warn("[auto-commit-push]", e.message);
    } else {
      console.error("[auto-commit-push]", e);
    }
  }
}

function scheduleCommit(relativePath) {
  console.log(`  changed: ${relativePath}`);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    commitAndPush();
  }, DEBOUNCE_MS);
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

console.log("👀 Watching for changes. Auto-commit + push to GitHub (debounce 3s)\n");
