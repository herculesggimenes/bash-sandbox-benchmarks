#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Bash, InMemoryFs, defineCommand } from "just-bash";
import {
  createPeakTracker,
  forceGc,
  formatMiB,
  makeAgentFiles,
  makeTreeFiles,
  mapLimit,
  maxMemory,
  medianSample,
  memoryDelta,
  memorySnapshot,
  parseCommonArgs,
  printTable,
  resolveConcurrency,
} from "./shared.mjs";

const scriptPath = fileURLToPath(import.meta.url);

function printUsage() {
  console.log(`Usage: pnpm benchmark:just-bash -- [options]

Options:
  --counts 1,10,50,100 or scale
  --workload idle|ops
  --concurrency 64|all
  --samples 1
  --warmup 1
  --payload-kb 16
  --tree-files 24
  --json
`);
}

function parseFlag(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || args[index + 1] === undefined) {
    return fallback;
  }
  return Number.parseInt(args[index + 1], 10) || fallback;
}

function makeBenchmarkCli(sessionIndex) {
  return defineCommand("bench-cli", async (args) => {
    const subcommand = args[0] ?? "expenses";
    const limit = parseFlag(args, "--limit", 50);

    if (subcommand === "expenses") {
      const items = Array.from({ length: limit }, (_unused, index) => ({
        amount: 12 + ((sessionIndex + index) % 41),
        id: `cli_expense_${sessionIndex}_${index}`,
        merchant: index % 3 === 0 ? "Acme Coffee" : "Office Supply",
        risk: index % 8 === 0 ? "high" : "low",
        userId: `user_${sessionIndex % 11}`,
      }));
      return {
        exitCode: 0,
        stderr: "",
        stdout: `${JSON.stringify({ items })}\n`,
      };
    }

    if (subcommand === "users") {
      const users = Array.from({ length: limit }, (_unused, index) => ({
        department: index % 2 === 0 ? "Engineering" : "Finance",
        id: `user_${sessionIndex}_${index}`,
        managerId: `manager_${index % 5}`,
      }));
      return {
        exitCode: 0,
        stderr: "",
        stdout: `${JSON.stringify({ users })}\n`,
      };
    }

    return {
      exitCode: 2,
      stderr: `bench-cli: unknown subcommand: ${subcommand}\n`,
      stdout: "",
    };
  });
}

async function setupSession(workload, index, options) {
  const files =
    workload === "ops"
      ? {
          ...makeAgentFiles(index, options.payloadKb),
          ...makeTreeFiles(index, options.treeFiles),
        }
      : {};
  return new Bash({
    customCommands: workload === "ops" ? [makeBenchmarkCli(index)] : [],
    cwd: "/workspace",
    env: { SESSION_INDEX: String(index) },
    fs: new InMemoryFs(files),
  });
}

async function runWorkload(sandbox, workload, sessionIndex) {
  if (workload === "idle") {
    return;
  }

  const result = await sandbox.exec(
    `
set -e
bench-cli expenses --limit 80 \
  | jq '[.items[] | select(.risk == "high")] | length' \
  > /tmp/high-risk-count.txt
bench-cli users --limit 25 | jq '.users | length' > /tmp/user-count.txt
find /workspace/tree -type f | sort | head -40 > /tmp/tree-sample.txt
rg -n "approval|needle-${sessionIndex}" /workspace/tree > /tmp/search-hits.txt
grep -R "expense" /workspace/tree/policies | wc -l > /tmp/policy-expense-lines.txt
wc -l /tmp/tree-sample.txt /tmp/search-hits.txt /tmp/policy-expense-lines.txt \
  > /tmp/summary.txt
cat /tmp/summary.txt
`,
    { cwd: "/workspace" },
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "bash workload failed");
  }
}

async function runOne(count, options) {
  for (let index = 0; index < options.warmup; index++) {
    const sandbox = await setupSession(options.workload, index, options);
    await runWorkload(sandbox, options.workload, index);
  }

  await forceGc();
  const baselineMemory = memorySnapshot();

  const sessions = [];
  const setupStart = performance.now();
  const setupIndexes = Array.from({ length: count }, (_unused, index) => index);
  await mapLimit(setupIndexes, options.concurrency, async (index) => {
    sessions[index] = await setupSession(options.workload, index, options);
  });
  const setupMs = performance.now() - setupStart;

  await forceGc();
  const setupMemory = memorySnapshot();

  const peakTracker = createPeakTracker();
  const operationStart = performance.now();
  peakTracker.start();
  await mapLimit(
    sessions,
    options.concurrency,
    async (sandbox, index) => runWorkload(sandbox, options.workload, index),
    peakTracker.sample,
  );
  const operationMs = performance.now() - operationStart;
  const operationPeakMemory = peakTracker.stop();

  await forceGc();
  const retainedMemory = memorySnapshot();
  const peakMemory = maxMemory(operationPeakMemory, retainedMemory);

  globalThis.__benchmarkSessions = sessions;

  return {
    concurrency: resolveConcurrency(options.concurrency, count),
    count,
    operationMs,
    payloadKb: options.payloadKb,
    peakDelta: memoryDelta(peakMemory, baselineMemory),
    retainedDelta: memoryDelta(retainedMemory, baselineMemory),
    setupDelta: memoryDelta(setupMemory, baselineMemory),
    setupMs,
    treeFiles: options.treeFiles,
    workload: options.workload,
  };
}

async function main() {
  const options = parseCommonArgs(process.argv.slice(2), { warmup: 1 });
  if (options.help) {
    printUsage();
    return;
  }
  if (!["idle", "ops"].includes(options.workload)) {
    throw new Error("--workload must be idle or ops");
  }

  if (options.child) {
    if (options.count <= 0) {
      throw new Error("--count is required in child mode");
    }
    console.log(JSON.stringify(await runOne(options.count, options)));
    return;
  }

  const results = [];
  for (const count of options.counts) {
    const samples = [];
    for (let sample = 0; sample < options.samples; sample++) {
      const child = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          scriptPath,
          "--child",
          "--count",
          String(count),
          "--workload",
          options.workload,
          "--warmup",
          String(options.warmup),
          "--payload-kb",
          String(options.payloadKb),
          "--tree-files",
          String(options.treeFiles),
          "--concurrency",
          String(options.concurrency),
        ],
        { encoding: "utf8" },
      );
      if (child.status !== 0) {
        process.stderr.write(child.stdout);
        process.stderr.write(child.stderr);
        throw new Error(`Benchmark child failed for count ${count}`);
      }
      samples.push(JSON.parse(child.stdout.trim()));
    }
    results.push(medianSample(samples));
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printTable(
    results,
    [
      { header: "runtime", value: () => "just-bash" },
      { header: "workload", value: (result) => result.workload },
      { header: "sessions", value: (result) => String(result.count) },
      { header: "concurrency", value: (result) => String(result.concurrency) },
      { header: "peakRSS", value: (result) => formatMiB(result.peakDelta.rss) },
      {
        header: "peakHWM",
        value: (result) => formatMiB(result.peakDelta.maxRss),
      },
      {
        header: "peak/session",
        value: (result) => formatMiB(result.peakDelta.rss / result.count),
      },
      {
        header: "retainedRSS",
        value: (result) => formatMiB(result.retainedDelta.rss),
      },
      {
        header: "retained/session",
        value: (result) => formatMiB(result.retainedDelta.rss / result.count),
      },
      {
        header: "heap/session",
        value: (result) =>
          formatMiB(result.retainedDelta.heapUsed / result.count),
      },
      { header: "setupMs", value: (result) => result.setupMs.toFixed(0) },
      {
        header: "operationMs",
        value: (result) => result.operationMs.toFixed(0),
      },
    ],
    "just-bash benchmark",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
