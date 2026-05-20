#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePositiveInteger } from "./shared.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SIZES = [10, 100, 1000];
const DEFAULT_MODELS = ["haiku", "sonnet", "opus"];
const DEFAULT_VARIANTS = ["tool", "tool-compaction", "just-bash", "sandbox"];
const DEFAULT_RUNS = 20;
const DEFAULT_BATCH_SIZE = 4;
const MODEL_ALIASES = Object.freeze({
  haiku: "claude-haiku-4-5-20251001",
  opus: "claude-opus-4-5-20251101",
  sonnet: "claude-sonnet-4-5-20250929",
});

function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function parseCsv(value, parser = (item) => item) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parser);
}

function resolveModelId(model) {
  return MODEL_ALIASES[model] ?? model;
}

function printUsage() {
  console.log(`Usage: pnpm benchmark:spend-audit:matrix -- [options]

Options:
  --sizes 10,100,1000
  --models haiku,sonnet,opus
  --runs ${DEFAULT_RUNS}
  --batch-size ${DEFAULT_BATCH_SIZE}
  --schedule round-robin|grouped
  --variants tool,tool-compaction,just-bash,sandbox
  --source-dir /path/to/source-csvs
  --env-file /path/to/llm-gateway.env
  --output-dir results/spend-audit-matrix-live-r20-${timestampSlug()}
  --mock-llm
  --require-llm
  --skip-preflight
  --allow-provider-errors
  --provider-run-retries 2
  --no-provider-run-retries
  --export-judge-packets
  --no-export-judge-packets
  --sample
  --force
  --continue-on-error
  --dry-run

The default matrix is 3 dataset sizes x 3 model aliases. Each cell runs the
base spend-audit benchmark for all selected variants and writes raw reports
under size-<N>/model-<alias-or-id>/.
`);
}

function parseArgs(argv) {
  const options = {
    allowProviderErrors: false,
    batchSize: DEFAULT_BATCH_SIZE,
    continueOnError: false,
    dryRun: false,
    envFile: "",
    exportJudgePackets: true,
    force: false,
    mockLlm: false,
    models: DEFAULT_MODELS,
    outputDir: path.join(
      "results",
      `spend-audit-matrix-live-r20-${timestampSlug()}`,
    ),
    providerRunRetries: 2,
    requireLlm: false,
    runs: DEFAULT_RUNS,
    sample: false,
    schedule: "round-robin",
    sizes: DEFAULT_SIZES,
    skipPreflight: false,
    sourceDir: "",
    variants: DEFAULT_VARIANTS,
  };

  let sizesSpecified = false;
  let runsSpecified = false;
  let batchSizeSpecified = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index++;
      return value;
    };

    if (arg === "--allow-provider-errors") {
      options.allowProviderErrors = true;
    } else if (arg === "--batch-size") {
      options.batchSize = parsePositiveInteger(readValue(), arg);
      batchSizeSpecified = true;
    } else if (arg === "--continue-on-error") {
      options.continueOnError = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--env-file") {
      options.envFile = readValue();
    } else if (arg === "--export-judge-packets") {
      options.exportJudgePackets = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--mock-llm") {
      options.mockLlm = true;
    } else if (arg === "--models") {
      options.models = parseCsv(readValue());
    } else if (arg === "--no-export-judge-packets") {
      options.exportJudgePackets = false;
    } else if (arg === "--output-dir") {
      options.outputDir = readValue();
    } else if (arg === "--no-provider-run-retries") {
      options.providerRunRetries = 0;
    } else if (arg === "--provider-run-retries") {
      options.providerRunRetries = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--require-llm") {
      options.requireLlm = true;
    } else if (arg === "--runs") {
      options.runs = parsePositiveInteger(readValue(), arg);
      runsSpecified = true;
    } else if (arg === "--sample") {
      options.sample = true;
    } else if (arg === "--schedule") {
      options.schedule = readValue();
      if (!["grouped", "round-robin"].includes(options.schedule)) {
        throw new Error("--schedule must be grouped or round-robin");
      }
    } else if (arg === "--sizes") {
      options.sizes = parseCsv(readValue(), (item) =>
        parsePositiveInteger(item, arg),
      );
      sizesSpecified = true;
    } else if (arg === "--skip-preflight") {
      options.skipPreflight = true;
    } else if (arg === "--source-dir") {
      options.sourceDir = readValue();
    } else if (arg === "--stop-on-error") {
      options.continueOnError = false;
    } else if (arg === "--variants") {
      options.variants = parseCsv(readValue());
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg !== "--") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.sample) {
    if (!sizesSpecified) {
      options.sizes = [10];
    }
    if (!runsSpecified) {
      options.runs = 1;
    }
    if (!batchSizeSpecified) {
      options.batchSize = Math.min(DEFAULT_BATCH_SIZE, options.variants.length);
    }
  }

  options.outputDir = path.resolve(REPO_ROOT, options.outputDir);
  return options;
}

async function findCompletedReport(outputDir) {
  let names;
  try {
    names = await readdir(outputDir);
  } catch {
    return null;
  }
  const completed = names
    .filter(
      (name) =>
        name.startsWith("company-spend-audit-benchmark-") &&
        name.endsWith(".json") &&
        !name.endsWith(".partial.json"),
    )
    .sort();
  const latest = completed.at(-1);
  return latest ? path.join(outputDir, latest) : null;
}

function buildCellCommand({ cell, options }) {
  const args = [
    "benchmark:spend-audit",
    "--",
    "--runs",
    String(options.runs),
    "--batch-size",
    String(options.batchSize),
    "--schedule",
    options.schedule,
    "--variants",
    options.variants.join(","),
    "--max-expenses",
    String(cell.size),
    "--model",
    cell.modelId,
    "--output-dir",
    cell.outputDir,
  ];

  if (options.sourceDir) {
    args.push("--source-dir", options.sourceDir);
  }
  if (options.envFile) {
    args.push("--env-file", options.envFile);
  }
  if (options.mockLlm) {
    args.push("--mock-llm");
  }
  if (options.requireLlm) {
    args.push("--require-llm");
  }
  if (options.skipPreflight) {
    args.push("--skip-preflight");
  }
  if (options.allowProviderErrors) {
    args.push("--allow-provider-errors");
  }
  if (options.providerRunRetries === 0) {
    args.push("--no-provider-run-retries");
  } else {
    args.push("--provider-run-retries", String(options.providerRunRetries));
  }
  if (options.exportJudgePackets) {
    args.push("--export-judge-packets");
  }

  return {
    command: "pnpm",
    args,
  };
}

async function runCommand({ args, command }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, signal });
    });
    child.on("error", (error) => {
      resolve({ error, exitCode: 1, signal: null });
    });
  });
}

async function writeManifest(manifestPath, manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function buildCells(options) {
  const cells = [];
  for (const size of options.sizes) {
    for (const model of options.models) {
      const modelId = resolveModelId(model);
      const modelSegment = sanitizeSegment(model);
      cells.push({
        model,
        modelId,
        outputDir: path.join(
          options.outputDir,
          `size-${size}`,
          `model-${modelSegment}`,
        ),
        size,
      });
    }
  }
  return cells;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const startedAt = new Date();
  const cells = buildCells(options);
  const manifestPath = path.join(options.outputDir, "matrix-manifest.json");
  const manifest = {
    cells: [],
    config: {
      batchSize: options.batchSize,
      exportJudgePackets: options.exportJudgePackets,
      llmMode: options.mockLlm ? "mock" : "live",
      models: options.models,
      requireLlm: options.requireLlm,
      runs: options.runs,
      schedule: options.schedule,
      sizes: options.sizes,
      sourceDir: options.sourceDir || null,
      variants: options.variants,
    },
    createdAt: startedAt.toISOString(),
    outputDir: options.outputDir,
    status: "running",
  };
  await writeManifest(manifestPath, manifest);

  console.log(
    `Spend-audit matrix: ${cells.length} cells, runs=${options.runs}, batchSize=${options.batchSize}, variants=${options.variants.join(",")}`,
  );
  console.log(`Output: ${options.outputDir}`);

  for (const [cellIndex, cell] of cells.entries()) {
    await mkdir(cell.outputDir, { recursive: true });
    const cellRecord = {
      ...cell,
      command: null,
      durationMs: 0,
      endedAt: null,
      error: null,
      exitCode: null,
      reportPath: null,
      signal: null,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    manifest.cells.push(cellRecord);

    const existingReport = options.force
      ? null
      : await findCompletedReport(cell.outputDir);
    if (existingReport) {
      cellRecord.endedAt = new Date().toISOString();
      cellRecord.reportPath = existingReport;
      cellRecord.status = "skipped_existing";
      await writeManifest(manifestPath, manifest);
      console.log(
        `[${cellIndex + 1}/${cells.length}] skipped size=${cell.size} model=${cell.model}; existing report ${existingReport}`,
      );
      continue;
    }

    const command = buildCellCommand({ cell, options });
    cellRecord.command = [command.command, ...command.args];
    await writeManifest(manifestPath, manifest);

    console.log(
      `[${cellIndex + 1}/${cells.length}] running size=${cell.size} model=${cell.model} (${cell.modelId})`,
    );
    console.log(`$ ${cellRecord.command.join(" ")}`);

    if (options.dryRun) {
      cellRecord.endedAt = new Date().toISOString();
      cellRecord.status = "dry_run";
      await writeManifest(manifestPath, manifest);
      continue;
    }

    const cellStarted = Date.now();
    const result = await runCommand(command);
    cellRecord.durationMs = Date.now() - cellStarted;
    cellRecord.endedAt = new Date().toISOString();
    cellRecord.exitCode = result.exitCode;
    cellRecord.signal = result.signal;
    cellRecord.error = result.error?.message ?? null;
    cellRecord.reportPath = await findCompletedReport(cell.outputDir);
    cellRecord.status = result.exitCode === 0 ? "ok" : "error";
    await writeManifest(manifestPath, manifest);

    if (result.exitCode !== 0 && !options.continueOnError) {
      manifest.status = "error";
      manifest.completedAt = new Date().toISOString();
      await writeManifest(manifestPath, manifest);
      process.exitCode = result.exitCode ?? 1;
      return;
    }
  }

  const failures = manifest.cells.filter((cell) => cell.status === "error");
  manifest.completedAt = new Date().toISOString();
  manifest.status = failures.length > 0 ? "completed_with_errors" : "ok";
  await writeManifest(manifestPath, manifest);

  console.log(`Matrix manifest: ${manifestPath}`);
  if (failures.length > 0) {
    console.error(`Matrix completed with ${failures.length} failed cells.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
