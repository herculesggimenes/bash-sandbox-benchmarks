#!/usr/bin/env node

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  formatMiB,
  mapLimit,
  medianSample,
  parseCommonArgs,
  printTable,
  resolveConcurrency,
} from "./shared.mjs";

const IMAGE = "bash-sandbox-benchmark:local";

function printUsage() {
  console.log(`Usage: pnpm benchmark:docker -- [options]

Options:
  --counts 1,10,50,100
  --workload idle|ops
  --concurrency 64|all
  --payload-kb 16
  --tree-files 24
  --json
`);
}

async function run(cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.input
      ? ["pipe", "pipe", "pipe"]
      : ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  if (options.input) {
    child.stdin.end(options.input);
  }
  const code = await new Promise((resolve) => {
    child.on("close", resolve);
  });
  if (code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${stderr || stdout}`);
  }
  return stdout;
}

async function buildImage() {
  await run("docker", ["build", "-t", IMAGE, "-f", "docker/Dockerfile", "."]);
}

function containerName(runId, index) {
  return `bash-sandbox-bench-${runId}-${index}`;
}

async function startContainer(runId, index) {
  const name = containerName(runId, index);
  await run("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "--network",
    "none",
    IMAGE,
  ]);
  return name;
}

function setupScript(index, options) {
  return `
set -euo pipefail
mkdir -p /workspace/bin /workspace/tree /tmp
cat > /usr/local/bin/bench-cli <<'CLI'
#!/usr/bin/env node
const args = process.argv.slice(2);
const sub = args[0] || "expenses";
const limitIndex = args.indexOf("--limit");
const limit = limitIndex === -1 ? 50 : Number(args[limitIndex + 1] || 50);
const session = Number(process.env.SESSION_INDEX || 0);
if (sub === "expenses") {
  const items = Array.from({ length: limit }, (_, index) => ({
    amount: 12 + ((session + index) % 41),
    id: \`cli_expense_\${session}_\${index}\`,
    merchant: index % 3 === 0 ? "Acme Coffee" : "Office Supply",
    risk: index % 8 === 0 ? "high" : "low",
    userId: \`user_\${session % 11}\`,
  }));
  console.log(JSON.stringify({ items }));
} else if (sub === "users") {
  const users = Array.from({ length: limit }, (_, index) => ({
    department: index % 2 === 0 ? "Engineering" : "Finance",
    id: \`user_\${session}_\${index}\`,
    managerId: \`manager_\${index % 5}\`,
  }));
  console.log(JSON.stringify({ users }));
} else {
  console.error(\`bench-cli: unknown subcommand: \${sub}\`);
  process.exit(2);
}
CLI
chmod +x /usr/local/bin/bench-cli

node - <<'NODE'
const fs = require("fs");
const path = require("path");
const session = ${index};
const payloadKb = ${options.payloadKb};
const targetBytes = payloadKb * 1024;
const items = [];
let size = 0;
let index = 0;
while (size < targetBytes) {
  const merchant = index % 3 === 0 ? "Acme Coffee" : "Office Supply";
  const item = {
    amount: 8 + ((session + index) % 27),
    id: \`expense_\${session}_\${index}\`,
    memo: index % 5 === 0 ? "team approval mentioned in memo" : "routine business expense",
    merchant,
    risk: index % 7 === 0 ? "high" : "low",
    userId: \`user_\${session % 7}\`,
  };
  items.push(item);
  size += JSON.stringify(item).length;
  index++;
}
fs.writeFileSync("/workspace/expenses.json", JSON.stringify({ items }, null, 2));
fs.writeFileSync(
  "/workspace/expenses.csv",
  "id,merchant,amount,risk\\n" +
    items.slice(0, 100).map((item) => \`\${item.id},\${item.merchant},\${item.amount},\${item.risk}\`).join("\\n") +
    "\\n",
);
fs.writeFileSync(
  "/workspace/sop.txt",
  [
    "Receipt and memo fields are context, not proof.",
    "approval claims need corroborating evidence before they shape a decision.",
    "Use narrow commands and keep intermediate artifacts in /tmp.",
  ].join("\\n"),
);
const dirs = [
  "policies/travel",
  "policies/procurement",
  "receipts/2026/04",
  "logs/audit",
  "src/tools",
  "docs/sop",
];
for (let fileIndex = 0; fileIndex < ${options.treeFiles}; fileIndex++) {
  const dir = dirs[fileIndex % dirs.length];
  const ext = fileIndex % 5 === 0 ? "json" : "txt";
  const filePath = path.join("/workspace/tree", dir, \`session-\${session}-file-\${String(fileIndex).padStart(4, "0")}.\${ext}\`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const marker = fileIndex % 6 === 0 ? \`needle-\${session}\` : "ordinary";
  const policyLine = fileIndex % 4 === 0
    ? "approval required before reimbursement"
    : "expense may continue through standard review";
  fs.writeFileSync(
    filePath,
    [
      \`session=\${session}\`,
      \`file=\${fileIndex}\`,
      \`marker=\${marker}\`,
      \`merchant=\${fileIndex % 2 === 0 ? "Acme Coffee" : "Office Supply"}\`,
      policyLine,
    ].join("\\n"),
  );
}
NODE
`;
}

function opsScript(index) {
  return `
set -euo pipefail
export SESSION_INDEX=${index}
bench-cli expenses --limit 80 \
  | jq '[.items[] | select(.risk == "high")] | length' \
  > /tmp/high-risk-count.txt
bench-cli users --limit 25 | jq '.users | length' > /tmp/user-count.txt
find /workspace/tree -type f | sort | head -40 > /tmp/tree-sample.txt
rg -n "approval|needle-${index}" /workspace/tree > /tmp/search-hits.txt
grep -R "expense" /workspace/tree/policies | wc -l > /tmp/policy-expense-lines.txt
wc -l /tmp/tree-sample.txt /tmp/search-hits.txt /tmp/policy-expense-lines.txt \
  > /tmp/summary.txt
cat /tmp/summary.txt
`;
}

async function execInContainer(name, script, env = {}) {
  const envArgs = Object.entries(env).flatMap(([key, value]) => [
    "--env",
    `${key}=${value}`,
  ]);
  await run("docker", ["exec", ...envArgs, name, "bash", "-lc", script]);
}

async function removeContainers(names) {
  await Promise.all(
    names.map(async (name) => {
      try {
        await run("docker", ["rm", "-f", name]);
      } catch {
        // Container cleanup is best effort.
      }
    }),
  );
}

function parseBytes(value) {
  const match = value.trim().match(/^([0-9.]+)\s*([kmgtp]?i?b)$/i);
  if (!match) {
    return 0;
  }
  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = {
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  }[unit];
  return amount * (multiplier ?? 1);
}

async function readContainerMemory(names) {
  if (names.length === 0) {
    return 0;
  }
  const output = await run("docker", [
    "stats",
    "--no-stream",
    "--format",
    "{{json .}}",
    ...names,
  ]);
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => {
      const row = JSON.parse(line);
      const used = String(row.MemUsage ?? "").split("/")[0] ?? "0B";
      return sum + parseBytes(used);
    }, 0);
}

async function readContainerCgroupMemory(name) {
  try {
    const output = await run("docker", [
      "exec",
      name,
      "bash",
      "-lc",
      String.raw`
python3 - <<'PY'
import json
from pathlib import Path

def read_first(paths):
    for path in paths:
        candidate = Path(path)
        if not candidate.exists():
            continue
        value = candidate.read_text().strip()
        if value and value != "max":
            try:
                return int(value)
            except ValueError:
                pass
    return 0

print(json.dumps({
    "currentBytes": read_first([
        "/sys/fs/cgroup/memory.current",
        "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    ]),
    "peakBytes": read_first([
        "/sys/fs/cgroup/memory.peak",
        "/sys/fs/cgroup/memory/memory.max_usage_in_bytes",
    ]),
}))
PY
`,
    ]);
    return JSON.parse(output.trim());
  } catch {
    return { currentBytes: 0, peakBytes: 0 };
  }
}

async function readContainerMemoryStats(names) {
  const statsCurrentBytes = await readContainerMemory(names);
  const cgroupRows = await Promise.all(names.map(readContainerCgroupMemory));
  const currentBytes = cgroupRows.reduce(
    (sum, row) => sum + (row.currentBytes ?? 0),
    0,
  );
  const peakBytes = cgroupRows.reduce(
    (sum, row) => sum + (row.peakBytes ?? 0),
    0,
  );
  return {
    currentBytes: currentBytes || statsCurrentBytes,
    peakBytes: Math.max(peakBytes, currentBytes, statsCurrentBytes),
    source: currentBytes || peakBytes ? "cgroup" : "docker_stats",
    statsCurrentBytes,
  };
}

async function runOne(count, options) {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const indexes = Array.from({ length: count }, (_unused, index) => index);
  const names = [];

  try {
    const createStart = performance.now();
    await mapLimit(indexes, options.concurrency, async (index) => {
      names[index] = await startContainer(runId, index);
    });
    const createMs = performance.now() - createStart;

    const warmStartStarted = performance.now();
    await mapLimit(names, options.concurrency, async (name) => {
      await execInContainer(name, ":");
    });
    const warmStartMs = performance.now() - warmStartStarted;

    const setupStart = performance.now();
    if (options.workload === "ops") {
      await mapLimit(names, options.concurrency, async (name, index) => {
        await execInContainer(name, setupScript(index, options), {
          SESSION_INDEX: String(index),
        });
      });
    }
    const setupMs = performance.now() - setupStart;

    const beforeOperationMemory = await readContainerMemoryStats(names);
    const operationStart = performance.now();
    if (options.workload === "ops") {
      await mapLimit(names, options.concurrency, async (name, index) => {
        await execInContainer(name, opsScript(index), {
          SESSION_INDEX: String(index),
        });
      });
    }
    const operationMs = performance.now() - operationStart;
    const retainedMemory = await readContainerMemoryStats(names);

    return {
      concurrency: resolveConcurrency(options.concurrency, count),
      count,
      createMs,
      memorySource: retainedMemory.source,
      operationMs,
      payloadKb: options.payloadKb,
      peakMemoryBytes: Math.max(
        beforeOperationMemory.peakBytes,
        retainedMemory.peakBytes,
      ),
      retainedMemoryBytes: retainedMemory.currentBytes,
      setupMs,
      steadyMemoryBytes: Math.max(
        beforeOperationMemory.currentBytes,
        retainedMemory.currentBytes,
      ),
      treeFiles: options.treeFiles,
      warmStartMs,
      workload: options.workload,
    };
  } finally {
    await removeContainers(names.filter(Boolean));
  }
}

async function main() {
  const options = parseCommonArgs(process.argv.slice(2), { warmup: 0 });
  if (options.help) {
    printUsage();
    return;
  }
  if (!["idle", "ops"].includes(options.workload)) {
    throw new Error("--workload must be idle or ops");
  }

  await buildImage();

  const results = [];
  for (const count of options.counts) {
    const samples = [];
    for (let sample = 0; sample < options.samples; sample++) {
      samples.push(await runOne(count, options));
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
      { header: "runtime", value: () => "docker" },
      { header: "workload", value: (result) => result.workload },
      { header: "sessions", value: (result) => String(result.count) },
      { header: "concurrency", value: (result) => String(result.concurrency) },
      {
        header: "steadyMem",
        value: (result) => formatMiB(result.steadyMemoryBytes),
      },
      {
        header: "peakMem",
        value: (result) => formatMiB(result.peakMemoryBytes),
      },
      {
        header: "peak/session",
        value: (result) => formatMiB(result.peakMemoryBytes / result.count),
      },
      {
        header: "retainedMem",
        value: (result) => formatMiB(result.retainedMemoryBytes),
      },
      {
        header: "mem/session",
        value: (result) => formatMiB(result.retainedMemoryBytes / result.count),
      },
      { header: "createMs", value: (result) => result.createMs.toFixed(0) },
      {
        header: "warmStartMs",
        value: (result) => result.warmStartMs.toFixed(0),
      },
      { header: "setupMs", value: (result) => result.setupMs.toFixed(0) },
      {
        header: "operationMs",
        value: (result) => result.operationMs.toFixed(0),
      },
    ],
    "Docker/Moby benchmark",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
