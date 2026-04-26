#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatMiB, printTable } from "./shared.mjs";
import {
  JUDGE_DIMENSIONS,
  mergeJudgeResultsIntoRuns,
  readJudgeResultsJsonl,
} from "./spend-audit-judge.mjs";

function percentile(values, p) {
  const clean = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (clean.length === 0) {
    return 0;
  }
  const index = Math.min(
    clean.length - 1,
    Math.ceil((p / 100) * clean.length) - 1,
  );
  return clean[index];
}

function percentiles(values) {
  return {
    p50: percentile(values, 50),
    p70: percentile(values, 70),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length === 0
    ? 0
    : clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function firstLine(value) {
  return String(value ?? "")
    .split("\n")[0]
    .trim();
}

function groupError(error) {
  const line = firstLine(error);
  if (!line) {
    return "unknown";
  }
  return line.replace(/:.*/, "");
}

function summarizeVariant(rows) {
  const okRows = rows.filter((row) => row.status !== "error");
  const errorRows = rows.filter((row) => row.status === "error");
  const qualityPassRows = okRows.filter((row) => row.quality?.pass);
  const judgedRows = okRows.filter((row) => row.judge);
  const judgePassRows = judgedRows.filter((row) => row.judge?.pass);
  const submittedRows = okRows.filter(
    (row) => row.quality?.submitted ?? row.submitted,
  );
  const triagedRows = okRows.filter(
    (row) => row.quality?.triageCompleted ?? row.triageCoverage?.completed,
  );
  const metricRows = okRows.length > 0 ? okRows : rows;
  const pick = (fn) => metricRows.map(fn);
  const errors = {};
  for (const row of errorRows) {
    const key = row.errorClass || groupError(row.error);
    errors[key] = (errors[key] ?? 0) + 1;
  }
  const qualityFailures = {};
  for (const row of okRows) {
    for (const reason of row.quality?.failureReasons ?? []) {
      qualityFailures[reason] = (qualityFailures[reason] ?? 0) + 1;
    }
  }
  return {
    counters: {
      bashExecs: percentiles(pick((row) => row.counters?.bashExecs ?? 0)),
      dockerExecs: percentiles(pick((row) => row.counters?.dockerExecs ?? 0)),
      llmCalls: percentiles(pick((row) => row.counters?.llmCalls ?? 0)),
      providerFailures: percentiles(
        pick((row) => row.counters?.providerFailures ?? 0),
      ),
      providerRetries: percentiles(
        pick((row) => row.counters?.providerRetries ?? 0),
      ),
      spans: percentiles(pick((row) => row.spanCount ?? 0)),
      submissionRejections: percentiles(
        pick((row) => row.counters?.submissionRejections ?? 0),
      ),
      toolCalls: percentiles(pick((row) => row.counters?.toolCalls ?? 0)),
      webSearchCalls: percentiles(
        pick((row) => row.counters?.webSearchCalls ?? 0),
      ),
    },
    errors,
    evaluation: {
      exactF1: percentiles(pick((row) => row.evaluation?.exact?.f1 ?? 0)),
      exactRecall: percentiles(
        pick((row) => row.evaluation?.exact?.recall ?? 0),
      ),
      expenseF1: percentiles(pick((row) => row.evaluation?.expenseId?.f1 ?? 0)),
      expenseRecall: percentiles(
        pick((row) => row.evaluation?.expenseId?.recall ?? 0),
      ),
      partialF1: percentiles(pick((row) => row.evaluation?.partial?.f1 ?? 0)),
      partialRecall: percentiles(
        pick((row) => row.evaluation?.partial?.recall ?? 0),
      ),
    },
    judge: {
      dimensions: Object.fromEntries(
        JUDGE_DIMENSIONS.map((dimension) => [
          dimension,
          percentiles(pick((row) => row.judge?.dimensions?.[dimension] ?? 0)),
        ]),
      ),
      score: percentiles(pick((row) => row.judge?.totalScore ?? 0)),
    },
    memory: {
      containerBytes: percentiles(pick((row) => row.containerMemoryBytes ?? 0)),
      peakRssBytes: percentiles(pick((row) => row.peakDelta?.rss ?? 0)),
      retainedRssBytes: percentiles(pick((row) => row.retainedDelta?.rss ?? 0)),
    },
    runs: {
      errorCount: errorRows.length,
      judgedCount: judgedRows.length,
      judgePassCount: judgePassRows.length,
      qualityPassCount: qualityPassRows.length,
      qualityPassRate:
        okRows.length === 0 ? 0 : qualityPassRows.length / okRows.length,
      successCount: okRows.length,
      successRate: rows.length === 0 ? 0 : okRows.length / rows.length,
      submittedCount: submittedRows.length,
      total: rows.length,
      triageCompletedCount: triagedRows.length,
    },
    qualityFailures,
    time: {
      coldStartMs: percentiles(pick((row) => row.coldStartMs ?? 0)),
      llmMs: percentiles(pick((row) => row.llmMs ?? 0)),
      prepMs: percentiles(pick((row) => row.prepMs ?? 0)),
      totalMs: percentiles(pick((row) => row.totalMs ?? 0)),
      warmStartMs: percentiles(pick((row) => row.warmStartMs ?? 0)),
      wallMs: percentiles(pick((row) => row.wallMs ?? row.totalMs ?? 0)),
      webSearchMs: percentiles(pick((row) => row.webSearchMs ?? 0)),
    },
    tokens: {
      completion: percentiles(pick((row) => row.usage?.completionTokens ?? 0)),
      prompt: percentiles(pick((row) => row.usage?.promptTokens ?? 0)),
      total: percentiles(pick((row) => row.usage?.totalTokens ?? 0)),
    },
    averages: {
      exactF1: average(pick((row) => row.evaluation?.exact?.f1 ?? 0)),
      expenseF1: average(pick((row) => row.evaluation?.expenseId?.f1 ?? 0)),
      totalMs: average(pick((row) => row.totalMs ?? 0)),
      totalTokens: average(pick((row) => row.usage?.totalTokens ?? 0)),
    },
  };
}

function buildAnalysis(report, inputPath) {
  const variants = [...new Set(report.results.map((row) => row.variant))];
  const byVariant = Object.fromEntries(
    variants.map((variant) => [
      variant,
      summarizeVariant(report.results.filter((row) => row.variant === variant)),
    ]),
  );
  return {
    analysisGeneratedAt: new Date().toISOString(),
    batchMetrics: report.batchMetrics ?? [],
    byVariant,
    config: report.config,
    expectedReview: report.fixture?.expectedReview,
    judge: report.judge ?? null,
    rawReportPath: inputPath,
    runId: report.runId,
  };
}

function buildMarkdown(analysis) {
  const rows = Object.entries(analysis.byVariant).map(([variant, summary]) => ({
    ...summary,
    variant,
  }));
  const lines = [`# Company Spend Audit Result Analysis`, ""];
  lines.push(`Raw report: \`${analysis.rawReportPath}\``, "");
  if (analysis.judge) {
    lines.push(
      `Judge: \`${analysis.judge.provider}\`, pass threshold ${analysis.judge.passThreshold}`,
      "",
    );
  }
  lines.push(`## Summary`, "");
  lines.push(
    `| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Submitted | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 ms | Total P90 ms | Total P95 ms | Total P99 ms | Diagnostic Expense F1 P99 | Peak RSS P70 | Peak RSS P90 | Peak RSS P95 | Peak RSS P99 | Container P99 |`,
  );
  lines.push(
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
  );
  for (const row of rows) {
    lines.push(
      `| ${row.variant} | ${row.runs.successCount}/${row.runs.total} | ${row.runs.qualityPassCount}/${row.runs.successCount} | ${row.runs.judgedCount}/${row.runs.successCount} | ${row.runs.judgePassCount}/${row.runs.judgedCount} | ${row.judge.score.p70.toFixed(1)} | ${row.judge.score.p90.toFixed(1)} | ${row.judge.score.p95.toFixed(1)} | ${row.judge.score.p99.toFixed(1)} | ${row.runs.submittedCount}/${row.runs.successCount} | ${row.tokens.total.p70.toFixed(0)} | ${row.tokens.total.p90.toFixed(0)} | ${row.tokens.total.p95.toFixed(0)} | ${row.tokens.total.p99.toFixed(0)} | ${row.time.totalMs.p70.toFixed(0)} | ${row.time.totalMs.p90.toFixed(0)} | ${row.time.totalMs.p95.toFixed(0)} | ${row.time.totalMs.p99.toFixed(0)} | ${row.evaluation.expenseF1.p99.toFixed(3)} | ${formatMiB(row.memory.peakRssBytes.p70)} | ${formatMiB(row.memory.peakRssBytes.p90)} | ${formatMiB(row.memory.peakRssBytes.p95)} | ${formatMiB(row.memory.peakRssBytes.p99)} | ${formatMiB(row.memory.containerBytes.p99)} |`,
    );
  }
  lines.push(
    "",
    "Diagnostic F1 is computed against generated hidden cases for harness debugging only. Judge score is the primary quality metric when judge results are attached.",
    "",
  );
  lines.push("", "## Quality Failure Breakdown", "");
  for (const row of rows) {
    lines.push(`### \`${row.variant}\``);
    const entries = Object.entries(row.qualityFailures);
    if (entries.length === 0) {
      lines.push("- none");
    } else {
      for (const [name, count] of entries) {
        lines.push(`- ${name}: ${count}`);
      }
    }
    lines.push("");
  }
  lines.push("", "## Error Breakdown", "");
  for (const row of rows) {
    lines.push(`### \`${row.variant}\``);
    const entries = Object.entries(row.errors);
    if (entries.length === 0) {
      lines.push("- none");
    } else {
      for (const [name, count] of entries) {
        lines.push(`- ${name}: ${count}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function printSummary(analysis) {
  printTable(
    Object.entries(analysis.byVariant).map(([variant, summary]) => ({
      ...summary,
      variant,
    })),
    [
      { header: "variant", value: (row) => row.variant },
      {
        header: "ok",
        value: (row) => `${row.runs.successCount}/${row.runs.total}`,
      },
      {
        header: "quality",
        value: (row) => `${row.runs.qualityPassCount}/${row.runs.successCount}`,
      },
      {
        header: "judged",
        value: (row) => `${row.runs.judgedCount}/${row.runs.successCount}`,
      },
      {
        header: "judgeP95",
        value: (row) => row.judge.score.p95.toFixed(1),
      },
      {
        header: "submitted",
        value: (row) => `${row.runs.submittedCount}/${row.runs.successCount}`,
      },
      { header: "tokP90", value: (row) => row.tokens.total.p90.toFixed(0) },
      { header: "tokP95", value: (row) => row.tokens.total.p95.toFixed(0) },
      { header: "tokP99", value: (row) => row.tokens.total.p99.toFixed(0) },
      { header: "timeP90", value: (row) => row.time.totalMs.p90.toFixed(0) },
      { header: "timeP95", value: (row) => row.time.totalMs.p95.toFixed(0) },
      { header: "timeP99", value: (row) => row.time.totalMs.p99.toFixed(0) },
      {
        header: "diagExpenseF1P99",
        value: (row) => row.evaluation.expenseF1.p99.toFixed(3),
      },
    ],
    "derived analysis",
  );
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const inputPath = args[0];
  if (!inputPath) {
    throw new Error(
      "Usage: node scripts/analyze-fraud-review-results.mjs <report.json> [--judge-results results.jsonl]",
    );
  }
  let judgeResultsPath = "";
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--judge-results") {
      judgeResultsPath = args[index + 1] ?? "";
      index++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const resolvedInputPath = path.resolve(inputPath);
  const report = JSON.parse(await readFile(resolvedInputPath, "utf8"));
  if (judgeResultsPath) {
    const resolvedJudgeResultsPath = path.resolve(judgeResultsPath);
    const judgeResults = await readJudgeResultsJsonl(
      resolvedJudgeResultsPath,
      report.config?.qualityPassThreshold ?? report.judge?.passThreshold ?? 80,
    );
    report.results = mergeJudgeResultsIntoRuns({
      judgeResults,
      passThreshold:
        report.config?.qualityPassThreshold ??
        report.judge?.passThreshold ??
        80,
      results: report.results,
      runId: report.runId,
    });
    report.judge = {
      ...(report.judge ?? {}),
      resultsPath: resolvedJudgeResultsPath,
    };
  }
  const analysis = buildAnalysis(report, resolvedInputPath);
  const outputPath = resolvedInputPath.replace(/\.json$/, ".analysis.json");
  const markdownPath = resolvedInputPath.replace(/\.json$/, ".analysis.md");
  await writeFile(outputPath, JSON.stringify(analysis, null, 2));
  await writeFile(markdownPath, buildMarkdown(analysis));
  printSummary(analysis);
  console.log(`Analysis: ${outputPath}`);
  console.log(`Readout: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
