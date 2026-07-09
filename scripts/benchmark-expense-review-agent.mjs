#!/usr/bin/env node

import { generateText, pruneMessages, stepCountIs, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createVertex, vertex } from "@ai-sdk/google-vertex";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Bash, InMemoryFs, defineCommand } from "just-bash";
import { z } from "zod";
import {
  queryExpenses as queryCanonicalExpenses,
  summarizeExpenseQueryResult as summarizeCanonicalExpenseQueryResult,
} from "../src/workloads/spend-audit/domain/expense-query.mjs";
import {
  collectDecisionExpenseIds as collectCanonicalDecisionExpenseIds,
  reviewOutputSchema as canonicalReviewOutputSchema,
  validateSubmittedOutput as validateCanonicalSubmittedOutput,
} from "../src/workloads/spend-audit/domain/submission.mjs";
import {
  createSpendAuditWorkspace,
  describeSpendAuditWorkbench,
} from "../src/workloads/spend-audit/surface/manifest.mjs";
import {
  createPeakTracker,
  forceGc,
  formatMiB,
  memoryDelta,
  memorySnapshot,
  parsePositiveInteger,
  printTable,
} from "./shared.mjs";
import {
  JUDGE_DIMENSIONS,
  JUDGE_RUBRIC,
  assertNoHiddenLabels,
  mergeJudgeResultsIntoRuns,
  readJudgeResultsJsonl,
} from "./spend-audit-judge.mjs";

const TASK_ID = "weekly-company-spend-audit";
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_SOURCE_DIR = path.join(REPO_ROOT, "fixtures", "spend-audit");
const DEFAULT_WEEK_START = "2026-04-10";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MODEL_ALIASES = Object.freeze({
  haiku: "claude-haiku-4-5-20251001",
  opus: "claude-opus-4-5-20251101",
  sonnet: "claude-sonnet-4-5-20250929",
});
const DOCKER_IMAGE = "bash-sandbox-benchmark:local";
const DEFAULT_VARIANTS = ["tool", "tool-compaction", "just-bash", "sandbox"];
const DEFAULT_BATCH_SIZE = 5;
const VALID_VARIANTS = new Set([
  "tool",
  "tool-compaction",
  "just-bash",
  "sandbox",
  "docker",
]);
const WEB_SEARCH_MODEL = "gemini-2.5-flash";
const WEB_SEARCH_PROMPT = `
Search the web for accurate, current information. Provide well-researched responses with proper source citations.

MUST use enterprise_web_search for current, public, external facts.
Use it for:
- current company, product, or service research
- typical pricing ranges for expense validation
- public explanations of common spend misuse or abuse patterns

Prefer authoritative sources and include dates whenever the source provides them.
When information is limited or conflicting, say so directly.
Keep the answer concise and factual.
`.trim();
const DEFAULT_RECEIPT_ANALYSIS_SAMPLE_SIZE = 12;
const DEFAULT_EXPENSE_FETCH_PAGE_SIZE = 100;
const LLM_TIMEOUT_MS = 8 * 60 * 1000;
const PREFLIGHT_TIMEOUT_MS = 30 * 1000;
const PROVIDER_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const DEFAULT_PROVIDER_RUN_RETRIES = 2;
const PROVIDER_RUN_RETRY_DELAYS_MS = [15_000, 45_000];
const NATIVE_FORCE_SUBMIT_MIN_EVIDENCE_SPANS = 6;
const TOOL_COMPACTION_TOKEN_THRESHOLD = 80_000;
const TOOL_COMPACTION_RECENT_MESSAGE_WINDOW = 8;
const SPEND_PATTERN_KINDS = [
  "duplicate_shared_receipt",
  "threshold_splitting",
  "policy_breach",
  "merchant_burst",
  "software_procurement",
  "cash_equivalent",
  "meal_entertainment",
  "travel_lodging",
  "rideshare_transport",
  "receipt_documentation",
  "memo_justification",
];
let cachedGatewayProvider = null;
let cachedGatewayProviderKey = null;

function isToolCompactionVariant(variant) {
  return variant === "tool-compaction";
}

function isNativeToolVariant(variant) {
  return variant === "tool" || isToolCompactionVariant(variant);
}

function resolveModelId(model) {
  return MODEL_ALIASES[model] ?? model;
}

function inferModelAlias(modelInput, modelId) {
  if (MODEL_ALIASES[modelInput]) {
    return modelInput;
  }
  const entry = Object.entries(MODEL_ALIASES).find(
    ([, candidateModelId]) => candidateModelId === modelId,
  );
  return entry?.[0] ?? modelInput;
}

const CITY_NAMES = {
  bog: "Bogota, CO",
  gru: "Sao Paulo, BR",
  lax: "Los Angeles, CA",
  lon: "London, UK",
  mad: "Madrid, ES",
  mex: "Mexico City, MX",
  nyc: "New York, NY",
  sfo: "San Francisco, CA",
};
const REAL_MERCHANT_POOLS = {
  entertainment: [
    {
      max: 620,
      min: 110,
      name: "Soho House",
      receiptTemplate: "hospitality",
      type: "entertainment",
    },
    {
      max: 390,
      min: 85,
      name: "Topgolf",
      receiptTemplate: "entertainment",
      type: "entertainment",
    },
    {
      max: 420,
      min: 60,
      name: "Ticketmaster",
      receiptTemplate: "tickets",
      type: "entertainment",
    },
  ],
  general: [
    {
      max: 340,
      min: 25,
      name: "Amazon Business",
      receiptTemplate: "office",
      type: "general",
    },
    {
      max: 180,
      min: 18,
      name: "Staples",
      receiptTemplate: "office",
      type: "general",
    },
    {
      max: 140,
      min: 18,
      name: "FedEx Office",
      receiptTemplate: "printing",
      type: "general",
    },
    {
      max: 420,
      min: 60,
      name: "Best Buy Business",
      receiptTemplate: "electronics",
      type: "general",
    },
    {
      max: 210,
      min: 20,
      name: "Office Depot",
      receiptTemplate: "office",
      type: "general",
    },
  ],
  lodging: [
    {
      max: 620,
      min: 180,
      name: "Marriott Marquis",
      receiptTemplate: "hotel",
      type: "travel",
    },
    {
      max: 540,
      min: 160,
      name: "Hyatt Regency",
      receiptTemplate: "hotel",
      type: "travel",
    },
    {
      max: 420,
      min: 140,
      name: "Hilton Garden Inn",
      receiptTemplate: "hotel",
      type: "travel",
    },
    {
      max: 360,
      min: 130,
      name: "Courtyard by Marriott",
      receiptTemplate: "hotel",
      type: "travel",
    },
  ],
  meal: [
    {
      max: 38,
      min: 12,
      name: "Sweetgreen",
      receiptTemplate: "quick_meal",
      type: "restaurant",
    },
    {
      max: 24,
      min: 5,
      name: "Blue Bottle Coffee",
      receiptTemplate: "coffee",
      type: "restaurant",
    },
    {
      max: 26,
      min: 11,
      name: "Chipotle Mexican Grill",
      receiptTemplate: "quick_meal",
      type: "restaurant",
    },
    {
      max: 240,
      min: 48,
      name: "The Smith",
      receiptTemplate: "client_dinner",
      type: "restaurant",
    },
    {
      max: 680,
      min: 120,
      name: "Nobu Downtown",
      receiptTemplate: "premium_dinner",
      type: "restaurant",
    },
  ],
  software: [
    {
      max: 1800,
      min: 20,
      name: "OpenAI",
      receiptTemplate: "software",
      type: "software",
    },
    {
      max: 1500,
      min: 20,
      name: "Anthropic",
      receiptTemplate: "software",
      type: "software",
    },
    {
      max: 480,
      min: 21,
      name: "GitHub",
      receiptTemplate: "software",
      type: "software",
    },
    {
      max: 360,
      min: 18,
      name: "Notion",
      receiptTemplate: "software",
      type: "software",
    },
    {
      max: 340,
      min: 16,
      name: "Zoom",
      receiptTemplate: "software",
      type: "software",
    },
    {
      max: 520,
      min: 18,
      name: "Figma",
      receiptTemplate: "software",
      type: "software",
    },
  ],
  cash_equivalent: [
    {
      max: 350,
      min: 50,
      name: "Apple Cash",
      receiptTemplate: "cash_equivalent",
      type: "cash_equivalent",
    },
    {
      max: 500,
      min: 75,
      name: "Venmo",
      receiptTemplate: "cash_equivalent",
      type: "cash_equivalent",
    },
    {
      max: 300,
      min: 25,
      name: "Steam",
      receiptTemplate: "cash_equivalent",
      type: "cash_equivalent",
    },
    {
      max: 250,
      min: 25,
      name: "Starbucks Card",
      receiptTemplate: "cash_equivalent",
      type: "cash_equivalent",
    },
  ],
  travel: [
    {
      max: 920,
      min: 180,
      name: "United Airlines",
      receiptTemplate: "airfare",
      type: "travel",
    },
    {
      max: 880,
      min: 170,
      name: "Delta Air Lines",
      receiptTemplate: "airfare",
      type: "travel",
    },
    {
      max: 280,
      min: 40,
      name: "Amtrak",
      receiptTemplate: "rail",
      type: "travel",
    },
    {
      max: 95,
      min: 18,
      name: "Uber",
      receiptTemplate: "rideshare",
      type: "travel",
    },
    {
      max: 90,
      min: 16,
      name: "Lyft",
      receiptTemplate: "rideshare",
      type: "travel",
    },
  ],
};

function buildSpendAuditPolicy() {
  const sections = [
    `# Company Spend Audit Policy

You are reviewing one weekly company-spend batch. The batch contains both company-paid expenses and employee reimbursement requests. Your job is to surface reviewer-ready audit decisions, not to prove intent and not to rubber-stamp every line item. A case means the spend is material enough, policy-grounded enough, and evidence-supported enough to deserve manual review. A no-case decision means the spend was considered and has no material audit issue based on the available packet. This benchmark uses a simplified version of a real company-spend review workflow: expense data is queried, receipt text is analyzed, prior cases and user context can be read, and the final answer is submitted through a shared tool.

Treat company-paid card spend and reimbursement spend differently. Company-paid expenses are charges already borne by the company; the highest-value questions are whether the purchase belongs in the card workflow, whether the merchant/category is allowed, whether approval or procurement should have happened first, and whether the receipt supports the business purpose. Reimbursements are employee repayment requests; the highest-value questions are whether the employee already used a company-paid method, whether the same receipt or same purchase has already been submitted, whether the receipt is itemized and credible, and whether the amount and category are reimbursable. A reimbursement that duplicates a company-paid card expense is more serious than two harmless card lines with the same merchant name.`,
    `## 1. Evidence Hierarchy

Use concrete evidence before inference. Strong evidence includes receipt text, receipt fingerprints, duplicate proof across company-paid and reimbursement channels, same-user same-merchant clusters that appear split around review thresholds, documented prior cases, user context showing repeated policy issues, and direct policy text. Medium evidence includes unusual timing, high amounts relative to nearby user spend, weak or missing memo detail, unsupported manager-approval claims, or category mismatch. Weak evidence includes dramatic language, a well-known merchant, or a high amount without context. Do not create cases from weak evidence alone.

When evidence conflicts, name the conflict. If the expense record says "client dinner" but the receipt says stored-value card load, the receipt is stronger. If a memo claims approval but the policy requires approval to be documented in the expense record, the memo alone does not clear the issue. If web search suggests a merchant is normally a restaurant but the receipt text shows gift card reload, the receipt controls the decision. If calendar context supports travel timing but the receipt still violates a direct cash-equivalent prohibition, travel context does not waive the prohibition.`,
    `## 2. Spend Patterns To Review

Review these production-derived spend patterns:

- meals and entertainment: high-dollar meals, premium hospitality, missing attendees, unclear client purpose, alcohol-heavy receipts, weekend or late-night charges, and repeated meal reimbursements that look personal
- software and procurement: SaaS, AI tools, developer platforms, design tools, seat purchases, annual plans, or usage bursts that should have gone through procurement or invoice review instead of card spend
- travel and lodging: hotel folios, airfare, rail, lodging caps, personal incidentals, duplicate folios, weekend stays, and travel expenses with no matching business context
- rideshare: airport transfers, late-night rides, repeated rides within a short window, rides above local caps, and rides without trip purpose
- duplicate or shared receipts: one receipt fingerprint across several expenses, the same receipt attached to a reimbursement and a card charge, or two employees submitting the same underlying proof
- memo and justification issues: vague explanations, copied memos, pressure language, unsupported executive approval, missing attendees, and requests to bypass normal review
- receipt and documentation issues: missing itemization, screenshots instead of itemized receipts, mismatch between receipt and expense, older spend with no proof, and receipts that do not show total or merchant
- cash-equivalent spend: gift cards, stored-value reloads, money transfer services, prepaid cards, cash app transfers, crypto onramps, or merchant receipts that show cash-equivalent items

These patterns are not labels to match mechanically. They are a map for evidence shaping. You should group related spend when the same user, receipt, merchant, policy clause, or prior case makes the reviewer action naturally shared.`,
    `## 3. Policy Rules

Cash-equivalent purchases are not reimbursable and are not allowed on company-paid cards unless an explicit program exception appears in the expense record. This includes gift cards, stored-value reloads, person-to-person payment transfers, crypto purchases, prepaid cards, and similar instruments. If a receipt shows cash-equivalent items, create a case even if the merchant itself is normally acceptable.

Software and procurement spend above 500 dollars should normally use procurement, invoice, or approved vendor workflow. Card spend can be acceptable for small monthly subscriptions, approved team tools, or urgent business continuity when approval is documented. A large annual plan, large usage-charge spike, or new vendor without approval should usually become a case. For smaller software expenses, create a case only when there are repeated purchases, poor memo support, or prior procurement cases.

Meals under 75 dollars per person with clear business purpose and itemized receipt usually do not need a case. Meals above 150 dollars, premium venues, missing attendees, alcohol-heavy receipts, weekend entertainment, or repeated reimbursements can justify a case. A client name in the memo is helpful but not sufficient when the receipt or amount is inconsistent with the stated purpose.

Lodging should be reviewed for duplicate folios, personal incidentals, missing stay dates, unusually high nightly rate, weekend nights without business context, and reimbursement overlap with company-paid travel. A hotel receipt reused across a card expense and a reimbursement is a strong case. A high hotel amount with clear travel purpose and valid folio may be no-case.

Rideshare should be reviewed for repeated short-window rides, high-dollar rides above 120 dollars, rides late at night without travel context, and route purpose. Airport rides are common and should not be escalated without another issue. Several high rides in a short window with vague memos or prior misuse can justify a case.

Documentation failures are case-worthy when the amount is material, the receipt does not support the purchase, or the policy requires an itemized receipt. Missing documentation on a low-dollar routine expense is usually no-case or low priority unless repeated.`,
    `## 4. No-Case Discipline

The goal is not maximum case count. A good audit output creates cases for material, reviewable issues and explicitly clears routine spend. Do not escalate routine airfare, hotel, rideshare, meals, or software only because the category can be abused. Do not punish a merchant name. Do not invent approval gaps. Do not treat "reimbursement" as automatically riskier than "company-paid"; the evidence must explain why.

No-case decisions should cover the rest of the batch. It is acceptable to group no-case decisions by category, user, payment channel, or policy reason. The benchmark checks that the full batch was triaged, so the final output must make it clear that company-paid expenses and reimbursements were both reviewed. If there are unresolved limitations, put them in companySpendSummary.unresolvedLimitations rather than creating speculative cases.`,
    `## 5. Prior Cases, User Context, Web, And Calendar

Prior cases help with pattern recognition but do not substitute for current evidence. A user with previous documentation issues deserves closer review, but a current line still needs policy-grounded evidence. User context helps interpret departments, roles, travel expectations, and spend baselines. Calendar evidence can support whether travel, client meetings, or event attendance fits the expense timing. Web evidence should be used only for external facts such as merchant category, typical pricing, or public product descriptions. Do not use web search to invent internal approvals or business context.

When citing evidence, prefer references that a reviewer can verify: expense id, receipt id or receipt fingerprint, policy section, prior case id, user id, web query/source, or calendar event id. Avoid vague references like "the data" or "the policy".`,
    `## 6. Priority And Action

Use priority this way:

- critical: direct cash-equivalent spend, strong duplicate reimbursement, or material evidence of repeated misuse across channels
- high: direct policy breach over 500 dollars, duplicate/shared receipt involving material spend, procurement bypass for large software purchases, or high-dollar unsupported reimbursement
- medium: material documentation issue, repeated suspicious pattern, travel/lodging mismatch, or rideshare cluster with weak support
- low: minor policy ambiguity, incomplete memo, or documentation gap that should be sampled but is unlikely to drive immediate action

Recommended actions should be practical: request itemized receipt, ask for attendee list, confirm procurement approval, deny reimbursement, recover duplicate reimbursement, route to manager, sample similar spend, or mark no-case with limitation. Do not write generic actions like "investigate".`,
    `## 7. Submission Rules

Submit the final review through submit_review. The payload must contain decisions and companySpendSummary. Each decision has outcome "case" or "no_case". Case decisions should group related expense ids, name the issue, explain the policy-grounded evidence, and include recommendedAction. No-case decisions may group larger cohorts, but they must still identify the expense ids covered. Evidence items should be short and concrete.

Use this payload shape:
{
  "decisions": [
    {
      "outcome": "case",
      "expenseIds": ["exp_..."],
      "title": "short case title",
      "priority": "low" | "medium" | "high" | "critical",
      "tags": ["PROHIBITED_SPEND"],
      "reasoning": "short evidence-based reasoning",
      "evidence": [
        {"type": "expense", "reference": "exp_0001", "summary": "what matters"}
      ],
      "recommendedAction": "reviewer action"
    }
  ],
  "companySpendSummary": {
    "totalReviewed": 1000,
    "amountReviewedUsd": 12345.67,
    "amountAtIssueUsd": 1200.00,
    "categoriesReviewed": ["meal", "travel"],
    "notableSpendClusters": ["short descriptions"],
    "unresolvedLimitations": ["anything material the agent could not verify"]
  }
}
`,
  ];
  const policy = sections.join("\n\n");
  const wordCount = policy.split(/\s+/).filter(Boolean).length;
  if (wordCount < 1000) {
    throw new Error(
      `Spend audit policy must stay above 1000 words, got ${wordCount}`,
    );
  }
  return policy;
}

const REVIEW_POLICY = buildSpendAuditPolicy();

function printUsage() {
  console.log(`Usage: pnpm benchmark:spend-audit -- [options]

Options:
  --runs 3
  --batch-size ${DEFAULT_BATCH_SIZE}
  --schedule grouped|round-robin
  --variants tool,tool-compaction,just-bash,sandbox
  --source-dir ${DEFAULT_SOURCE_DIR}
  --week-start ${DEFAULT_WEEK_START}
  --max-expenses 1000
  --model haiku|sonnet|opus|${DEFAULT_MODEL}
  --env-file /path/to/llm-gateway.env
  --mock-llm
  --require-llm
  --skip-preflight
  --allow-provider-errors
  --provider-run-retries ${DEFAULT_PROVIDER_RUN_RETRIES}
  --no-provider-run-retries
  --only-runs 3,18,19
  --export-judge-packets
  --judge-results /path/to/judge-results.jsonl
  --judge-provider codex55
  --quality-pass-threshold 80
  --json

The benchmark anonymizes source notes into a weekly expense fixture, expands it
into a company-spend audit workload, and reports P70/P90/P95/P99 for quality,
tokens, time, and memory.
`);
}

function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    allowProviderErrors: false,
    envFile: "",
    exportJudgePackets: false,
    json: false,
    judgeProvider: "codex55",
    judgeResultsPath: "",
    maxExpenses: 1000,
    mockLlm: false,
    model: DEFAULT_MODEL,
    modelAlias: "haiku",
    modelInput: "haiku",
    outputDir: "results",
    onlyRuns: null,
    providerRunRetries: DEFAULT_PROVIDER_RUN_RETRIES,
    qualityPassThreshold: JUDGE_RUBRIC.passThreshold,
    requireLlm: false,
    runs: 3,
    schedule: "grouped",
    skipPreflight: false,
    sourceDir: DEFAULT_SOURCE_DIR,
    variants: DEFAULT_VARIANTS,
    weekStart: DEFAULT_WEEK_START,
  };

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
    } else if (arg === "--env-file") {
      options.envFile = readValue();
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--export-judge-packets") {
      options.exportJudgePackets = true;
    } else if (arg === "--judge-provider") {
      options.judgeProvider = readValue();
    } else if (arg === "--judge-results") {
      options.judgeResultsPath = readValue();
    } else if (arg === "--max-expenses") {
      options.maxExpenses = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--mock-llm") {
      options.mockLlm = true;
    } else if (arg === "--model") {
      options.model = readValue();
      options.modelInput = options.model;
    } else if (arg === "--output-dir") {
      options.outputDir = readValue();
    } else if (arg === "--only-runs") {
      options.onlyRuns = parseRunIndexes(readValue());
    } else if (arg === "--no-provider-run-retries") {
      options.providerRunRetries = 0;
    } else if (arg === "--provider-run-retries") {
      options.providerRunRetries = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--quality-pass-threshold") {
      const value = Number(readValue());
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error("--quality-pass-threshold must be between 0 and 100");
      }
      options.qualityPassThreshold = value;
    } else if (arg === "--require-llm") {
      options.requireLlm = true;
    } else if (arg === "--skip-preflight") {
      options.skipPreflight = true;
    } else if (arg === "--runs") {
      options.runs = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--schedule") {
      options.schedule = readValue();
      if (!["grouped", "round-robin"].includes(options.schedule)) {
        throw new Error("--schedule must be grouped or round-robin");
      }
    } else if (arg === "--source-dir") {
      options.sourceDir = readValue();
    } else if (arg === "--variants") {
      options.variants = readValue()
        .split(",")
        .map((variant) => {
          const normalized = variant.trim();
          if (!VALID_VARIANTS.has(normalized)) {
            throw new Error(`Unknown variant: ${normalized}`);
          }
          if (normalized === "docker") {
            return "sandbox";
          }
          return normalized;
        });
      options.variants = [...new Set(options.variants)];
    } else if (arg === "--week-start") {
      options.weekStart = readValue();
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg !== "--") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.model = resolveModelId(options.model);
  options.modelAlias = inferModelAlias(options.modelInput, options.model);

  return options;
}

function parseRunIndexes(value) {
  const indexes = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const runIndex = Number(part);
      if (!Number.isInteger(runIndex) || runIndex < 0) {
        throw new Error(
          "--only-runs must be a comma-separated list of run indexes >= 0",
        );
      }
      return runIndex;
    });
  if (indexes.length === 0) {
    throw new Error("--only-runs must include at least one run index");
  }
  return [...new Set(indexes)].sort((a, b) => a - b);
}

async function loadEnvFile(filePath) {
  if (!filePath) {
    return;
  }
  const content = await readFile(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key] === undefined) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function hashText(value, length = 12) {
  return createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, length);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] ?? "";
      });
      return item;
    });
}

function parseAmount(value, fallbackIndex) {
  const parsed = Number.parseFloat(String(value).replaceAll(",", ""));
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed * 100) / 100;
  }
  return 20 + (fallbackIndex % 50) * 7.13;
}

function extractExpenseIds(summary, fallback) {
  const ids = [...String(summary).matchAll(/expense_[a-z0-9]+/g)].map(
    (match) => match[0],
  );
  return ids.length > 0 ? [...new Set(ids)] : [fallback];
}

function makeTimestamp(dateString, dayOffset, hour, minute) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function inferCategory(summary) {
  const text = String(summary).toLowerCase();
  if (
    text.includes("hotel") ||
    text.includes("airbnb") ||
    text.includes("lodging")
  ) {
    return "lodging";
  }
  if (
    text.includes("meal") ||
    text.includes("dinner") ||
    text.includes("lunch")
  ) {
    return "meal";
  }
  if (
    text.includes("uber") ||
    text.includes("rideshare") ||
    text.includes("airfare")
  ) {
    return "travel";
  }
  if (text.includes("software") || text.includes("subscription")) {
    return "software";
  }
  if (
    text.includes("gift card") ||
    text.includes("stored value") ||
    text.includes("cash equivalent") ||
    text.includes("venmo")
  ) {
    return "cash_equivalent";
  }
  if (text.includes("receipt")) {
    return "receipt_review";
  }
  return "general";
}

function inferCityCode(index) {
  return ["sfo", "nyc", "lon", "bog", "mex", "mad", "gru", "lax"][index % 8];
}

function inferExpenseType(index, category, merchantType) {
  if (merchantType === "cash_equivalent") {
    return index % 2 === 0 ? "expense" : "reimbursement";
  }
  if (merchantType === "software") {
    return "expense";
  }
  if (category === "lodging" || category === "meal" || category === "travel") {
    return index % 3 === 0 ? "reimbursement" : "expense";
  }
  if (category === "general" || category === "receipt_review") {
    return index % 5 === 0 ? "reimbursement" : "expense";
  }
  return "expense";
}

function inferPaymentChannel(index, merchantType, expenseType) {
  if (expenseType === "reimbursement") {
    return "personal_card";
  }
  if (merchantType === "cash_equivalent") {
    return "corporate_card";
  }
  if (merchantType === "software") {
    return "invoice";
  }
  if (merchantType === "travel") {
    return index % 2 === 0 ? "corporate_card" : "virtual_card";
  }
  return "corporate_card";
}

function findMerchantProfileByName(name) {
  for (const pool of Object.values(REAL_MERCHANT_POOLS)) {
    const match = pool.find((profile) => profile.name === name);
    if (match) {
      return match;
    }
  }
  return null;
}

function selectMerchantProfile(category, summary, index) {
  const text = String(summary).toLowerCase();
  if (text.includes("uber")) {
    return findMerchantProfileByName("Uber");
  }
  if (text.includes("lyft")) {
    return findMerchantProfileByName("Lyft");
  }
  if (text.includes("united")) {
    return findMerchantProfileByName("United Airlines");
  }
  if (text.includes("delta")) {
    return findMerchantProfileByName("Delta Air Lines");
  }
  if (text.includes("marriott")) {
    return findMerchantProfileByName("Marriott Marquis");
  }
  if (text.includes("hyatt")) {
    return findMerchantProfileByName("Hyatt Regency");
  }
  if (text.includes("hilton")) {
    return findMerchantProfileByName("Hilton Garden Inn");
  }
  if (text.includes("github")) {
    return findMerchantProfileByName("GitHub");
  }
  if (text.includes("openai")) {
    return findMerchantProfileByName("OpenAI");
  }
  if (text.includes("anthropic")) {
    return findMerchantProfileByName("Anthropic");
  }
  if (text.includes("notion")) {
    return findMerchantProfileByName("Notion");
  }
  if (text.includes("figma")) {
    return findMerchantProfileByName("Figma");
  }
  if (text.includes("zoom")) {
    return findMerchantProfileByName("Zoom");
  }
  if (text.includes("venmo")) {
    return findMerchantProfileByName("Venmo");
  }
  if (text.includes("gift card") || text.includes("stored value")) {
    return findMerchantProfileByName("Apple Cash");
  }
  if (text.includes("ticket")) {
    return findMerchantProfileByName("Ticketmaster");
  }
  if (text.includes("coffee")) {
    return findMerchantProfileByName("Blue Bottle Coffee");
  }
  if (text.includes("dinner") || text.includes("meal")) {
    return findMerchantProfileByName("The Smith");
  }

  const normalizedCategory =
    category === "receipt_review" ? "general" : category;
  const pool =
    REAL_MERCHANT_POOLS[normalizedCategory] ?? REAL_MERCHANT_POOLS.general;
  return pool[index % pool.length];
}

function clampAmountForMerchant(amount, merchantProfile, index) {
  const rangeMidpoint = (merchantProfile.min + merchantProfile.max) / 2;
  const deterministicTarget =
    merchantProfile.min +
    (((index * 37) % 100) / 100) * (merchantProfile.max - merchantProfile.min);
  const blended =
    amount * 0.35 + rangeMidpoint * 0.25 + deterministicTarget * 0.4;
  return Number(
    Math.min(
      merchantProfile.max,
      Math.max(merchantProfile.min, blended),
    ).toFixed(2),
  );
}

function buildMemo(
  category,
  merchant,
  merchantType,
  summary,
  index,
  expenseType,
) {
  const text = String(summary).toLowerCase();
  if (text.includes("approval")) {
    return `manager approval referenced for ${merchant}`;
  }
  if (expenseType === "reimbursement" && category === "travel") {
    return `employee reimbursement request for ${merchant}`;
  }
  if (expenseType === "reimbursement" && category === "lodging") {
    return `hotel reimbursement submitted for ${merchant}`;
  }
  if (expenseType === "reimbursement" && category === "meal") {
    return `meal reimbursement request for ${merchant}`;
  }
  if (category === "cash_equivalent") {
    return `team incidentals handled through ${merchant}`;
  }
  if (expenseType === "reimbursement") {
    return `reimbursement request for ${merchant}`;
  }
  if (category === "travel") {
    return `travel expense for ${merchant}`;
  }
  if (category === "lodging") {
    return `hotel stay booked at ${merchant}`;
  }
  if (merchantType === "software") {
    return `${merchant} workspace subscription`;
  }
  if (index % 17 === 0) {
    return `urgent reimbursement requested for ${merchant}`;
  }
  if (category === "meal") {
    return `client meal at ${merchant}`;
  }
  return `${category} expense from ${merchant}`;
}

function loadSourceSeed(sourceSummary, object, filePath, index) {
  const sourceExpenseIds = extractExpenseIds(
    sourceSummary,
    `expense_synthetic_${hashText(`${filePath}:${index}`, 10)}`,
  );
  const category = inferCategory(sourceSummary);
  const merchantProfile = selectMerchantProfile(category, sourceSummary, index);
  return {
    amount: parseAmount(object.amount, index),
    category,
    merchant: merchantProfile.name,
    merchantProfile,
    sourceCaseIdHash: hashText(object.case_id ?? `${filePath}:${index}`, 10),
    sourceExpenseId: sourceExpenseIds[0],
    sourceFileHash: hashText(path.basename(filePath), 10),
    sourceSummary,
    sourceThemes:
      object.themes ?? object.theme_list ?? object.focus_theme ?? "",
    userHash: hashText(
      sourceSummary.match(/\(cuuser_[^)]+\)/)?.[0] ??
        sourceSummary.match(/\[([^\]]+)\]\(cuuser_[^)]+\)/)?.[1] ??
        object.case_id ??
        index,
      8,
    ),
  };
}

function formatReceiptDate(value) {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}

function splitCurrency(total, ratios) {
  const raw = ratios.map((ratio) => total * ratio);
  const rounded = raw.map((value) => Number(value.toFixed(2)));
  const diff = Number(
    (total - rounded.reduce((sum, value) => sum + value, 0)).toFixed(2),
  );
  rounded[rounded.length - 1] = Number((rounded.at(-1) + diff).toFixed(2));
  return rounded;
}

function buildReceiptLines(expense) {
  const total = expense.amountUsd;
  switch (expense.receiptTemplate) {
    case "airfare": {
      const [fare, bagFee] = splitCurrency(total, [0.88, 0.12]);
      return [
        [`Flight ${expense.cityCode.toUpperCase()} fare`, fare],
        ["Checked bag / seat selection", bagFee],
      ];
    }
    case "rail": {
      const [ticket, wifi] = splitCurrency(total, [0.9, 0.1]);
      return [
        ["Rail fare", ticket],
        ["Onboard Wi-Fi", wifi],
      ];
    }
    case "rideshare": {
      const [fare, bookingFee] = splitCurrency(total, [0.92, 0.08]);
      return [
        ["Trip fare", fare],
        ["Booking fee", bookingFee],
      ];
    }
    case "hotel": {
      const [room, tax, fees] = splitCurrency(total, [0.78, 0.16, 0.06]);
      return [
        ["Room charge", room],
        ["Occupancy tax", tax],
        ["Hotel fees", fees],
      ];
    }
    case "software": {
      const [subscription, seats] = splitCurrency(total, [0.82, 0.18]);
      return [
        ["Business subscription", subscription],
        ["Seat or usage charges", seats],
      ];
    }
    case "cash_equivalent": {
      const [storedValue, fee] = splitCurrency(total, [0.97, 0.03]);
      return [
        ["Stored-value / cash-equivalent load", storedValue],
        ["Service fee", fee],
      ];
    }
    case "office": {
      const [supplies, shipping] = splitCurrency(total, [0.86, 0.14]);
      return [
        ["Office supplies", supplies],
        ["Shipping or service fee", shipping],
      ];
    }
    case "printing": {
      const [printing, finishing] = splitCurrency(total, [0.74, 0.26]);
      return [
        ["Print job", printing],
        ["Binding / finishing", finishing],
      ];
    }
    case "electronics": {
      const [device, accessory] = splitCurrency(total, [0.8, 0.2]);
      return [
        ["Accessory or hardware", device],
        ["Protection / cable / adapter", accessory],
      ];
    }
    case "coffee": {
      const [drink, snack] = splitCurrency(total, [0.68, 0.32]);
      return [
        ["Coffee and espresso drinks", drink],
        ["Pastries", snack],
      ];
    }
    case "quick_meal": {
      const [entree, beverage] = splitCurrency(total, [0.82, 0.18]);
      return [
        ["Entree", entree],
        ["Drink / side", beverage],
      ];
    }
    case "client_dinner":
    case "premium_dinner": {
      const [food, beverage, taxTip] = splitCurrency(total, [0.62, 0.16, 0.22]);
      return [
        ["Food", food],
        ["Beverage", beverage],
        ["Tax and gratuity", taxTip],
      ];
    }
    case "entertainment":
    case "hospitality":
    case "tickets": {
      const [base, fees] = splitCurrency(total, [0.84, 0.16]);
      return [
        ["Admission or hospitality charge", base],
        ["Fees and taxes", fees],
      ];
    }
    default:
      return [["Business charge", total]];
  }
}

function buildReceiptText(expense) {
  if (expense.receiptStatus === "missing") {
    return [
      "Receipt unavailable",
      `Expense id: ${expense.expenseId}`,
      `Merchant claimed by submitter: ${expense.merchant}`,
      `Amount: $${expense.amountUsd.toFixed(2)}`,
      `Memo: ${expense.memo}`,
    ].join("\n");
  }
  const location =
    CITY_NAMES[expense.cityCode] ?? expense.cityCode.toUpperCase();
  const receiptNumber = `RCPT-${hashText(expense.receiptFingerprint, 6).toUpperCase()}`;
  const lines = buildReceiptLines(expense)
    .map(([label, amount]) => `${label}: $${amount.toFixed(2)}`)
    .join("\n");
  const cardSuffix =
    1000 + (Number.parseInt(hashText(expense.userId, 2), 16) % 9000);
  const paymentLine =
    expense.expenseType === "reimbursement"
      ? `Original payment: Personal Visa **** ${cardSuffix}`
      : `Paid with: ${
          expense.paymentChannel === "invoice"
            ? "Invoice"
            : `Corporate Visa **** ${cardSuffix}`
        }`;
  const submissionLine =
    expense.expenseType === "reimbursement"
      ? "Submission type: Employee reimbursement request"
      : "Submission type: Company-paid expense";
  return [
    expense.merchant,
    `Location: ${location}`,
    `Receipt #: ${receiptNumber}`,
    `Date: ${formatReceiptDate(expense.purchasedAt)}`,
    expense.receiptStatus === "non_itemized"
      ? "Non-itemized receipt image: total only"
      : lines,
    `Total: $${expense.amountUsd.toFixed(2)}`,
    paymentLine,
    submissionLine,
    `Memo: ${expense.memo}`,
  ].join("\n");
}

function buildReceiptsByExpenseId(expenses) {
  const receiptTextsByFingerprint = new Map();
  const receiptsByExpenseId = {};
  for (const expense of expenses) {
    if (!receiptTextsByFingerprint.has(expense.receiptFingerprint)) {
      receiptTextsByFingerprint.set(
        expense.receiptFingerprint,
        buildReceiptText(expense),
      );
    }
    receiptsByExpenseId[expense.expenseId] = receiptTextsByFingerprint.get(
      expense.receiptFingerprint,
    );
  }
  return receiptsByExpenseId;
}

function pickReceiptExpenseIds(
  packet,
  limit = DEFAULT_RECEIPT_ANALYSIS_SAMPLE_SIZE,
) {
  const ids = [];
  const seen = new Set();
  for (const cluster of packet.riskClusters ?? packet.candidates ?? []) {
    for (const expenseId of cluster.expenseIds ?? []) {
      if (seen.has(expenseId)) {
        continue;
      }
      seen.add(expenseId);
      ids.push(expenseId);
      if (ids.length >= limit) {
        return ids;
      }
    }
  }
  return ids;
}

function attachReceiptEvidence(packet, receiptResults) {
  return {
    ...packet,
    receiptEvidence: receiptResults.map((result) => ({
      expenseId: result.expenseId,
      receiptText: result.receiptText,
    })),
  };
}

function buildAnalyzeReceiptShellCommand(expenseIds) {
  if (expenseIds.length === 0) {
    return `printf '{"results":[]}\n'`;
  }
  return `analyze_receipt ${expenseIds.join(" ")}`;
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildSpendAuditPacket(expenses, policy) {
  const userAmounts = new Map();
  const receiptGroups = new Map();
  const dayGroups = new Map();
  const merchantUserGroups = new Map();

  for (const expense of expenses) {
    const amounts = userAmounts.get(expense.userId) ?? [];
    amounts.push(expense.amountUsd);
    userAmounts.set(expense.userId, amounts);

    const receiptGroup = receiptGroups.get(expense.receiptFingerprint) ?? [];
    receiptGroup.push(expense);
    receiptGroups.set(expense.receiptFingerprint, receiptGroup);

    const dayKey = `${expense.userId}|${expense.merchant}|${expense.purchasedAt.slice(0, 10)}`;
    const dayGroup = dayGroups.get(dayKey) ?? [];
    dayGroup.push(expense);
    dayGroups.set(dayKey, dayGroup);

    const merchantUserKey = `${expense.userId}|${expense.merchant}`;
    const merchantUserGroup = merchantUserGroups.get(merchantUserKey) ?? [];
    merchantUserGroup.push(expense);
    merchantUserGroups.set(merchantUserKey, merchantUserGroup);
  }

  const userMedians = new Map(
    [...userAmounts.entries()].map(([userId, amounts]) => [
      userId,
      median(amounts),
    ]),
  );

  const riskClusters = new Map();
  const upsertRiskCluster = (riskCluster) => {
    const key = `${riskCluster.kind}|${[...riskCluster.expenseIds].sort().join("|")}`;
    const existing = riskClusters.get(key);
    if (!existing || riskCluster.riskScore > existing.riskScore) {
      riskClusters.set(key, riskCluster);
    }
  };

  for (const group of receiptGroups.values()) {
    if (group.length < 2) {
      continue;
    }
    const expenseTypes = [
      ...new Set(group.map((expense) => expense.expenseType)),
    ];
    upsertRiskCluster({
      expenseIds: group.map((expense) => expense.expenseId),
      expenseTypes,
      kind: "duplicate_shared_receipt",
      merchant: group[0].merchant,
      policyBasis:
        "duplicate/shared receipts require manual review, especially across payment channels",
      recommendedAction:
        "verify original payment source and deny or recover any duplicate reimbursement",
      reasonSignals:
        expenseTypes.length > 1
          ? [
              "shared receipt fingerprint",
              "reimbursement overlaps prior company-paid expense",
            ]
          : ["shared receipt fingerprint", "multiple submissions"],
      riskScore: 95,
      title: "Duplicate or shared receipt evidence",
      totalAmountUsd: Number(
        group.reduce((sum, expense) => sum + expense.amountUsd, 0).toFixed(2),
      ),
      userId: group[0].userId,
    });
  }

  for (const group of dayGroups.values()) {
    const ordered = [...group].sort((left, right) =>
      left.purchasedAt.localeCompare(right.purchasedAt),
    );
    const totalAmountUsd = Number(
      ordered.reduce((sum, expense) => sum + expense.amountUsd, 0).toFixed(2),
    );
    if (
      ordered.length >= 2 &&
      totalAmountUsd >= 500 &&
      ordered.every(
        (expense) => expense.amountUsd >= 180 && expense.amountUsd <= 500,
      )
    ) {
      upsertRiskCluster({
        expenseIds: ordered.map((expense) => expense.expenseId),
        expenseTypes: [
          ...new Set(ordered.map((expense) => expense.expenseType)),
        ],
        kind: "threshold_splitting",
        merchant: ordered[0].merchant,
        policyBasis:
          "split purchases that appear designed to avoid review require a case",
        recommendedAction:
          "review whether the purchases were one transaction split for approval avoidance",
        reasonSignals: [
          "same-day split pattern",
          "amounts just below threshold",
        ],
        riskScore: 82,
        title: "Possible threshold splitting",
        totalAmountUsd,
        userId: ordered[0].userId,
      });
    }
    const windowHours =
      (new Date(ordered.at(-1).purchasedAt).getTime() -
        new Date(ordered[0].purchasedAt).getTime()) /
      (60 * 60 * 1000);
    if (ordered.length >= 3 && totalAmountUsd >= 250 && windowHours <= 6) {
      upsertRiskCluster({
        expenseIds: ordered.map((expense) => expense.expenseId),
        expenseTypes: [
          ...new Set(ordered.map((expense) => expense.expenseType)),
        ],
        kind: "merchant_burst",
        merchant: ordered[0].merchant,
        policyBasis:
          "short-window same-user bursts can be case-worthy when paired with weak support",
        recommendedAction:
          "request business purpose and check whether the expenses belong to one event",
        reasonSignals: ["merchant burst", "compressed activity window"],
        riskScore: 58,
        title: "Compressed merchant burst",
        totalAmountUsd,
        userId: ordered[0].userId,
      });
    }
  }

  for (const expense of expenses) {
    const userMedian = Math.max(userMedians.get(expense.userId) ?? 0, 1);
    const base = {
      expenseIds: [expense.expenseId],
      expenseTypes: [expense.expenseType],
      merchant: expense.merchant,
      totalAmountUsd: expense.amountUsd,
      userId: expense.userId,
    };
    const memo = expense.memo.toLowerCase();
    if (
      expense.category === "cash_equivalent" ||
      expense.merchantType === "cash_equivalent"
    ) {
      upsertRiskCluster({
        ...base,
        kind: "cash_equivalent",
        policyBasis:
          "cash-equivalent purchases are prohibited without explicit exception",
        recommendedAction:
          "deny or recover the spend unless an approved program exception exists",
        reasonSignals: [
          "receipt or merchant category indicates stored-value or cash-equivalent spend",
        ],
        riskScore: 98,
        title: "Cash-equivalent spend",
      });
    }
    if (expense.merchantType === "software" && expense.amountUsd >= 500) {
      upsertRiskCluster({
        ...base,
        kind: "software_procurement",
        policyBasis:
          "software spend above 500 dollars normally requires procurement or invoice workflow",
        recommendedAction:
          "confirm procurement approval or route to vendor-management review",
        reasonSignals: ["software purchase above procurement/card threshold"],
        riskScore: expense.amountUsd >= 1000 ? 86 : 78,
        title: "Software spend may need procurement",
      });
    }
    if (expense.category === "meal" && expense.amountUsd >= 150) {
      upsertRiskCluster({
        ...base,
        kind: "meal_entertainment",
        policyBasis:
          "high-dollar meals require clear business purpose and itemized support",
        recommendedAction:
          "request attendee list, client purpose, and itemized receipt review",
        reasonSignals: [
          "high-dollar meal or entertainment expense",
          "attendee/client purpose needs support",
        ],
        riskScore: expense.amountUsd >= 500 ? 84 : 70,
        title: "Meal or entertainment support needed",
      });
    }
    if (expense.category === "lodging" && expense.amountUsd >= 650) {
      upsertRiskCluster({
        ...base,
        kind: "travel_lodging",
        policyBasis: "lodging over cap requires documented business context",
        recommendedAction:
          "confirm stay dates, nightly rate, and travel purpose",
        reasonSignals: ["lodging amount above normal cap"],
        riskScore: 74,
        title: "High lodging spend needs context",
      });
    }
    if (
      ["Uber", "Lyft"].includes(expense.merchant) &&
      expense.amountUsd >= 120
    ) {
      upsertRiskCluster({
        ...base,
        kind: "rideshare_transport",
        policyBasis:
          "high rideshare spend requires trip purpose and travel context",
        recommendedAction: "request route purpose and travel event context",
        reasonSignals: ["rideshare charge above local review cap"],
        riskScore: 68,
        title: "High rideshare charge",
      });
    }
    if (
      ["missing", "non_itemized"].includes(expense.receiptStatus) &&
      expense.amountUsd >= 75
    ) {
      upsertRiskCluster({
        ...base,
        kind: "receipt_documentation",
        policyBasis: "material expenses require itemized receipt support",
        recommendedAction:
          "request itemized receipt or deny if documentation cannot be produced",
        reasonSignals: [
          "receipt is missing or non-itemized for material spend",
        ],
        riskScore: 72,
        title: "Receipt documentation gap",
      });
    }
    if (
      expense.amountUsd >= Math.max(400, userMedian * 4) &&
      (memo.includes("ceo approved") ||
        memo.includes("urgent reimbursement") ||
        memo.includes("lost receipt") ||
        memo.includes("sync issue"))
    ) {
      upsertRiskCluster({
        ...base,
        kind: "memo_justification",
        policyBasis:
          "memo language is not approval and does not clear material unsupported spend",
        recommendedAction:
          "request documented approval and supporting business context",
        reasonSignals: [
          "material user-level outlier",
          "memo uses pressure language or weak explanation",
        ],
        riskScore: 76,
        title: "Weak memo on material spend",
      });
    }
  }

  const riskClusterList = [...riskClusters.values()]
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        right.totalAmountUsd - left.totalAmountUsd ||
        left.expenseIds[0].localeCompare(right.expenseIds[0]),
    )
    .slice(0, 48);

  const countsByKind = riskClusterList.reduce((accumulator, cluster) => {
    accumulator[cluster.kind] = (accumulator[cluster.kind] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    riskClusters: riskClusterList,
    summary: {
      amountReviewedUsd: Number(
        expenses
          .reduce((sum, expense) => sum + expense.amountUsd, 0)
          .toFixed(2),
      ),
      caseClusterCount: riskClusterList.length,
      countsByKind,
      countsByExpenseType: expenses.reduce((accumulator, expense) => {
        accumulator[expense.expenseType] =
          (accumulator[expense.expenseType] ?? 0) + 1;
        return accumulator;
      }, {}),
      expenseCount: expenses.length,
      policyWordCount: policy.split(/\s+/).filter(Boolean).length,
      userCount: userAmounts.size,
    },
  };
}

function priorityForRiskScore(riskScore) {
  if (riskScore >= 95) {
    return "critical";
  }
  if (riskScore >= 82) {
    return "high";
  }
  if (riskScore >= 65) {
    return "medium";
  }
  return "low";
}

function tagsForRiskKind(kind) {
  return (
    {
      cash_equivalent: ["PROHIBITED_SPEND"],
      duplicate_shared_receipt: ["POTENTIAL_ABUSE", "ABNORMAL_PATTERN"],
      meal_entertainment: ["BUSINESS_JUSTIFICATION"],
      memo_justification: ["BUSINESS_JUSTIFICATION"],
      merchant_burst: ["ABNORMAL_PATTERN"],
      receipt_documentation: ["MISSING_DOCUMENTATION"],
      rideshare_transport: ["ABNORMAL_PATTERN"],
      software_procurement: ["PROCUREMENT_REQUIRED"],
      threshold_splitting: ["POTENTIAL_ABUSE", "ABNORMAL_PATTERN"],
      travel_lodging: ["BUSINESS_JUSTIFICATION"],
    }[kind] ?? ["POLICY_REVIEW"]
  );
}

function decisionFromRiskCluster(cluster) {
  const expenseIds = [...cluster.expenseIds].sort();
  return {
    evidence: [
      ...expenseIds.slice(0, 12).map((expenseId) => ({
        reference: expenseId,
        summary: `Included in ${cluster.kind} cluster`,
        type: "expense",
      })),
      {
        reference: cluster.kind,
        summary: cluster.policyBasis,
        type: "policy",
      },
    ],
    expenseIds,
    outcome: "case",
    priority: priorityForRiskScore(cluster.riskScore),
    reasoning: cluster.reasonSignals.join("; "),
    recommendedAction: cluster.recommendedAction,
    tags: tagsForRiskKind(cluster.kind),
    title: cluster.title,
  };
}

function buildReviewSubmissionDraft(packet, expenses) {
  const caseExpenseIds = new Set(
    (packet.riskClusters ?? []).flatMap((cluster) => cluster.expenseIds),
  );
  const noCaseExpenseIds = expenses
    .map((expense) => expense.expenseId)
    .filter((expenseId) => !caseExpenseIds.has(expenseId));
  const noCaseDecisions = [];
  for (let index = 0; index < noCaseExpenseIds.length; index += 200) {
    noCaseDecisions.push({
      evidence: [
        {
          reference: "no_case_discipline",
          summary:
            "Routine spend should be cleared when evidence does not support a case.",
          type: "policy",
        },
      ],
      expenseIds: noCaseExpenseIds.slice(index, index + 200),
      outcome: "no_case",
      priority: "low",
      reasoning:
        "Reviewed as part of full-batch company spend triage; no material policy-grounded case evidence surfaced for this cohort.",
      recommendedAction: "no reviewer action",
      tags: ["NO_CASE"],
      title: "No material issue in reviewed cohort",
    });
  }
  const amountAtIssueUsd = Number(
    expenses
      .filter((expense) => caseExpenseIds.has(expense.expenseId))
      .reduce((sum, expense) => sum + expense.amountUsd, 0)
      .toFixed(2),
  );
  return {
    companySpendSummary: {
      amountAtIssueUsd,
      amountReviewedUsd: packet.summary.amountReviewedUsd,
      categoriesReviewed: [
        ...new Set(expenses.map((expense) => expense.category)),
      ].sort(),
      notableSpendClusters: (packet.riskClusters ?? [])
        .slice(0, 12)
        .map(
          (cluster) =>
            `${cluster.title}: ${[...cluster.expenseIds].sort().slice(0, 4).join(",")}`,
        ),
      totalReviewed: expenses.length,
      unresolvedLimitations: [],
    },
    decisions: [
      ...(packet.riskClusters ?? []).map(decisionFromRiskCluster),
      ...noCaseDecisions,
    ],
  };
}

function buildExpectedReview({ expenses, packet }) {
  const expenseById = new Map(
    expenses.map((expense) => [expense.expenseId, expense]),
  );
  const cases = packet.riskClusters.map((cluster) => ({
    amountUsd: cluster.totalAmountUsd,
    expenseIds: [...cluster.expenseIds].sort(),
    expenseTypes: cluster.expenseTypes,
    kind: cluster.kind,
    merchant: cluster.merchant,
    reason: cluster.reasonSignals.join("; "),
    reasonSignals: cluster.reasonSignals,
    riskScore: cluster.riskScore,
    users: [
      ...new Set(
        cluster.expenseIds
          .map((expenseId) => expenseById.get(expenseId)?.userId)
          .filter(Boolean),
      ),
    ].sort(),
  }));

  return {
    candidates: cases,
    cases,
    generatedBy: "deterministic_full_batch_triage",
    summary: {
      candidateCount: cases.length,
      caseCount: cases.length,
      expenseCount: expenses.length,
      expectedExpenseIdCount: new Set(
        cases.flatMap((candidate) => candidate.expenseIds),
      ).size,
      kinds: cases.reduce((counts, expectedCase) => {
        counts[expectedCase.kind] = (counts[expectedCase.kind] ?? 0) + 1;
        return counts;
      }, {}),
    },
  };
}

function injectSpendAuditPatterns(expenses, weekStart) {
  const expectedSpendSignals = [];

  for (let index = 24; index < expenses.length; index += 57) {
    const original = expenses[index - 1];
    const target = expenses[index];
    target.userId = original.userId;
    original.category = "travel";
    original.cityCode = "sfo";
    original.expenseType = "expense";
    original.merchant = "United Airlines";
    original.merchantType = "travel";
    original.amountUsd = 486.72;
    original.paymentChannel = "corporate_card";
    original.receiptTemplate = "airfare";
    target.category = "travel";
    target.cityCode = "sfo";
    target.expenseType = "reimbursement";
    target.merchant = "United Airlines";
    target.merchantType = "travel";
    target.receiptFingerprint = original.receiptFingerprint;
    target.amountUsd = 481.85;
    target.paymentChannel = "personal_card";
    target.receiptTemplate = "airfare";
    target.memo =
      "resubmitting after sync issue; CEO approved the reimbursement";
    target.receiptStatus = "attached";
    expectedSpendSignals.push({
      expenseIds: [original.expenseId, target.expenseId],
      kind: "duplicate_shared_receipt",
    });
  }

  for (let index = 40; index + 2 < expenses.length; index += 79) {
    const userId = expenses[index].userId;
    const date = expenses[index].purchasedAt.slice(0, 10);
    const cluster = [expenses[index], expenses[index + 1], expenses[index + 2]];
    const amounts = [244.21, 248.19, 251.08];
    cluster.forEach((expense, clusterIndex) => {
      expense.userId = userId;
      expense.cityCode = "nyc";
      expense.merchant = "The Smith";
      expense.category = "meal";
      expense.expenseType = "reimbursement";
      expense.merchantType = "restaurant";
      expense.amountUsd = amounts[clusterIndex];
      expense.paymentChannel = "personal_card";
      expense.purchasedAt = makeTimestamp(
        date,
        0,
        12 + clusterIndex,
        10 + clusterIndex * 11,
      );
      expense.receiptTemplate = "client_dinner";
      expense.memo = "client dinner reimbursement";
      expense.receiptStatus = "attached";
    });
    expectedSpendSignals.push({
      expenseIds: cluster.map((expense) => expense.expenseId),
      kind: "threshold_splitting",
    });
  }

  for (let index = 55; index < expenses.length; index += 149) {
    const expense = expenses[index];
    expense.amountUsd = 1485 + (index % 5) * 110;
    expense.category = "meal";
    expense.cityCode = "lax";
    expense.expenseType = "reimbursement";
    expense.merchant = "Soho House";
    expense.merchantType = "entertainment";
    expense.paymentChannel = "personal_card";
    expense.purchasedAt = makeTimestamp(
      weekStart ?? DEFAULT_WEEK_START,
      index % 7,
      2,
      15,
    );
    expense.receiptTemplate = "hospitality";
    expense.receiptStatus = "missing";
    expense.memo = "urgent reimbursement, lost receipt, CEO approved";
    expectedSpendSignals.push({
      expenseIds: [expense.expenseId],
      kind: "memo_justification",
    });
  }

  for (let index = 70; index + 2 < expenses.length; index += 131) {
    const userId = expenses[index].userId;
    const cluster = [expenses[index], expenses[index + 1], expenses[index + 2]];
    cluster.forEach((expense, clusterIndex) => {
      expense.userId = userId;
      expense.cityCode = "sfo";
      expense.expenseType = "expense";
      expense.merchant = "Uber";
      expense.merchantType = "travel";
      expense.amountUsd = 96 + clusterIndex * 18;
      expense.paymentChannel = "corporate_card";
      expense.purchasedAt = makeTimestamp(
        expense.purchasedAt.slice(0, 10),
        0,
        23,
        clusterIndex * 25,
      );
      expense.receiptTemplate = "rideshare";
      expense.receiptStatus = "attached";
      expense.memo =
        clusterIndex === 2
          ? "urgent reimbursement after system issue"
          : "late-night airport transfer";
    });
    expectedSpendSignals.push({
      expenseIds: cluster.map((expense) => expense.expenseId),
      kind: "merchant_burst",
    });
  }

  for (let index = 86; index < expenses.length; index += 137) {
    const expense = expenses[index];
    expense.amountUsd = 1299 + (index % 4) * 150;
    expense.category = "software";
    expense.cityCode = "sfo";
    expense.expenseType = "expense";
    expense.merchant = index % 2 === 0 ? "OpenAI" : "Anthropic";
    expense.merchantType = "software";
    expense.paymentChannel = "corporate_card";
    expense.receiptTemplate = "software";
    expense.receiptStatus = "attached";
    expense.memo = "team AI workspace annual plan";
    expectedSpendSignals.push({
      expenseIds: [expense.expenseId],
      kind: "software_procurement",
    });
  }

  for (let index = 96; index < expenses.length; index += 173) {
    const expense = expenses[index];
    expense.amountUsd = 220 + (index % 3) * 70;
    expense.category = "cash_equivalent";
    expense.cityCode = "sfo";
    expense.expenseType = index % 2 === 0 ? "expense" : "reimbursement";
    expense.merchant = index % 2 === 0 ? "Apple Cash" : "Venmo";
    expense.merchantType = "cash_equivalent";
    expense.paymentChannel =
      expense.expenseType === "reimbursement"
        ? "personal_card"
        : "corporate_card";
    expense.receiptTemplate = "cash_equivalent";
    expense.receiptStatus = "attached";
    expense.memo = "team incidentals stored value load";
    expectedSpendSignals.push({
      expenseIds: [expense.expenseId],
      kind: "cash_equivalent",
    });
  }

  for (let index = 104; index < expenses.length; index += 167) {
    const expense = expenses[index];
    expense.amountUsd = 640 + (index % 6) * 45;
    expense.category = "meal";
    expense.cityCode = "nyc";
    expense.expenseType = "reimbursement";
    expense.merchant = "Nobu Downtown";
    expense.merchantType = "restaurant";
    expense.paymentChannel = "personal_card";
    expense.receiptTemplate = "premium_dinner";
    expense.receiptStatus = "non_itemized";
    expense.memo = "client dinner";
    expectedSpendSignals.push({
      expenseIds: [expense.expenseId],
      kind: "meal_entertainment",
    });
  }

  for (let index = 118; index < expenses.length; index += 191) {
    const expense = expenses[index];
    expense.amountUsd = 760 + (index % 4) * 110;
    expense.category = "lodging";
    expense.cityCode = "lax";
    expense.expenseType = "reimbursement";
    expense.merchant = "Marriott Marquis";
    expense.merchantType = "travel";
    expense.paymentChannel = "personal_card";
    expense.receiptTemplate = "hotel";
    expense.receiptStatus = "attached";
    expense.memo = "hotel reimbursement submitted for conference";
    expectedSpendSignals.push({
      expenseIds: [expense.expenseId],
      kind: "travel_lodging",
    });
  }

  return expectedSpendSignals;
}

function buildUsers(expenses) {
  const roles = [
    "Account Executive",
    "Software Engineer",
    "Product Manager",
    "Customer Success Manager",
    "Recruiter",
    "Finance Manager",
  ];
  const departments = [
    "Sales",
    "Engineering",
    "Product",
    "Customer Success",
    "People",
    "Finance",
  ];
  const users = {};
  for (const expense of expenses) {
    if (users[expense.userId]) {
      continue;
    }
    const seed = Number.parseInt(hashText(expense.userId, 4), 16);
    users[expense.userId] = {
      department: departments[seed % departments.length],
      homeCity: CITY_NAMES[expense.cityCode] ?? "San Francisco, CA",
      managerUserId: `manager_${hashText(`${expense.userId}:manager`, 6)}`,
      monthlySpendBaselineUsd: 600 + (seed % 12) * 175,
      role: roles[seed % roles.length],
      userId: expense.userId,
    };
  }
  return users;
}

function buildPriorCases(expenses) {
  const cases = [];
  const seenUsers = new Set();
  for (const expense of expenses) {
    if (seenUsers.has(expense.userId)) {
      continue;
    }
    seenUsers.add(expense.userId);
    const seed = Number.parseInt(hashText(expense.userId, 4), 16);
    if (seed % 5 !== 0) {
      continue;
    }
    cases.push({
      caseId: `case_${hashText(`${expense.userId}:prior`, 8)}`,
      createdAt: makeTimestamp(DEFAULT_WEEK_START, -14 - (seed % 21), 16, 0),
      outcome: seed % 2 === 0 ? "policy_warning" : "no_case",
      summary:
        seed % 2 === 0
          ? "Prior reviewer warning for weak receipt documentation on material spend."
          : "Prior sampled travel spend had sufficient business context.",
      userId: expense.userId,
    });
  }
  return cases.slice(0, 80);
}

function buildCalendarEventsByUserId(expenses) {
  const eventsByUserId = {};
  for (const expense of expenses) {
    if (!["travel", "lodging", "meal"].includes(expense.category)) {
      continue;
    }
    const events = eventsByUserId[expense.userId] ?? [];
    if (events.length >= 3) {
      continue;
    }
    events.push({
      cityCode: expense.cityCode,
      endAt: makeTimestamp(expense.purchasedAt.slice(0, 10), 0, 18, 0),
      eventId: `cal_${hashText(`${expense.userId}:${expense.purchasedAt}:${events.length}`, 8)}`,
      startAt: makeTimestamp(expense.purchasedAt.slice(0, 10), 0, 9, 0),
      summary:
        expense.category === "meal"
          ? "Customer onsite and dinner block"
          : "Business travel block",
    });
    eventsByUserId[expense.userId] = events;
  }
  return eventsByUserId;
}

async function buildAnonymizedFixture(options) {
  const sourceFiles = (
    await runProcess("find", [
      options.sourceDir,
      "-maxdepth",
      "1",
      "-type",
      "f",
      "-name",
      "*.csv",
    ])
  ).stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();

  const sourceSeeds = [];
  for (const filePath of sourceFiles) {
    const objects = rowsToObjects(parseCsv(await readFile(filePath, "utf8")));
    objects.forEach((object, index) => {
      sourceSeeds.push(
        loadSourceSeed(object.summary ?? "", object, filePath, index),
      );
    });
  }

  if (sourceSeeds.length === 0) {
    throw new Error(`No CSV source rows found under ${options.sourceDir}`);
  }

  const expenses = [];
  for (let index = 0; index < options.maxExpenses; index++) {
    const seed = sourceSeeds[index % sourceSeeds.length];
    const generation = Math.floor(index / sourceSeeds.length);
    const category = seed.category;
    const cityCode = inferCityCode(index + generation);
    const merchantProfile =
      seed.merchantProfile ??
      selectMerchantProfile(category, seed.sourceSummary, index);
    const merchantType = merchantProfile.type;
    const expenseType = inferExpenseType(
      index + generation,
      category,
      merchantType,
    );
    const amountDelta = ((index % 9) - 4) * 4.37 + generation * 1.15;
    const amountUsd = clampAmountForMerchant(
      Math.max(18, Number((seed.amount + amountDelta).toFixed(2))),
      merchantProfile,
      index + generation,
    );
    expenses.push({
      amountUsd,
      category,
      cityCode,
      expenseId: `exp_${String(index + 1).padStart(4, "0")}`,
      expenseType,
      memo: buildMemo(
        category,
        merchantProfile.name,
        merchantType,
        seed.sourceSummary,
        index,
        expenseType,
      ),
      merchant: merchantProfile.name,
      merchantType,
      paymentChannel: inferPaymentChannel(index, merchantType, expenseType),
      purchasedAt: makeTimestamp(
        options.weekStart,
        index % 7,
        (8 + ((index * 3) % 11)) % 24,
        (index * 13) % 60,
      ),
      receiptFingerprint: `receipt_${hashText(`${seed.sourceExpenseId}:${generation}`, 10)}`,
      receiptStatus:
        index % 41 === 0
          ? "non_itemized"
          : index % 67 === 0
            ? "missing"
            : "attached",
      sourceCaseIdHash: seed.sourceCaseIdHash,
      sourceFileHash: seed.sourceFileHash,
      sourceThemes: seed.sourceThemes,
      receiptTemplate: merchantProfile.receiptTemplate,
      userId: `user_${seed.userHash}`,
    });
  }

  const expectedSpendSignals = injectSpendAuditPatterns(
    expenses,
    options.weekStart,
  );
  const receiptsByExpenseId = buildReceiptsByExpenseId(expenses);
  const packet = buildSpendAuditPacket(expenses, REVIEW_POLICY);
  const users = buildUsers(expenses);
  const priorCases = buildPriorCases(expenses);
  const calendarEventsByUserId = buildCalendarEventsByUserId(expenses);

  return {
    calendarEventsByUserId,
    expenses,
    expectedReview: buildExpectedReview({ expenses, packet }),
    expectedSpendSignals,
    packet,
    policy: REVIEW_POLICY,
    priorCases,
    receiptsByExpenseId,
    source: {
      anonymized: true,
      sourceDir: options.sourceDir,
      sourceFileCount: sourceFiles.length,
      weekStart: options.weekStart,
    },
    users,
  };
}

function buildReviewPrompt({ packet, policy, variant, webContext = "" }) {
  const sections = [
    `You are the company spend audit reviewer agent for ${TASK_ID}.`,
    "Review the weekly company-paid expenses and reimbursement requests for policy-grounded case and no-case decisions.",
    "The full weekly dataset is larger, but the benchmark narrows it to suspicious clusters and summary stats before the final review pass.",
    "Use the policy exactly. Submit findings through submit_review when that tool is available.",
    `Runtime surface: ${isNativeToolVariant(variant) ? "native tools" : "bash"}.`,
    "",
    "Policy:",
    policy,
    "",
  ];
  if (webContext) {
    sections.push("Optional public web context:", webContext, "");
  }
  sections.push("Company Spend Audit Packet JSON:", JSON.stringify(packet));
  return sections.join("\n");
}

const SHELL_REVIEWER_TOOL_DESCRIPTION =
  `Run bash commands in the review workspace. ${describeSpendAuditWorkbench()} ` +
  "/workspace/expenses.json is a JSON array. Start with get_expenses --overview for compact rows, and keep stdout compact and machine-readable. Use python3, jq, or shell commands to perform your own triage instead of dumping the whole dataset.";

const SHELL_REVIEWER_SYSTEM_INSTRUCTIONS =
  "You have one bash tool in a review workspace. Use /workspace/expenses.json, /workspace/policy.md, user/prior-case/calendar files or CLIs, analyze_receipt, submit_review, and python3. /workspace/expenses.json is a JSON array. Start with get_expenses --overview --limit 250 --offset 0 and paginate compact rows; use --detailed only for selected ids. Write your own filtering/grouping logic in bash or python3, but print only compact summaries or write intermediate artifacts to /tmp. web_search is available if public context would materially help. Run web_search and submit_review as their own standalone bash commands, not inside a larger script or compound command. Run submit_review /tmp/submission.json and use its stdout feedback to repair rejected submissions.";

const SHELL_REVIEWER_TASK_PROMPT =
  "Use the bash tool to read the full expense batch, perform spend triage yourself with python3 or shell commands, inspect receipt evidence, write the final submission JSON to /tmp/submission.json, then run submit_review /tmp/submission.json inside bash. Do not print raw expense records or the full submission JSON to stdout. If submit_review rejects it, repair the JSON and run submit_review again.";

const MAX_REVIEW_AGENT_STEPS = 40;

function buildReviewerAgentPrompt({
  expenseCount,
  includeWebSearch,
  runtimeVariant,
  shellInstructions = "",
}) {
  const lines = [
    `You are the company spend audit reviewer agent for ${TASK_ID}.`,
    `You are reviewing one weekly batch with ${expenseCount} expenses and reimbursements.`,
    "The batch is not embedded inline. You must fetch or read the available expense dataset through your runtime surface before answering.",
    "The benchmark is testing runtime consistency and audit quality. Use the full-batch review to create candidate clusters, then prune those clusters into reviewer-ready decisions.",
    "A candidate cluster is not automatically a case. A case should include only expense ids with material, policy-grounded, directly supported evidence. Weak heuristic matches, adjacent spend, or unverified pattern members belong in companySpendSummary.notableSpendClusters or unresolvedLimitations, not in case decisions.",
    "At minimum, read the policy, inspect expense data, and use analyze_receipt for representative expense ids from every case group before submitting.",
    "The final submission must include case and no_case decisions plus companySpendSummary.",
    `Before calling submit_review, verify the union of all decision expenseIds contains exactly ${expenseCount} unique in-scope expense ids. Missing even one expense id is an incomplete audit.`,
    "Use only exact expense ids from the fetched dataset. Valid ids look like exp_0001. Do not renumber, abbreviate, or invent ids such as E001.",
    "Every decision, including grouped no_case decisions, must include outcome, expenseIds, reasoning, evidence, and tags. Case decisions should also include title, priority, and recommendedAction.",
    "Never call submit_review with placeholder, test, or knowingly incomplete data. If you are blocked, keep gathering or repairing evidence until the submission is valid.",
    "When you are done, call submit_review with the final audit decisions. Do not write final JSON or a prose answer instead of calling submit_review.",
    `Runtime surface: ${isNativeToolVariant(runtimeVariant) ? "native tools" : "bash"}.`,
  ];
  if (isNativeToolVariant(runtimeVariant)) {
    lines.push(
      `Required native flow: fetch the full expense batch through get_expenses with detailLevel "overview", choosing limit and offset values that keep your context manageable until all ${expenseCount} expenses are covered. Use overview for full-batch grouping and counts; call get_expenses with detailLevel "detailed" only for selected expense ids or narrow filters that need every field. Then do the spend triage yourself: group shared receipt fingerprints, cash-equivalent spend, procurement issues, travel/lodging, receipts, memos, and reimbursement-vs-company-paid overlap. Inspect representative receipts before calling submit_review.`,
      "Before submitting, prune every candidate group. Do not include an expense id in a case merely because it shares a merchant, category, receipt-like pattern, or threshold condition. Include it only when the expense metadata, receipt text, policy, or context makes the reviewer action concrete.",
    );
    if (isToolCompactionVariant(runtimeVariant)) {
      lines.push(
        "This native tool run has conversation compaction enabled. Older tool results may be summarized between steps; if a summarized fact is not specific enough for a final case, refetch the selected expense or receipt before citing it.",
      );
    }
  }
  if (includeWebSearch) {
    lines.push(
      "web_search is optional. Use it only when public context materially helps, such as merchant category, public pricing, or public explanations of spend-abuse patterns. Do not use it for internal evidence.",
    );
  }
  if (shellInstructions) {
    lines.push(shellInstructions);
    lines.push(
      `Recommended bash flow: paginate with get_expenses --overview --limit 250 --offset N, or use python3/jq against the /workspace/expenses.json array while printing only compact summaries. Group shared receipt fingerprints, cash-equivalent spend, procurement issues, travel/lodging, receipts, memos, and reimbursement-vs-company-paid overlap. Inspect receipts for representative case expense ids, optionally call web_search if public context would change or strengthen the audit decision, verify ${expenseCount} unique covered expense ids, write the final {decisions, companySpendSummary} JSON to /tmp/submission.json, then run submit_review /tmp/submission.json. If submit_review returns accepted=false, use the schema paths and coverage hints in the rejection to repair the JSON and run submit_review again. Do not print the full expense dataset or the full submission JSON.`,
      "Use bash or python3 to find candidate clusters, but then apply reviewer discipline: prune broad clusters down to the expense ids with direct support. Keep broad counts, nearby suspicious spend, and weak pattern matches in companySpendSummary.notableSpendClusters or unresolvedLimitations instead of making them case expense ids.",
    );
  }
  return lines.join("\n");
}

function buildNativeReviewerTools({
  fixture,
  includeWebSearch,
  options,
  recorder,
}) {
  const tools = {
    get_policy: tool({
      description: "Read the company spend audit policy.",
      inputSchema: z.object({}),
      execute: async () => {
        recorder.increment("toolCalls");
        return recorder.span(
          "tool.get_policy",
          { "tool.name": "get_policy" },
          async () => fixture.policy,
          {
            outputPreview: (result) => summarizePolicy(result),
            spanType: "TOOL",
          },
        );
      },
    }),
    get_expenses: tool({
      description:
        'Query weekly expenses and reimbursements. Use detailLevel "overview" for compact full-batch scanning and detailLevel "detailed" only for selected records that need all fields.',
      inputSchema: z.object({
        detailLevel: z.enum(["overview", "detailed"]).optional(),
        expenseIds: z.array(z.string()).optional(),
        expenseType: z.enum(["expense", "reimbursement"]).optional(),
        limit: z.number().int().min(1).optional(),
        maxAmountUsd: z.number().nonnegative().optional(),
        merchantContains: z.string().optional(),
        minAmountUsd: z.number().nonnegative().optional(),
        offset: z.number().int().min(0).optional(),
        purchasedAtEnd: z.string().optional(),
        purchasedAtStart: z.string().optional(),
        receiptFingerprint: z.string().optional(),
        sortBy: z.enum(["recent", "amount_desc"]).optional(),
        userId: z.string().optional(),
      }),
      execute: async (input) => {
        recorder.increment("toolCalls");
        return recorder.span(
          "tool.get_expenses",
          { "tool.name": "get_expenses" },
          async () => queryCanonicalExpenses(fixture.expenses, input),
          {
            inputPreview: input,
            outputPreview: summarizeCanonicalExpenseQueryResult,
            spanType: "TOOL",
          },
        );
      },
    }),
    get_users: tool({
      description:
        "Read user context for selected user ids, including role, department, region, and spend baseline.",
      inputSchema: z.object({
        userIds: z.array(z.string()).min(1),
      }),
      execute: async ({ userIds }) => {
        recorder.increment("toolCalls");
        return recorder.span(
          "tool.get_users",
          { "tool.name": "get_users", "tool.user_count": userIds.length },
          async () => ({
            users: userIds
              .map((userId) => fixture.users[userId])
              .filter(Boolean),
          }),
          {
            inputPreview: { userIds },
            outputPreview: (result) => result.users.slice(0, 3),
            spanType: "TOOL",
          },
        );
      },
    }),
    get_cases: tool({
      description:
        "Read prior audit cases for selected users. Use this only as supporting context, not as a replacement for current evidence.",
      inputSchema: z.object({
        userIds: z.array(z.string()).min(1).optional(),
      }),
      execute: async ({ userIds = [] }) => {
        recorder.increment("toolCalls");
        const wanted = new Set(userIds);
        return recorder.span(
          "tool.get_cases",
          { "tool.name": "get_cases" },
          async () => ({
            cases:
              wanted.size === 0
                ? fixture.priorCases.slice(0, 50)
                : fixture.priorCases.filter((priorCase) =>
                    wanted.has(priorCase.userId),
                  ),
          }),
          {
            inputPreview: { userIds },
            outputPreview: (result) => result.cases.slice(0, 3),
            spanType: "TOOL",
          },
        );
      },
    }),
    analyze_calendar_events: tool({
      description:
        "Read synthetic calendar context for selected users when travel, meals, or event timing is ambiguous.",
      inputSchema: z.object({
        userIds: z.array(z.string()).min(1),
      }),
      execute: async ({ userIds }) => {
        recorder.increment("toolCalls");
        return recorder.span(
          "tool.analyze_calendar_events",
          { "tool.name": "analyze_calendar_events" },
          async () => ({
            events: userIds.flatMap(
              (userId) => fixture.calendarEventsByUserId[userId] ?? [],
            ),
          }),
          {
            inputPreview: { userIds },
            outputPreview: (result) => result.events.slice(0, 4),
            spanType: "TOOL",
          },
        );
      },
    }),
    analyze_receipt: tool({
      description:
        "Read receipt text for one or more expense ids. Use this for every expense you plan to cite in the final answer.",
      inputSchema: z.object({
        expenseIds: z.array(z.string()).min(1),
      }),
      execute: async ({ expenseIds }) =>
        callAnalyzeReceiptTool({
          expenseIds,
          fixture,
          recorder,
        }),
    }),
  };

  if (includeWebSearch) {
    tools.web_search = tool({
      description:
        "Search the public web for external facts such as merchant pricing, merchant category, or common spend-misuse patterns.",
      inputSchema: z.object({
        queries: z.array(z.string()).min(1),
      }),
      execute: async ({ queries }) =>
        callWebSearchTool({
          items: queries.map((query) => ({ query })),
          options,
          recorder,
        }),
    });
  }

  return tools;
}

function summarizeShellCommandName(command) {
  const firstLine = String(command ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return truncateText(firstLine || "command", 48);
}

function buildShellReviewerTools({
  description,
  executeCommand,
  interceptCommand,
}) {
  return {
    bash: tool({
      description: `${description} Stdout is capped; write large intermediate results to files and print compact summaries.`,
      inputSchema: z.object({
        command: z
          .string()
          .describe("A bash command to run inside the runtime."),
      }),
      execute: async ({ command }) => {
        const intercepted = interceptCommand
          ? await interceptCommand(command)
          : null;
        return intercepted ?? (await executeCommand(command));
      },
    }),
  };
}

function truncateText(value, max = 280) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function truncateLines(value, maxLines = 5, maxChars = 320) {
  const lines = String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line) => truncateText(line, Math.min(maxChars, 140)));
  return truncateText(lines.join(" | "), maxChars);
}

function previewValue(value, maxChars = 700) {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  return truncateText(text, maxChars);
}

function summarizeExpense(expense) {
  return {
    amountUsd: expense.amountUsd,
    expenseId: expense.expenseId,
    expenseType: expense.expenseType,
    memo: truncateText(expense.memo, 96),
    merchant: expense.merchant,
    paymentChannel: expense.paymentChannel,
    purchasedAt: expense.purchasedAt,
    userId: expense.userId,
  };
}

function summarizeCandidate(candidate) {
  return {
    expenseIds: candidate.expenseIds,
    expenseTypes: candidate.expenseTypes,
    kind: candidate.kind,
    merchant: candidate.merchant,
    reasonSignals: candidate.reasonSignals,
    riskScore: candidate.riskScore,
    userId: candidate.userId,
  };
}

function summarizePolicy(policy) {
  const words = String(policy).split(/\s+/).filter(Boolean);
  return {
    excerpt: truncateText(policy, 220),
    sectionCount: String(policy)
      .split(/^##\s+/m)
      .filter(Boolean).length,
    wordCount: words.length,
  };
}

function summarizePacket(packet) {
  return {
    riskClusters: (packet.riskClusters ?? packet.candidates ?? [])
      .slice(0, 3)
      .map(summarizeCandidate),
    receiptEvidenceCount: packet.receiptEvidence?.length ?? 0,
    summary: packet.summary,
  };
}

function summarizeReceiptResults(results) {
  return results.slice(0, 3).map((result) => ({
    expenseId: result.expenseId,
    receiptPreview: truncateLines(result.receiptText, 4, 220),
  }));
}

function summarizeReviewOutput(output) {
  if (Array.isArray(output?.decisions)) {
    return {
      caseDecisionCount: output.decisions.filter(
        (decision) => decision.outcome === "case",
      ).length,
      decisionCount: output.decisions.length,
      decisions: output.decisions.slice(0, 3),
      totalReviewed: output.companySpendSummary?.totalReviewed ?? 0,
    };
  }
  return {
    candidateCount: Array.isArray(output?.candidates)
      ? output.candidates.length
      : 0,
    candidates: Array.isArray(output?.candidates)
      ? output.candidates.slice(0, 3)
      : [],
  };
}

function summarizeWebSearchPayload(payload) {
  return {
    queries: payload.items.map((item) => item.query),
    queryCount: payload.items.length,
  };
}

function summarizeWebSearchResults(results) {
  return results.slice(0, 3).map((result) => ({
    answerPreview: truncateText(result.answer, 180),
    query: result.query,
    sourceCount: result.sources?.length ?? 0,
    status: result.status,
  }));
}

function serializePreviewForMetadata(preview) {
  if (preview === undefined) {
    return undefined;
  }
  return previewValue(preview, 500);
}

function createTraceController() {
  return {
    getTraceId: () => null,
    observe: async (_spanOptions, fn) => fn(),
    reason: "local spans only",
  };
}

class Recorder {
  constructor({ run, sessionId, traceController, variant }) {
    this.counters = {
      bashExecs: 0,
      compactionPasses: 0,
      dockerExecs: 0,
      llmCalls: 0,
      providerFailures: 0,
      providerRetries: 0,
      submissionCalls: 0,
      submissionRejections: 0,
      toolCalls: 0,
      webSearchCalls: 0,
    };
    this.externalUsage = zeroUsage();
    this.run = run;
    this.sessionId = sessionId;
    this.spans = [];
    this.stack = [];
    this.traceController = traceController;
    this.variant = variant;
    this.webSearchResults = [];
  }

  increment(counter) {
    this.counters[counter] = (this.counters[counter] ?? 0) + 1;
  }

  addExternalUsage(usage) {
    this.externalUsage = addUsage(this.externalUsage, usage);
  }

  addWebSearchResults(results) {
    this.webSearchResults.push(...(results ?? []));
  }

  async span(name, attributes, fn, options = {}) {
    const parentId = this.stack.at(-1) ?? null;
    const inputPreview =
      typeof options.inputPreview === "function"
        ? options.inputPreview()
        : options.inputPreview;
    const span = {
      attributes: {
        "agent.task": TASK_ID,
        "runtime.variant": this.variant,
        ...attributes,
      },
      id: `${this.variant}-${this.run}-${this.spans.length + 1}`,
      inputPreview,
      name,
      parentId,
      run: this.run,
      sessionId: this.sessionId,
      startTime: new Date().toISOString(),
      status: "running",
      variant: this.variant,
    };
    this.spans.push(span);

    const execute = async () => {
      const start = performance.now();
      this.stack.push(span.id);
      try {
        const result = await fn();
        if (typeof options.outputPreview === "function") {
          span.outputPreview = options.outputPreview(result);
        } else if (options.outputPreview !== undefined) {
          span.outputPreview = options.outputPreview;
        }
        span.status = "ok";
        return result;
      } catch (error) {
        span.error = error instanceof Error ? error.message : String(error);
        span.status = "error";
        throw error;
      } finally {
        span.durationMs = performance.now() - start;
        span.endTime = new Date().toISOString();
        this.stack.pop();
      }
    };

    return this.traceController.observe(
      {
        metadata: {
          ...span.attributes,
          "local.input_preview": serializePreviewForMetadata(span.inputPreview),
          "local.parent_span_id": parentId,
          "local.span_id": span.id,
        },
        name,
        sessionId: this.sessionId,
        spanType: options.spanType ?? "DEFAULT",
        tags: ["bash-sandbox-benchmarks", TASK_ID, this.variant],
      },
      execute,
    );
  }
}

function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

function parseJsonObject(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        `LLM response did not contain JSON: ${trimmed.slice(0, 160)}`,
      );
    }
    return JSON.parse(match[0]);
  }
}

function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const details = [error.stack || error.message];
  for (const key of ["statusCode", "responseBody", "data", "body", "cause"]) {
    const value = error[key];
    if (value === undefined) {
      continue;
    }
    const rendered =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    details.push(`${key}: ${rendered}`);
  }
  return details.join("\n");
}

function classifyError(error) {
  const text = formatError(error);
  if (
    /AI_APICallError: Cannot connect to API|getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Connect Timeout Error|fetch failed|network error|socket hang up/i.test(
      text,
    )
  ) {
    return "provider_connectivity";
  }
  if (
    /(?:statusCode|status|code)["':\s]*(?:429|500|502|503|504)\b|\b(?:429|500|502|503|504)\b/i.test(
      text,
    ) &&
    /AI_APICallError|API|gateway|provider/i.test(text)
  ) {
    return "provider_retryable_status";
  }
  if (
    /TimeoutError: The operation was aborted due to timeout|AbortError/i.test(
      text,
    )
  ) {
    return "agent_timeout";
  }
  return "runtime_error";
}

function isRetryableProviderError(error) {
  return new Set(["provider_connectivity", "provider_retryable_status"]).has(
    classifyError(error),
  );
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withProviderRetries({ label, operation, recorder }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation({ attempt });
    } catch (error) {
      const retryable = isRetryableProviderError(error);
      const delayMs = PROVIDER_RETRY_DELAYS_MS[attempt];
      if (!retryable || delayMs === undefined) {
        if (classifyError(error).startsWith("provider_")) {
          recorder.increment("providerFailures");
        }
        throw error;
      }
      recorder.increment("providerRetries");
      await recorder.span(
        "llm.provider_retry",
        {
          "llm.provider_error_class": classifyError(error),
          "llm.retry_attempt": attempt + 1,
          "llm.retry_delay_ms": delayMs,
          "llm.retry_label": label,
        },
        async () => sleep(delayMs),
        {
          inputPreview: {
            error: summarizeError(error),
            label,
          },
          outputPreview: { retrying: true },
        },
      );
    }
  }
}

function zeroUsage() {
  return {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
}

function addUsage(left, right) {
  return {
    completionTokens:
      (left?.completionTokens ?? 0) + (right?.completionTokens ?? 0),
    promptTokens: (left?.promptTokens ?? 0) + (right?.promptTokens ?? 0),
    totalTokens: (left?.totalTokens ?? 0) + (right?.totalTokens ?? 0),
  };
}

function normalizeSdkUsage(usage, promptText = "", responseText = "") {
  const promptTokens =
    usage?.inputTokens ?? usage?.promptTokens ?? estimateTokens(promptText);
  const completionTokens =
    usage?.outputTokens ??
    usage?.completionTokens ??
    estimateTokens(responseText);
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;

  return {
    completionTokens,
    promptTokens,
    totalTokens,
  };
}

function createVertexProvider() {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  if (!process.env.LLM_API_KEY || !baseUrl) {
    throw new Error(
      "LLM_API_KEY and LLM_BASE_URL are required for Gemini web search",
    );
  }
  return createVertex({
    apiKey: process.env.LLM_API_KEY,
    baseURL: `${baseUrl}/gateway/vertex/v1`,
  });
}

function createGatewayProvider() {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  if (!process.env.LLM_API_KEY || !baseUrl) {
    throw new Error("LLM_API_KEY and LLM_BASE_URL are required");
  }
  const providerKey = `${baseUrl}|${process.env.LLM_API_KEY}`;
  if (cachedGatewayProvider && cachedGatewayProviderKey === providerKey) {
    return cachedGatewayProvider;
  }
  cachedGatewayProvider = createAnthropic({
    apiKey: process.env.LLM_API_KEY,
    baseURL: `${baseUrl}/gateway/anthropic/v1`,
  });
  cachedGatewayProviderKey = providerKey;
  return cachedGatewayProvider;
}

async function runProviderPreflight(options) {
  if (options.mockLlm || options.skipPreflight) {
    return {
      skipped: true,
      reason: options.mockLlm ? "mock LLM mode" : "--skip-preflight",
    };
  }
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
    if (options.requireLlm) {
      throw new Error("LLM_API_KEY and LLM_BASE_URL are required");
    }
    return {
      skipped: true,
      reason: "LLM Gateway env not configured",
    };
  }

  const started = performance.now();
  try {
    await generateText({
      abortSignal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
      maxRetries: 0,
      model: createGatewayProvider()(options.model),
      prompt: "Reply with OK.",
      system:
        "You are a provider health check. Reply with exactly OK and no extra text.",
    });

    if (
      options.variants.some((variant) =>
        ["tool", "tool-compaction", "just-bash", "sandbox"].includes(variant),
      )
    ) {
      await generateText({
        abortSignal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
        maxRetries: 0,
        model: createVertexProvider()(WEB_SEARCH_MODEL),
        prompt: "Reply with OK.",
        system:
          "You are a provider health check. Reply with exactly OK and no extra text.",
      });
    }

    return {
      durationMs: performance.now() - started,
      skipped: false,
    };
  } catch (error) {
    const classified = classifyError(error);
    throw new Error(
      `Provider preflight failed (${classified}): ${summarizeError(error)}`,
      { cause: error },
    );
  }
}

function buildWebSearchPayload(packet) {
  const items = [];
  const candidateKinds = new Set(
    (packet.riskClusters ?? packet.candidates ?? []).map((item) => item.kind),
  );

  if (candidateKinds.has("duplicate_shared_receipt")) {
    items.push({
      query:
        "Public guidance on duplicate reimbursement or reused receipt indicators in corporate expense review.",
    });
  }

  if (candidateKinds.has("threshold_splitting")) {
    items.push({
      query:
        "Public guidance on split transactions used to avoid corporate expense review thresholds.",
    });
  }

  if (
    candidateKinds.has("software_procurement") ||
    candidateKinds.has("cash_equivalent") ||
    candidateKinds.has("meal_entertainment") ||
    candidateKinds.has("merchant_burst")
  ) {
    items.push({
      query:
        "Typical corporate expense policy issues for cash equivalents software procurement premium meals and merchant bursts.",
    });
  }

  return {
    items: items.slice(0, 3),
  };
}

function formatWebSearchContext(webSearch) {
  if (!webSearch || webSearch.results.length === 0) {
    return "";
  }

  return JSON.stringify(
    {
      results: webSearch.results.map((result) => ({
        answer: result.answer,
        confidence: result.confidence,
        query: result.query,
        sources: result.sources,
        status: result.status,
      })),
    },
    null,
    2,
  );
}

function summarizeSubmissionValidation(validation) {
  return {
    caseDecisionCount: validation.caseDecisionCount,
    coveredExpenseCount: validation.coveredExpenseCount,
    duplicateExpenseIds: validation.duplicateExpenseIds,
    exactlyOnceCovered: validation.exactlyOnceCovered,
    fullBatchCovered: validation.fullBatchCovered,
    invalidExpenseIds: validation.invalidExpenseIds,
    missingExpenseIdCount: validation.missingExpenseIdCount,
    missingExpenseIds: validation.missingExpenseIds,
    schemaValid: validation.schemaValid,
    submittedExpenseIdCount: validation.submittedExpenseIdCount,
    totalExpenseCount: validation.totalExpenseCount,
    validExpenseIds: validation.validExpenseIds,
  };
}

function countReviewDecisions(output) {
  return Array.isArray(output?.decisions) ? output.decisions.length : 0;
}

function countCaseReviewDecisions(output) {
  return Array.isArray(output?.decisions)
    ? output.decisions.filter((decision) => decision.outcome === "case").length
    : 0;
}

function buildSubmissionRepairMessage(validation) {
  const parts = [
    "not accepted; repair the submission and call submit_review again",
  ];
  if (!validation.schemaValid) {
    parts.push(
      `schema errors: ${validation.schemaErrors.join("; ") || "unknown"}`,
    );
  }
  if (!validation.validExpenseIds) {
    parts.push(
      `invalid expense ids: ${validation.invalidExpenseIds.join(", ")}`,
    );
  }
  if (validation.duplicateExpenseIds.length > 0) {
    parts.push(
      `duplicate expense ids: ${validation.duplicateExpenseIds.join(", ")}`,
    );
  }
  if (validation.missingExpenseIdCount > 0) {
    parts.push(
      `missing ${validation.missingExpenseIdCount} expense ids; first missing ids: ${validation.missingExpenseIds.join(", ")}`,
    );
  }
  if (!validation.exactlyOnceCovered) {
    parts.push(
      "every in-scope expense id must appear in exactly one case or no_case decision",
    );
  }
  return parts.join("; ");
}

function resolveSubmissionFilePath(filePath) {
  return resolveRuntimeFilePath(filePath, "submissionFile");
}

function resolveRuntimeFilePath(filePath, label = "filePath") {
  const raw = String(filePath ?? "").trim();
  if (!raw) {
    throw new Error(`${label} is empty`);
  }
  const absolute = raw.startsWith("/") ? raw : `/workspace/${raw}`;
  const normalized = path.posix.normalize(absolute);
  if (
    normalized !== "/tmp" &&
    !normalized.startsWith("/tmp/") &&
    normalized !== "/workspace" &&
    !normalized.startsWith("/workspace/")
  ) {
    throw new Error(`${label} must be under /tmp or /workspace, got ${raw}`);
  }
  return normalized;
}

async function recordSubmitReview({
  fixture,
  loadError = null,
  output,
  recorder,
  state,
  submissionFile = null,
  submissionMode = "tool",
}) {
  recorder.increment("submissionCalls");
  const validation = validateCanonicalSubmittedOutput({ fixture, output });
  const accepted =
    !loadError &&
    validation.schemaValid &&
    validation.validExpenseIds &&
    validation.fullBatchCovered &&
    validation.exactlyOnceCovered;
  if (!accepted) {
    recorder.increment("submissionRejections");
  }
  return recorder.span(
    "tool.submit_review",
    {
      "tool.name": "submit_review",
      "tool.accepted": accepted,
      "tool.case_decision_count": countCaseReviewDecisions(output),
      "tool.decision_count": countReviewDecisions(output),
      "tool.submission_file": submissionFile,
      "tool.submission_mode": submissionMode,
    },
    async () => {
      if (accepted) {
        state.output = output;
        state.submittedAt = new Date().toISOString();
      }
      return {
        accepted,
        caseDecisionCount: countCaseReviewDecisions(output),
        decisionCount: countReviewDecisions(output),
        loadError,
        message: accepted
          ? "accepted"
          : loadError
            ? `not accepted; could not load submission ${submissionFile ?? "stdin"}: ${summarizeError(loadError)}`
            : buildSubmissionRepairMessage(validation),
        submissionFile,
        validation: summarizeSubmissionValidation(validation),
      };
    },
    {
      inputPreview: {
        ...summarizeReviewOutput(output),
        submissionFile,
        submissionMode,
      },
      outputPreview: (result) => result,
      spanType: "TOOL",
    },
  );
}

function buildSubmitReviewTool({ fixture, recorder, state }) {
  return tool({
    description:
      "Submit the final company-spend audit decisions after the evidence-gathering tool loop is complete. This is the only accepted way for the native tool variant to finish the task. Submit direct {decisions, companySpendSummary}. The submission is accepted only when it covers every in-scope expense exactly through case or no_case decisions. Do not submit placeholder or test data.",
    inputSchema: canonicalReviewOutputSchema,
    execute: async (input) => {
      return recordSubmitReview({
        fixture,
        output: input,
        recorder,
        state,
        submissionMode: "tool_direct",
      });
    },
  });
}

function parseSubmitReviewCliArgs(args) {
  let submissionFile = "";
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--file" || arg === "-f") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a file path`);
      }
      submissionFile = value;
      index++;
    } else if (arg.startsWith("--file=")) {
      submissionFile = arg.slice("--file=".length);
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(
        "usage: submit_review [--file /tmp/submission.json] or cat submission.json | submit_review",
      );
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown submit_review option: ${arg}`);
    } else if (!submissionFile) {
      submissionFile = arg;
    } else {
      throw new Error(`unexpected submit_review argument: ${arg}`);
    }
  }
  return {
    submissionFile,
  };
}

async function resolveSubmitReviewCliInput({
  args,
  readRuntimeFile,
  stdin = "",
}) {
  let submissionFile = "";
  try {
    const parsed = parseSubmitReviewCliArgs(args);
    submissionFile = parsed.submissionFile
      ? resolveSubmissionFilePath(parsed.submissionFile)
      : "";
    const content = submissionFile
      ? await readRuntimeFile(submissionFile)
      : String(stdin ?? "");
    if (!content.trim()) {
      throw new Error(
        "submit_review requires a JSON file path or JSON on stdin",
      );
    }
    return {
      loadError: null,
      output: parseJsonObject(content),
      submissionFile: submissionFile || null,
    };
  } catch (error) {
    return {
      loadError: formatError(error),
      output: {},
      submissionFile: submissionFile || null,
    };
  }
}

async function runSubmitReviewCli({
  args,
  fixture,
  readRuntimeFile,
  recorder,
  state,
  stdin,
  submissionMode,
}) {
  const { loadError, output, submissionFile } =
    await resolveSubmitReviewCliInput({
      args,
      readRuntimeFile,
      stdin,
    });
  const result = await recordSubmitReview({
    fixture,
    loadError,
    output,
    recorder,
    state,
    submissionFile,
    submissionMode,
  });
  return `${JSON.stringify(result, null, 2)}\n`;
}

function makeSubmitReviewCommand({ fixture, recorder, state }) {
  return defineCommand("submit_review", async (args, ctx) => ({
    exitCode: 0,
    stderr: "",
    stdout: await runSubmitReviewCli({
      args,
      fixture,
      readRuntimeFile: async (filePath) => {
        const content = await ctx.fs.readFile(filePath);
        if (content === null || content === undefined) {
          throw new Error(`No such file: ${filePath}`);
        }
        return content;
      },
      recorder,
      state,
      stdin: ctx.stdin,
      submissionMode: "just_bash_cli",
    }),
  }));
}

function hasCompletedSpan(recorder, name) {
  return recorder.spans.some(
    (span) => span.name === name && span.status === "ok",
  );
}

function hasCompletedSpanPrefix(recorder, prefix) {
  return recorder.spans.some(
    (span) => span.name.startsWith(prefix) && span.status === "ok",
  );
}

function shellSubmissionFileWasWritten(recorder) {
  return recorder.spans.some((span) => {
    if (
      span.status !== "ok" ||
      (!span.name.startsWith("bash.exec") &&
        !span.name.startsWith("sandbox.exec"))
    ) {
      return false;
    }
    return String(span.inputPreview?.command ?? "").includes(
      "/tmp/submission.json",
    );
  });
}

function completedNativeEvidenceSpanCount(recorder) {
  return recorder.spans.filter(
    (span) =>
      span.status === "ok" &&
      span.name.startsWith("tool.") &&
      span.name !== "tool.submit_review",
  ).length;
}

function shouldForceSubmitReview({
  expectedExpenseCount,
  recorder,
  submissionState,
  tools,
}) {
  if (submissionState.output || !tools.submit_review) {
    return false;
  }
  if (tools.get_expenses) {
    return (
      recorder.counters.submissionRejections === 0 &&
      summarizeExpenseFetchCoverage(
        recorder.variant,
        recorder.spans,
        expectedExpenseCount,
      ).completed &&
      hasCompletedSpan(recorder, "tool.get_policy") &&
      hasCompletedSpan(recorder, "tool.analyze_receipt") &&
      completedNativeEvidenceSpanCount(recorder) >=
        NATIVE_FORCE_SUBMIT_MIN_EVIDENCE_SPANS
    );
  }
  return hasCompletedSpanPrefix(recorder, "tool.");
}

function shouldForceShellSubmitReviewCli({
  expectedExpenseCount,
  recorder,
  submissionState,
  tools,
}) {
  return (
    !submissionState.output &&
    Boolean(tools.bash) &&
    summarizeExpenseFetchCoverage(
      recorder.variant,
      recorder.spans,
      expectedExpenseCount,
    ).completed &&
    shellSubmissionFileWasWritten(recorder)
  );
}

function estimateMessagesTokens(messages) {
  try {
    return estimateTokens(JSON.stringify(messages));
  } catch {
    return 0;
  }
}

function dropLeadingToolMessages(messages) {
  const copy = [...messages];
  while (copy.length > 0 && copy[0]?.role === "tool") {
    copy.shift();
  }
  return copy;
}

function buildToolCompactionSummary({ fixture, recorder, stepNumber }) {
  const coverage = summarizeNativeExpenseFetchCoverage(
    recorder.spans,
    fixture.expenses.length,
  );
  const toolSpans = recorder.spans.filter(
    (span) => span.status === "ok" && span.name.startsWith("tool."),
  );
  const toolCounts = toolSpans.reduce((counts, span) => {
    counts[span.name] = (counts[span.name] ?? 0) + 1;
    return counts;
  }, {});
  const expensePages = recorder.spans
    .filter((span) => span.name === "tool.get_expenses" && span.status === "ok")
    .map((span) => ({
      detailLevel: span.inputPreview?.detailLevel ?? "overview",
      expenseIds: span.outputPreview?.expenseIds?.slice(0, 12) ?? [],
      hasMore: span.outputPreview?.hasMore,
      limit: span.outputPreview?.limit,
      matchedCount: span.outputPreview?.matchedCount,
      offset: span.outputPreview?.offset,
      returnedCount: span.outputPreview?.returnedCount,
      summary: span.outputPreview?.summary,
    }))
    .slice(-8);
  const receiptIds = [
    ...new Set(
      recorder.spans
        .filter(
          (span) =>
            span.name === "tool.analyze_receipt" && span.status === "ok",
        )
        .flatMap((span) => span.inputPreview?.expenseIds ?? []),
    ),
  ].slice(0, 80);
  const userIds = [
    ...new Set(
      recorder.spans
        .filter((span) =>
          [
            "tool.get_users",
            "tool.get_cases",
            "tool.analyze_calendar_events",
          ].includes(span.name),
        )
        .flatMap((span) => span.inputPreview?.userIds ?? []),
    ),
  ].slice(0, 80);
  const webQueries = recorder.spans
    .filter((span) => span.name === "tool.web_search" && span.status === "ok")
    .flatMap((span) => span.inputPreview?.queries ?? [])
    .slice(-10);

  return [
    "Conversation compaction checkpoint for the native-tool spend audit run.",
    `Step: ${stepNumber}. Expense batch size: ${fixture.expenses.length}.`,
    `Expense coverage: ${coverage.coveredExpenseCount}/${coverage.requiredExpenseCount} ids fetched across ${coverage.pageCount} pagination calls; completed=${coverage.completed}.`,
    `Tool calls so far: ${JSON.stringify(toolCounts)}.`,
    receiptIds.length
      ? `Receipt evidence inspected for: ${receiptIds.join(", ")}.`
      : "Receipt evidence inspected: none yet.",
    userIds.length
      ? `User/context ids touched: ${userIds.join(", ")}.`
      : "User/context ids touched: none yet.",
    webQueries.length
      ? `Web queries used: ${webQueries.join(" | ")}.`
      : "Web queries used: none yet.",
    `Recent expense page summaries: ${JSON.stringify(expensePages).slice(0, 6000)}.`,
    "Use this summary only as working memory. Refetch selected expenses or receipts before citing them in a case decision if the exact evidence is not present in the recent messages.",
  ].join("\n");
}

async function buildToolCompactionStepOverride({
  fixture,
  messages,
  recorder,
  stepNumber,
}) {
  if (stepNumber < 2) {
    return {};
  }
  const originalTokenEstimate = estimateMessagesTokens(messages);
  if (
    originalTokenEstimate < TOOL_COMPACTION_TOKEN_THRESHOLD &&
    messages.length < 14
  ) {
    return {};
  }

  const summaryMessage = {
    role: "user",
    content: buildToolCompactionSummary({ fixture, recorder, stepNumber }),
  };
  let pruned = pruneMessages({
    messages,
    reasoning: "before-last-message",
    toolCalls: `before-last-${TOOL_COMPACTION_RECENT_MESSAGE_WINDOW}-messages`,
  });
  pruned = dropLeadingToolMessages(pruned);
  let compactedMessages = [summaryMessage, ...pruned];
  let compactedTokenEstimate = estimateMessagesTokens(compactedMessages);

  if (compactedTokenEstimate > TOOL_COMPACTION_TOKEN_THRESHOLD) {
    pruned = pruneMessages({
      messages,
      reasoning: "all",
      toolCalls: "all",
    });
    compactedMessages = [
      summaryMessage,
      ...dropLeadingToolMessages(pruned).slice(-10),
    ];
    compactedTokenEstimate = estimateMessagesTokens(compactedMessages);
  }

  recorder.increment("compactionPasses");
  await recorder.span(
    "llm.context_compaction",
    {
      "llm.compaction.original_tokens_estimate": originalTokenEstimate,
      "llm.compaction.compacted_tokens_estimate": compactedTokenEstimate,
      "llm.compaction.message_count": messages.length,
      "llm.compaction.compacted_message_count": compactedMessages.length,
    },
    async () => ({
      compactedMessageCount: compactedMessages.length,
      compactedTokenEstimate,
      originalMessageCount: messages.length,
      originalTokenEstimate,
    }),
    {
      outputPreview: (result) => result,
      spanType: "DEFAULT",
    },
  );

  return {
    messages: compactedMessages,
  };
}

async function callReviewerLlm({
  agentTimeoutMs = LLM_TIMEOUT_MS,
  compactContext = false,
  fixture,
  mockOutput,
  options,
  prompt,
  promptPreview,
  recorder,
  submitReviewMode = "tool",
  submissionState,
  system = "You are a precise company spend audit reviewer. Use tools to gather evidence, then call submit_review with the final decisions.",
  tools,
}) {
  const started = performance.now();
  return recorder.span(
    "llm.review_spend_decisions",
    {
      "llm.agent_timeout_ms": agentTimeoutMs ?? "none",
      "llm.model": options.model,
      "llm.mock": options.mockLlm,
      "prompt.bytes": Buffer.byteLength(prompt),
    },
    async () => {
      if (options.mockLlm) {
        const promptTokens = estimateTokens(prompt);
        const output = submissionState?.output ??
          mockOutput ?? {
            companySpendSummary: {
              amountAtIssueUsd: 0,
              amountReviewedUsd: 0,
              categoriesReviewed: [],
              notableSpendClusters: [],
              totalReviewed: 0,
              unresolvedLimitations: ["mock output has no fixture context"],
            },
            decisions: [],
          };
        recorder.increment("llmCalls");
        if (!submissionState?.output) {
          recorder.increment("submissionCalls");
        }
        return {
          llmMs: performance.now() - started,
          output,
          rawText: JSON.stringify(output),
          submitted: Boolean(output),
          submittedAt: submissionState?.submittedAt ?? null,
          usage: {
            completionTokens: 20,
            promptTokens,
            totalTokens: promptTokens + 20,
          },
        };
      }

      if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL) {
        if (options.requireLlm) {
          throw new Error("LLM_API_KEY and LLM_BASE_URL are required");
        }
        throw new Error(
          "Missing LLM Gateway env; rerun with --mock-llm or --env-file",
        );
      }

      const activeSubmissionState = submissionState ?? {
        output: null,
        submittedAt: null,
      };
      const stopAfterAcceptedSubmission = () =>
        Boolean(activeSubmissionState.output);
      const agentTools =
        submitReviewMode === "tool"
          ? {
              ...(tools ?? {}),
              submit_review: buildSubmitReviewTool({
                fixture,
                recorder,
                state: activeSubmissionState,
              }),
            }
          : { ...(tools ?? {}) };
      const response = await withProviderRetries({
        label: "review_spend_decisions",
        operation: async () =>
          generateText({
            abortSignal:
              agentTimeoutMs === null
                ? undefined
                : AbortSignal.timeout(agentTimeoutMs),
            model: createGatewayProvider()(options.model),
            stopWhen: [
              stepCountIs(MAX_REVIEW_AGENT_STEPS),
              stopAfterAcceptedSubmission,
            ],
            tools: agentTools,
            prepareStep: async ({ messages, stepNumber }) => {
              const compactionOverride = compactContext
                ? await buildToolCompactionStepOverride({
                    fixture,
                    messages,
                    recorder,
                    stepNumber,
                  })
                : {};
              if (submitReviewMode === "tool") {
                if (
                  !shouldForceSubmitReview({
                    expectedExpenseCount: fixture.expenses.length,
                    recorder,
                    submissionState: activeSubmissionState,
                    tools: agentTools,
                  })
                ) {
                  return compactionOverride;
                }
                return {
                  ...compactionOverride,
                  activeTools: ["submit_review"],
                  system: `${system}\n\nYou have completed the required evidence-gathering steps. You must now call submit_review. Do not answer in prose and do not call any other tool.`,
                  toolChoice: { type: "tool", toolName: "submit_review" },
                };
              }
              if (
                !shouldForceShellSubmitReviewCli({
                  expectedExpenseCount: fixture.expenses.length,
                  recorder,
                  submissionState: activeSubmissionState,
                  tools: agentTools,
                })
              ) {
                return compactionOverride;
              }
              return {
                ...compactionOverride,
                activeTools: ["bash"],
                system: `${system}\n\nYou have completed the required evidence-gathering steps. Run bash with \`submit_review /tmp/submission.json\`. If it returns accepted=false, repair the JSON and run submit_review again. Do not answer in prose.`,
                toolChoice: { type: "tool", toolName: "bash" },
              };
            },
            maxRetries: 0,
            prompt,
            providerOptions: options.model.includes("claude-")
              ? { anthropic: {} }
              : undefined,
            system,
          }),
        recorder,
      });
      recorder.counters.llmCalls += response.steps.length;
      const rawText = response.text;
      return {
        llmMs: performance.now() - started,
        output: activeSubmissionState.output ?? {
          companySpendSummary: {
            amountAtIssueUsd: 0,
            amountReviewedUsd: 0,
            categoriesReviewed: [],
            notableSpendClusters: [],
            totalReviewed: 0,
            unresolvedLimitations: ["submit_review was not called"],
          },
          decisions: [],
        },
        rawText,
        submitted: Boolean(activeSubmissionState.output),
        submittedAt: activeSubmissionState.submittedAt,
        usage: normalizeSdkUsage(response.totalUsage, prompt, rawText),
      };
    },
    {
      inputPreview: promptPreview,
      outputPreview: (result) => summarizeReviewOutput(result.output),
      spanType: "LLM",
    },
  );
}

async function callWebSearchTool({ items, options, packet, recorder }) {
  recorder.increment("toolCalls");
  recorder.increment("webSearchCalls");
  const payload = {
    items: items ?? buildWebSearchPayload(packet).items,
  };
  if (payload.items.length === 0) {
    return {
      results: [],
      usage: zeroUsage(),
      webSearchMs: 0,
    };
  }

  return recorder.span(
    "tool.web_search",
    {
      "tool.name": "web_search",
      "tool.query_count": payload.items.length,
      "tool.runtime": "vertex.enterprise_web_search",
    },
    async () => {
      const started = performance.now();

      if (options.mockLlm) {
        const mockResults = payload.items.map((item, index) => ({
          answer:
            index === 0
              ? "Public expense-review guidance treats duplicate reimbursements and reused receipts as strong misuse signals."
              : index === 1
                ? "Public corporate controls describe same-day threshold splitting as an attempt to avoid approval review."
                : "Published pricing guides show premium client entertainment varies widely by city and venue tier.",
          confidence: "medium",
          query: item.query,
          sources: [
            {
              title: "Mock benchmark source",
              url: `https://example.com/mock-web-search-${index + 1}`,
            },
          ],
          status: "ok",
        }));

        const usage = {
          completionTokens: 180,
          promptTokens: estimateTokens(JSON.stringify(payload)),
          totalTokens: estimateTokens(JSON.stringify(payload)) + 180,
        };
        recorder.addExternalUsage(usage);
        recorder.addWebSearchResults(mockResults);
        return {
          results: mockResults,
          usage,
          webSearchMs: performance.now() - started,
        };
      }

      const vertexProvider = createVertexProvider();
      const settled = await Promise.all(
        payload.items.map(async (item) => {
          try {
            const response = await withProviderRetries({
              label: "web_search",
              operation: async () =>
                generateText({
                  abortSignal: AbortSignal.timeout(3 * 60 * 1000),
                  model: vertexProvider(WEB_SEARCH_MODEL),
                  prompt: item.urls?.length
                    ? `${item.query}\n\nRelevant URLs to analyze: ${item.urls.join(", ")}`
                    : item.query,
                  system: WEB_SEARCH_PROMPT,
                  tools: {
                    enterprise_web_search: vertex.tools.enterpriseWebSearch({}),
                    url_context: vertex.tools.urlContext({}),
                  },
                  maxRetries: 0,
                }),
              recorder,
            });
            recorder.counters.llmCalls += response.steps.length;

            const sources =
              response.sources
                ?.filter((source) => source.sourceType === "url")
                .map((source) => ({
                  title: source.title,
                  url:
                    "url" in source && typeof source.url === "string"
                      ? source.url
                      : undefined,
                })) ?? [];

            return {
              result: {
                answer: response.text,
                confidence: sources.length > 0 ? "high" : "medium",
                query: item.query,
                sources,
                status: "ok",
              },
              usage: normalizeSdkUsage(
                response.totalUsage,
                item.query,
                response.text,
              ),
            };
          } catch (error) {
            return {
              result: {
                answer:
                  error instanceof Error ? error.message : "Web search failed",
                confidence: "low",
                error: error instanceof Error ? error.message : "Unknown error",
                query: item.query,
                sources: [],
                status: "error",
              },
              usage: zeroUsage(),
            };
          }
        }),
      );

      const results = settled.map((entry) => entry.result);
      const usage = settled.reduce(
        (total, entry) => addUsage(total, entry.usage),
        zeroUsage(),
      );
      recorder.addExternalUsage(usage);
      recorder.addWebSearchResults(results);
      return {
        results,
        usage,
        webSearchMs: performance.now() - started,
      };
    },
    {
      inputPreview: summarizeWebSearchPayload(payload),
      outputPreview: (result) => summarizeWebSearchResults(result.results),
      spanType: "TOOL",
    },
  );
}

function pickDryEvidenceUserIds(fixture, limit = 5) {
  const riskExpenseIds = new Set(
    fixture.packet.riskClusters.flatMap((cluster) => cluster.expenseIds),
  );
  return [
    ...new Set(
      fixture.expenses
        .filter((expense) => riskExpenseIds.has(expense.expenseId))
        .map((expense) => expense.userId),
    ),
  ].slice(0, limit);
}

async function runNativeMockEvidenceWork({
  fixture,
  includeWebSearch,
  options,
  recorder,
}) {
  recorder.increment("toolCalls");
  await recorder.span(
    "tool.get_policy",
    { "tool.name": "get_policy" },
    async () => fixture.policy,
    {
      outputPreview: (result) => summarizePolicy(result),
      spanType: "TOOL",
    },
  );

  for (
    let offset = 0;
    offset < fixture.expenses.length;
    offset += DEFAULT_EXPENSE_FETCH_PAGE_SIZE
  ) {
    const input = {
      detailLevel: "overview",
      limit: DEFAULT_EXPENSE_FETCH_PAGE_SIZE,
      offset,
    };
    recorder.increment("toolCalls");
    await recorder.span(
      "tool.get_expenses",
      { "tool.name": "get_expenses" },
      async () => queryCanonicalExpenses(fixture.expenses, input),
      {
        inputPreview: input,
        outputPreview: summarizeCanonicalExpenseQueryResult,
        spanType: "TOOL",
      },
    );
  }

  const packet = fixture.packet;

  await callAnalyzeReceiptTool({
    expenseIds: pickReceiptExpenseIds(
      packet,
      DEFAULT_RECEIPT_ANALYSIS_SAMPLE_SIZE,
    ),
    fixture,
    recorder,
  });

  const userIds = pickDryEvidenceUserIds(fixture);
  recorder.increment("toolCalls");
  await recorder.span(
    "tool.get_users",
    { "tool.name": "get_users", "tool.user_count": userIds.length },
    async () => ({
      users: userIds.map((userId) => fixture.users[userId]).filter(Boolean),
    }),
    {
      inputPreview: { userIds },
      outputPreview: (result) => result.users.slice(0, 3),
      spanType: "TOOL",
    },
  );

  recorder.increment("toolCalls");
  await recorder.span(
    "tool.get_cases",
    { "tool.name": "get_cases" },
    async () => ({
      cases: fixture.priorCases.filter((priorCase) =>
        userIds.includes(priorCase.userId),
      ),
    }),
    {
      inputPreview: { userIds },
      outputPreview: (result) => result.cases.slice(0, 3),
      spanType: "TOOL",
    },
  );

  recorder.increment("toolCalls");
  await recorder.span(
    "tool.analyze_calendar_events",
    { "tool.name": "analyze_calendar_events" },
    async () => ({
      events: userIds.flatMap(
        (userId) => fixture.calendarEventsByUserId[userId] ?? [],
      ),
    }),
    {
      inputPreview: { userIds },
      outputPreview: (result) => result.events.slice(0, 4),
      spanType: "TOOL",
    },
  );

  if (!includeWebSearch) {
    return {
      usage: zeroUsage(),
      webSearchMs: 0,
    };
  }

  const webSearch = await callWebSearchTool({
    options,
    packet,
    recorder,
  });
  return {
    usage: webSearch.usage,
    webSearchMs: webSearch.webSearchMs,
  };
}

function parseWebSearchCliQueries(args, packet) {
  const queries = [];
  const bare = [];
  let useDefault = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--default") {
      useDefault = true;
    } else if (arg === "--query" || arg === "-q") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a query value`);
      }
      queries.push(value);
      index++;
    } else if (arg.startsWith("--query=")) {
      queries.push(arg.slice("--query=".length));
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(
        'usage: web_search [--default] [--query "query"]... or web_search "query"',
      );
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown web_search option: ${arg}`);
    } else {
      bare.push(arg);
    }
  }

  if (bare.length > 0 && queries.length === 0) {
    queries.push(bare.join(" "));
  }

  if (useDefault || queries.length === 0) {
    queries.push(
      ...buildWebSearchPayload(packet).items.map((item) => item.query),
    );
  }

  return queries
    .map((query) => query.trim())
    .filter(Boolean)
    .map((query) => ({ query }));
}

function formatWebSearchCliOutput(result) {
  return `${JSON.stringify(
    {
      queryCount: result.results.length,
      results: result.results,
    },
    null,
    2,
  )}\n`;
}

async function runWebSearchCli({ args, fixture, options, recorder }) {
  const items = parseWebSearchCliQueries(args, fixture.packet);
  const result = await callWebSearchTool({
    items,
    options,
    recorder,
  });
  return formatWebSearchCliOutput(result);
}

function makeWebSearchCommand({ fixture, options, recorder }) {
  return defineCommand("web_search", async (args) => {
    try {
      return {
        exitCode: 0,
        stderr: "",
        stdout: await runWebSearchCli({ args, fixture, options, recorder }),
      };
    } catch (error) {
      return {
        exitCode: 2,
        stderr: `${summarizeError(error)}\n`,
        stdout: "",
      };
    }
  });
}

function splitOutputRedirection(commandLine) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < commandLine.length; index++) {
    const char = commandLine[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ">") {
      return {
        commandLine: commandLine.slice(0, index).trim(),
        redirect: commandLine.slice(index + 1).trim(),
      };
    }
  }
  return {
    commandLine: commandLine.trim(),
    redirect: "",
  };
}

function tokenizeShellWords(commandLine) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of commandLine) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) {
    throw new Error("unterminated quote in command");
  }
  if (escaped) {
    current += "\\";
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function parseStandaloneWebSearchCommand(command) {
  const executableLines = String(command ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !/^set\s+-[a-zA-Z]+$/.test(line));
  if (executableLines.length !== 1) {
    return null;
  }

  const { commandLine, redirect } = splitOutputRedirection(executableLines[0]);
  const tokens = tokenizeShellWords(commandLine);
  if (tokens[0] !== "web_search") {
    return null;
  }
  const redirectTokens = redirect ? tokenizeShellWords(redirect) : [];
  return {
    args: tokens.slice(1),
    outputPath: redirectTokens[0]
      ? resolveRuntimeFilePath(redirectTokens[0])
      : "",
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function interceptWebSearchCli({
  command,
  fixture,
  options,
  recorder,
  spanName,
  writeRuntimeFile,
}) {
  const parsed = parseStandaloneWebSearchCommand(command);
  if (!parsed) {
    return null;
  }
  return recorder.span(
    spanName,
    {
      "shell.command": "web_search",
      "shell.host_mediated": true,
    },
    async () => {
      const stdout = await runWebSearchCli({
        args: parsed.args,
        fixture,
        options,
        recorder,
      });
      if (parsed.outputPath) {
        await writeRuntimeFile(parsed.outputPath, stdout);
        return { stdout: "" };
      }
      return { stdout };
    },
    {
      inputPreview: {
        command: truncateText(command, 240),
        outputPath: parsed.outputPath || undefined,
      },
      outputPreview: (result) =>
        result.stdout.trim()
          ? { stdoutPreview: truncateText(result.stdout, 220) }
          : { wroteFile: parsed.outputPath },
      spanType: "TOOL",
    },
  );
}

function parseStandaloneSubmitReviewCommand(command) {
  const executableLines = String(command ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !/^set\s+-[a-zA-Z]+$/.test(line));
  if (executableLines.length !== 1) {
    return null;
  }

  const line = executableLines[0];
  const catPipeMatch = line.match(
    /^cat\s+(.+?)\s*\|\s*submit_review(?:\s+--stdin)?\s*$/,
  );
  if (catPipeMatch) {
    return {
      args: [resolveRuntimeFilePath(tokenizeShellWords(catPipeMatch[1])[0])],
    };
  }

  const tokens = tokenizeShellWords(line);
  if (tokens[0] !== "submit_review") {
    return null;
  }
  return {
    args: tokens.slice(1),
  };
}

async function interceptSubmitReviewCli({
  command,
  fixture,
  readRuntimeFile,
  recorder,
  spanName,
  state,
  submissionMode,
}) {
  const parsed = parseStandaloneSubmitReviewCommand(command);
  if (!parsed) {
    return null;
  }
  return recorder.span(
    spanName,
    {
      "shell.command": "submit_review",
      "shell.host_mediated": submissionMode === "sandbox_cli",
    },
    async () => ({
      stdout: await runSubmitReviewCli({
        args: parsed.args,
        fixture,
        readRuntimeFile,
        recorder,
        state,
        submissionMode,
      }),
    }),
    {
      inputPreview: {
        command: truncateText(command, 240),
      },
      outputPreview: (result) =>
        result.stdout.trim()
          ? { stdoutPreview: truncateText(result.stdout, 320) }
          : undefined,
      spanType: "TOOL",
    },
  );
}

function buildShellDryCommands(fixture) {
  const receiptIds = pickReceiptExpenseIds(
    fixture.packet,
    DEFAULT_RECEIPT_ANALYSIS_SAMPLE_SIZE,
  );
  const userIds = pickDryEvidenceUserIds(fixture);
  return [
    {
      command:
        "python3 -c \"import json; expenses=json.load(open('/workspace/expenses.json')); print(json.dumps({'expenseCount': len(expenses), 'sampleExpenseIds': [item['expenseId'] for item in expenses[:5]]}))\"",
      name: "read_expenses",
    },
    {
      command: buildAnalyzeReceiptShellCommand(receiptIds),
      name: "analyze_receipt",
    },
    {
      command: userIds.length ? `get_users ${userIds.join(" ")}` : "true",
      name: "get_users",
    },
    {
      command: userIds.length ? `get_cases ${userIds.join(" ")}` : "true",
      name: "get_cases",
    },
    {
      command: userIds.length
        ? `analyze_calendar_events ${userIds.join(" ")}`
        : "true",
      name: "analyze_calendar_events",
    },
    {
      command: "web_search --default",
      name: "web_search",
    },
  ];
}

async function runToolVariant({
  compactContext = false,
  fixture,
  options,
  recorder,
  variant = "tool",
}) {
  const tools = buildNativeReviewerTools({
    fixture,
    includeWebSearch: true,
    options,
    recorder,
  });
  return recorder.span(
    "agent.review_week",
    {
      "agent.interface_surface": compactContext
        ? "native_tools_compacted"
        : "native_tools",
      "interface.count": Object.keys(tools).length,
    },
    async () => {
      const dryWork = options.mockLlm
        ? await runNativeMockEvidenceWork({
            fixture,
            includeWebSearch: true,
            options,
            recorder,
          })
        : { usage: zeroUsage(), webSearchMs: 0 };
      const llmResult = await callReviewerLlm({
        agentTimeoutMs: null,
        compactContext,
        fixture,
        mockOutput: buildReviewSubmissionDraft(
          fixture.packet,
          fixture.expenses,
        ),
        options,
        prompt:
          'Review this weekly batch. First cover the full expense batch through get_expenses pagination using detailLevel "overview". Use get_expenses detailLevel "detailed" only for selected ids or narrow filters that need every field. Perform the spend triage yourself from the fetched data, inspect receipt evidence, optionally use web_search only if public context would materially help, and submit the decisions through submit_review.',
        promptPreview: {
          availableTools: Object.keys(tools),
          compactContext,
          expenseCount: fixture.expenses.length,
          variant,
        },
        recorder,
        system: buildReviewerAgentPrompt({
          expenseCount: fixture.expenses.length,
          includeWebSearch: true,
          runtimeVariant: variant,
        }),
        tools,
      });
      return {
        ...llmResult,
        agentTimeoutMs: null,
        coldStartMs: 0,
        warmStartMs: 0,
        webSearchMs: dryWork.webSearchMs,
      };
    },
    { spanType: "EXECUTOR" },
  );
}

function parseGetExpensesCommandArgs(args) {
  const ids = [];
  let detailLevel = "overview";
  let limit;
  let offset = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--limit") {
      limit = Number.parseInt(args[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--offset") {
      offset = Number.parseInt(args[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--detail" || arg === "--detail-level") {
      const value = args[index + 1];
      if (value === "overview" || value === "detailed") {
        detailLevel = value;
      }
      index += 1;
      continue;
    }
    if (arg === "--overview") {
      detailLevel = "overview";
      continue;
    }
    if (arg === "--detailed") {
      detailLevel = "detailed";
      continue;
    }
    if (arg?.startsWith("-")) {
      continue;
    }
    if (arg) {
      ids.push(arg);
    }
  }
  return {
    detailLevel,
    ids,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  };
}

function makeGetExpensesCommand(fixture) {
  return defineCommand("get_expenses", async (args) => {
    const { detailLevel, ids, limit, offset } =
      parseGetExpensesCommandArgs(args);
    const result = queryCanonicalExpenses(fixture.expenses, {
      detailLevel,
      expenseIds: ids.length > 0 ? ids : undefined,
      limit,
      offset,
    });
    return {
      exitCode: 0,
      stderr: "",
      stdout: `${JSON.stringify(result)}\n`,
    };
  });
}

async function callAnalyzeReceiptTool({
  expenseIds,
  fixture,
  packet,
  recorder,
}) {
  const requestedExpenseIds = expenseIds ?? pickReceiptExpenseIds(packet);
  const uniqueExpenseIds = [...new Set(requestedExpenseIds ?? [])];
  if (uniqueExpenseIds.length === 0) {
    return [];
  }
  recorder.increment("toolCalls");
  return recorder.span(
    "tool.analyze_receipt",
    {
      "tool.name": "analyze_receipt",
      "tool.expense_count": uniqueExpenseIds.length,
    },
    async () =>
      uniqueExpenseIds.map((expenseId) => ({
        expenseId,
        receiptText: fixture.receiptsByExpenseId[expenseId] ?? "",
      })),
    {
      inputPreview: { expenseIds: uniqueExpenseIds },
      outputPreview: (result) => summarizeReceiptResults(result),
      spanType: "TOOL",
    },
  );
}

function makeAnalyzeReceiptCommand(fixture) {
  return defineCommand("analyze_receipt", async (args) => {
    const expenseIds = args.filter(Boolean);
    if (expenseIds.length === 0) {
      return {
        exitCode: 2,
        stderr: "usage: analyze_receipt <expense-id> [expense-id...]\n",
        stdout: "",
      };
    }
    return {
      exitCode: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        results: expenseIds.map((expenseId) => ({
          expenseId,
          receiptText: fixture.receiptsByExpenseId[expenseId] ?? "",
        })),
      })}\n`,
    };
  });
}

function makeGetUsersCommand(fixture) {
  return defineCommand("get_users", async (args) => {
    const userIds = args.filter(Boolean);
    return {
      exitCode: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        users: userIds.map((userId) => fixture.users[userId]).filter(Boolean),
      })}\n`,
    };
  });
}

function makeGetCasesCommand(fixture) {
  return defineCommand("get_cases", async (args) => {
    const userIds = args.filter(Boolean);
    const wanted = new Set(userIds);
    return {
      exitCode: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        cases:
          wanted.size === 0
            ? fixture.priorCases.slice(0, 50)
            : fixture.priorCases.filter((priorCase) =>
                wanted.has(priorCase.userId),
              ),
      })}\n`,
    };
  });
}

function makeAnalyzeCalendarEventsCommand(fixture) {
  return defineCommand("analyze_calendar_events", async (args) => {
    const userIds = args.filter(Boolean);
    return {
      exitCode: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        events: userIds.flatMap(
          (userId) => fixture.calendarEventsByUserId[userId] ?? [],
        ),
      })}\n`,
    };
  });
}

function shellCommandReadsExpenseData(name, command) {
  const commandName = String(name ?? "");
  const text = String(command ?? "");
  const writesExpenseFile =
    /\bcat\s*>\s*\/workspace\/expenses\.json\b/.test(text) ||
    /\bcat\s*>\s*expenses\.json\b/.test(text);
  if (
    commandName.startsWith("write_") ||
    commandName === "copy_submit_review_cli" ||
    commandName === "build_image" ||
    writesExpenseFile
  ) {
    return false;
  }
  return (
    commandName === "read_expenses" ||
    text.includes("/workspace/expenses.json") ||
    /\bget_expenses\b/.test(text) ||
    /(?:^|[\s"'(])(?:\.\/)?expenses\.json\b/.test(text)
  );
}

async function runBashCommand(recorder, sandbox, name, command) {
  recorder.increment("bashExecs");
  return recorder.span(
    `bash.exec ${name}`,
    {
      "bash.command": name,
      "shell.reads_expenses": shellCommandReadsExpenseData(name, command),
    },
    async () => {
      const result = await sandbox.exec(command, { cwd: "/workspace" });
      if (result.exitCode !== 0) {
        const { stderr, stdout } = result;
        throw new Error(stderr || stdout || `bash command failed: ${name}`);
      }
      return result.stdout;
    },
    {
      inputPreview: {
        command: truncateText(command, 240),
      },
      outputPreview: (stdout) =>
        stdout.trim()
          ? { stdoutPreview: truncateText(stdout, 220) }
          : undefined,
      spanType: "TOOL",
    },
  );
}

async function runJustBashVariant({ fixture, options, recorder }) {
  return recorder.span(
    "agent.review_week",
    {
      "agent.interface_surface": "bash",
      filesystem: "InMemoryFs",
      "interface.count": 1,
      "python.enabled": true,
    },
    async () => {
      const submissionState = {
        output: null,
        submittedAt: null,
      };
      const coldStartStarted = performance.now();
      const sandbox = new Bash({
        customCommands: [
          makeGetExpensesCommand(fixture),
          makeAnalyzeReceiptCommand(fixture),
          makeGetUsersCommand(fixture),
          makeGetCasesCommand(fixture),
          makeAnalyzeCalendarEventsCommand(fixture),
          makeWebSearchCommand({ fixture, options, recorder }),
          makeSubmitReviewCommand({
            fixture,
            recorder,
            state: submissionState,
          }),
        ],
        cwd: "/workspace",
        defenseInDepth: true,
        executionLimits: {
          maxCommandCount: 1000,
          maxPythonTimeoutMs: 10000,
        },
        fs: new InMemoryFs({
          "/tmp/.keep": "",
          ...createSpendAuditWorkspace(fixture),
        }),
        python: true,
      });
      const coldStartMs = performance.now() - coldStartStarted;
      const warmStartStarted = performance.now();
      const warmResult = await sandbox.exec(":", { cwd: "/workspace" });
      if (warmResult.exitCode !== 0) {
        throw new Error(
          warmResult.stderr || warmResult.stdout || "warm start probe failed",
        );
      }
      const warmStartMs = performance.now() - warmStartStarted;
      const tools = buildShellReviewerTools({
        description: SHELL_REVIEWER_TOOL_DESCRIPTION,
        executeCommand: async (command) => ({
          stdout: await runBashCommand(
            recorder,
            sandbox,
            summarizeShellCommandName(command),
            command,
          ),
        }),
      });
      if (options.mockLlm) {
        for (const dryCommand of buildShellDryCommands(fixture)) {
          await runBashCommand(
            recorder,
            sandbox,
            dryCommand.name,
            dryCommand.command,
          );
        }
      }
      const llmResult = await callReviewerLlm({
        fixture,
        mockOutput: buildReviewSubmissionDraft(
          fixture.packet,
          fixture.expenses,
        ),
        options,
        prompt: SHELL_REVIEWER_TASK_PROMPT,
        promptPreview: {
          availableTools: Object.keys(tools),
          expenseCount: fixture.expenses.length,
          variant: "just-bash",
        },
        recorder,
        submissionState,
        submitReviewMode: "cli",
        system: buildReviewerAgentPrompt({
          expenseCount: fixture.expenses.length,
          includeWebSearch: true,
          runtimeVariant: "just-bash",
          shellInstructions: SHELL_REVIEWER_SYSTEM_INSTRUCTIONS,
        }),
        tools,
      });
      return { ...llmResult, coldStartMs, warmStartMs };
    },
    { spanType: "EXECUTOR" },
  );
}

async function runProcess(command, args, options = {}) {
  const child = spawn(command, args, {
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
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${stderr || stdout}`,
    );
  }
  return { stderr, stdout };
}

async function buildDockerImage() {
  await runProcess("docker", [
    "build",
    "-t",
    DOCKER_IMAGE,
    "-f",
    "docker/Dockerfile",
    ".",
  ]);
}

async function runDockerExec(recorder, containerName, name, script, input) {
  recorder.increment("dockerExecs");
  const inputArgs = input === undefined ? [] : ["-i"];
  return recorder.span(
    `sandbox.exec ${name}`,
    {
      "docker.image": DOCKER_IMAGE,
      "sandbox.command": name,
      "shell.reads_expenses": shellCommandReadsExpenseData(name, script),
    },
    async () =>
      (
        await runProcess(
          "docker",
          ["exec", ...inputArgs, containerName, "bash", "-lc", script],
          { input },
        )
      ).stdout,
    {
      inputPreview: {
        command: truncateText(script, 240),
        inputPreview:
          input === undefined ? undefined : truncateText(input, 220),
      },
      outputPreview: (stdout) =>
        stdout.trim()
          ? { stdoutPreview: truncateText(stdout, 220) }
          : undefined,
      spanType: "TOOL",
    },
  );
}

async function readDockerFile(containerName, filePath) {
  return (await runProcess("docker", ["exec", containerName, "cat", filePath]))
    .stdout;
}

function parseBytes(value) {
  const match = value.trim().match(/^([0-9.]+)\s*([kmgtp]?i?b)$/i);
  if (!match) {
    return 0;
  }
  const amount = Number.parseFloat(match[1]);
  const multiplier = {
    b: 1,
    gb: 1000 ** 3,
    gib: 1024 ** 3,
    kb: 1000,
    kib: 1024,
    mb: 1000 ** 2,
    mib: 1024 ** 2,
  }[match[2].toLowerCase()];
  return amount * (multiplier ?? 1);
}

async function readDockerMemory(containerName) {
  const output = (
    await runProcess("docker", [
      "stats",
      "--no-stream",
      "--format",
      "{{json .}}",
      containerName,
    ])
  ).stdout;
  const row = JSON.parse(output.trim());
  return parseBytes(String(row.MemUsage ?? "").split("/")[0] ?? "0B");
}

async function readDockerCgroupMemory(containerName) {
  const script = String.raw`
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
`;
  try {
    return JSON.parse(
      (
        await runProcess("docker", [
          "exec",
          containerName,
          "bash",
          "-lc",
          script,
        ])
      ).stdout.trim(),
    );
  } catch {
    return { currentBytes: 0, peakBytes: 0 };
  }
}

async function readDockerMemoryStats(containerName) {
  const statsCurrentBytes = await readDockerMemory(containerName);
  const cgroup = await readDockerCgroupMemory(containerName);
  const currentBytes = cgroup.currentBytes || statsCurrentBytes;
  const peakBytes = Math.max(cgroup.peakBytes || 0, currentBytes);
  return {
    currentBytes,
    peakBytes,
    source: cgroup.currentBytes || cgroup.peakBytes ? "cgroup" : "docker_stats",
    statsCurrentBytes,
  };
}

async function runSandboxVariant({ fixture, options, recorder, runId }) {
  const containerName = `expense-review-bench-${runId}-${recorder.run}`;
  let started = false;
  try {
    return await recorder.span(
      "agent.review_week",
      { "agent.interface_surface": "sandboxed_bash", "interface.count": 1 },
      async () => {
        const submissionState = {
          output: null,
          submittedAt: null,
        };
        const coldStartStarted = performance.now();
        await runProcess("docker", [
          "run",
          "-d",
          "--rm",
          "--name",
          containerName,
          "--network",
          "none",
          DOCKER_IMAGE,
        ]);
        started = true;
        const coldStartMs = performance.now() - coldStartStarted;
        const warmStartStarted = performance.now();
        await runProcess("docker", ["exec", containerName, "bash", "-lc", ":"]);
        const warmStartMs = performance.now() - warmStartStarted;
        const prepStarted = performance.now();
        const workspaceFiles = createSpendAuditWorkspace(fixture);
        await runDockerExec(
          recorder,
          containerName,
          "mkdir_workspace_scripts",
          `
set -e
mkdir -p /workspace/scripts
`,
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_expenses",
          `
set -e
cat > /workspace/expenses.json
`,
          workspaceFiles["/workspace/expenses.json"],
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_receipts",
          `
set -e
cat > /tmp/receipts.json
`,
          `${JSON.stringify(fixture.receiptsByExpenseId)}\n`,
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_users",
          `
set -e
cat > /workspace/users.json
`,
          workspaceFiles["/workspace/users.json"],
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_prior_cases",
          `
set -e
cat > /workspace/prior-cases.json
`,
          workspaceFiles["/workspace/prior-cases.json"],
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_calendar_events",
          `
set -e
cat > /workspace/calendar-events.json
`,
          workspaceFiles["/workspace/calendar-events.json"],
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_policy",
          `
set -e
cat > /workspace/policy.md
`,
          workspaceFiles["/workspace/policy.md"],
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_get_expenses_script",
          `
set -e
cat > /usr/local/bin/get_expenses <<'PY'
#!/usr/bin/env python3
import json
import sys

data = json.load(open('/workspace/expenses.json'))
expenses = data.get('expenses', []) if isinstance(data, dict) else data
ids = []
detail_level = 'overview'
limit = None
offset = 0
args = sys.argv[1:]
index = 0
while index < len(args):
    arg = args[index]
    if arg == '--limit':
        index += 1
        if index < len(args):
            try:
                limit = int(args[index])
            except ValueError:
                limit = None
    elif arg == '--offset':
        index += 1
        if index < len(args):
            try:
                offset = int(args[index])
            except ValueError:
                offset = 0
    elif arg in ('--detail', '--detail-level'):
        index += 1
        if index < len(args) and args[index] in ('overview', 'detailed'):
            detail_level = args[index]
    elif arg == '--overview':
        detail_level = 'overview'
    elif arg == '--detailed':
        detail_level = 'detailed'
    elif not arg.startswith('-'):
        ids.append(arg)
    index += 1

if ids:
    id_set = set(ids)
    expenses = [expense for expense in expenses if expense.get('expenseId') in id_set]

expenses = sorted(expenses, key=lambda row: row.get("purchasedAt", ""), reverse=True)
matched_count = len(expenses)
all_matches = expenses
offset = max(0, offset)
if limit is None or limit <= 0:
    limit = 25
limit = max(1, limit)
page = expenses[offset:offset + limit]

def count_by(rows, key):
    out = {}
    for row in rows:
        value = row.get(key, 'unknown')
        out[value] = out.get(value, 0) + 1
    return dict(sorted(out.items()))

def amount_by(rows, key):
    out = {}
    for row in rows:
        value = row.get(key, 'unknown')
        out[value] = round(out.get(value, 0) + float(row.get('amountUsd', 0)), 2)
    return dict(sorted(out.items()))

def top_by_count(rows, key, limit=8):
    counts = count_by(rows, key)
    return [
        {"key": row_key, "count": count}
        for row_key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]

duplicate_receipt_fingerprints = [
    {"receiptFingerprint": receipt_fingerprint, "count": count}
    for receipt_fingerprint, count in sorted(
        (
            (receipt_fingerprint, count)
            for receipt_fingerprint, count in count_by(all_matches, "receiptFingerprint").items()
            if count > 1
        ),
        key=lambda item: (-item[1], item[0]),
    )[:12]
]

def overview(row):
    return [
        row.get("expenseId"),
        row.get("expenseType"),
        row.get("amountUsd"),
        row.get("category"),
        row.get("merchant"),
        row.get("userId"),
        row.get("receiptFingerprint"),
        row.get("receiptStatus"),
    ]

summary = {
    "amountByCategory": amount_by(all_matches, "category"),
    "amountByExpenseType": amount_by(all_matches, "expenseType"),
    "amountReviewedUsd": round(sum(float(row.get("amountUsd", 0)) for row in all_matches), 2),
    "countsByCategory": count_by(all_matches, "category"),
    "countsByExpenseType": count_by(all_matches, "expenseType"),
    "countsByReceiptStatus": count_by(all_matches, "receiptStatus"),
    "duplicateReceiptFingerprints": duplicate_receipt_fingerprints,
    "merchantCount": len(set(row.get("merchant") for row in all_matches)),
    "sampleExpenseIds": [row.get("expenseId") for row in page[:5]],
    "topMerchants": top_by_count(all_matches, "merchant"),
    "topUsers": top_by_count(all_matches, "userId"),
    "userCount": len(set(row.get("userId") for row in all_matches)),
}

result = {
    "detailLevel": detail_level,
    "hasMore": offset + len(page) < matched_count,
    "limit": limit,
    "matchedCount": matched_count,
    "offset": offset,
    "returnedCount": len(page),
    "summary": summary if offset == 0 else {
        "aggregateSummaryIncludedOnOffset": 0,
        "sampleExpenseIds": [row.get("expenseId") for row in page[:5]],
    },
}

if detail_level == "overview":
    result["overview"] = {
        "fields": [
            "id",
            "type",
            "usd",
            "cat",
            "merchant",
            "user",
            "receiptFp",
            "receipt",
        ],
        "items": [overview(row) for row in page],
        "rowFormat": "array values correspond to fields by position to keep model context compact; id values are exact expense ids",
    }
else:
    result["expenseIds"] = [row.get("expenseId") for row in page]
    result["fields"] = [
        "expenseId",
        "expenseType",
        "amountUsd",
        "category",
        "merchant",
        "merchantType",
        "userId",
        "paymentChannel",
        "receiptFingerprint",
        "receiptStatus",
        "purchasedAt",
        "cityCode",
        "memo",
    ]
    result["expenses"] = page

print(json.dumps(result))
PY
chmod +x /usr/local/bin/get_expenses
`,
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_analyze_receipt_script",
          `
set -e
cat > /usr/local/bin/analyze_receipt <<'PY'
#!/usr/bin/env python3
import json
import sys

if len(sys.argv) < 2:
    print("usage: analyze_receipt <expense-id> [expense-id...]", file=sys.stderr)
    sys.exit(2)

receipts = json.load(open('/tmp/receipts.json'))
results = [
    {
        "expenseId": expense_id,
        "receiptText": receipts.get(expense_id, ""),
    }
    for expense_id in sys.argv[1:]
]
print(json.dumps({"results": results}))
PY
chmod +x /usr/local/bin/analyze_receipt
`,
        );
        await runDockerExec(
          recorder,
          containerName,
          "write_context_scripts",
          `
set -e
cat > /usr/local/bin/get_users <<'PY'
#!/usr/bin/env python3
import json
import sys

users = json.load(open('/workspace/users.json'))['users']
print(json.dumps({"users": [users[user_id] for user_id in sys.argv[1:] if user_id in users]}))
PY
cat > /usr/local/bin/get_cases <<'PY'
#!/usr/bin/env python3
import json
import sys

cases = json.load(open('/workspace/prior-cases.json'))['cases']
ids = set(sys.argv[1:])
if ids:
    cases = [case for case in cases if case.get('userId') in ids]
else:
    cases = cases[:50]
print(json.dumps({"cases": cases}))
PY
cat > /usr/local/bin/analyze_calendar_events <<'PY'
#!/usr/bin/env python3
import json
import sys

events_by_user = json.load(open('/workspace/calendar-events.json'))
events = []
for user_id in sys.argv[1:]:
    events.extend(events_by_user.get(user_id, []))
print(json.dumps({"events": events}))
PY
chmod +x /usr/local/bin/get_users /usr/local/bin/get_cases /usr/local/bin/analyze_calendar_events
`,
        );
        const prepMs = performance.now() - prepStarted;
        const containerMemoryStats = await readDockerMemoryStats(containerName);
        const containerMemoryBytes = containerMemoryStats.currentBytes;
        const tools = buildShellReviewerTools({
          description: SHELL_REVIEWER_TOOL_DESCRIPTION,
          executeCommand: async (command) => ({
            stdout: await runDockerExec(
              recorder,
              containerName,
              summarizeShellCommandName(command),
              command,
            ),
          }),
          interceptCommand: async (command) =>
            (await interceptSubmitReviewCli({
              command,
              fixture,
              readRuntimeFile: (filePath) =>
                readDockerFile(containerName, resolveRuntimeFilePath(filePath)),
              recorder,
              spanName: "sandbox.exec submit_review",
              state: submissionState,
              submissionMode: "sandbox_cli",
            })) ??
            (await interceptWebSearchCli({
              command,
              fixture,
              options,
              recorder,
              spanName: "sandbox.exec web_search",
              writeRuntimeFile: async (filePath, content) => {
                await runDockerExec(
                  recorder,
                  containerName,
                  "write_web_search_output",
                  `
set -e
cat > ${shellQuote(filePath)}
`,
                  content,
                );
              },
            })),
        });
        if (options.mockLlm) {
          for (const dryCommand of buildShellDryCommands(fixture)) {
            if (dryCommand.name === "web_search") {
              await interceptWebSearchCli({
                command: dryCommand.command,
                fixture,
                options,
                recorder,
                spanName: "sandbox.exec web_search",
                writeRuntimeFile: async (filePath, content) => {
                  await runDockerExec(
                    recorder,
                    containerName,
                    "write_web_search_output",
                    `
set -e
cat > ${shellQuote(filePath)}
`,
                    content,
                  );
                },
              });
              continue;
            }
            if (dryCommand.name === "submit_review") {
              await interceptSubmitReviewCli({
                command: dryCommand.command,
                fixture,
                readRuntimeFile: (filePath) =>
                  readDockerFile(
                    containerName,
                    resolveRuntimeFilePath(filePath),
                  ),
                recorder,
                spanName: "sandbox.exec submit_review",
                state: submissionState,
                submissionMode: "sandbox_cli",
              });
              continue;
            }
            await runDockerExec(
              recorder,
              containerName,
              dryCommand.name,
              dryCommand.command,
            );
          }
        }
        const llmResult = await callReviewerLlm({
          fixture,
          mockOutput: buildReviewSubmissionDraft(
            fixture.packet,
            fixture.expenses,
          ),
          options,
          prompt: SHELL_REVIEWER_TASK_PROMPT,
          promptPreview: {
            availableTools: Object.keys(tools),
            expenseCount: fixture.expenses.length,
            variant: "sandbox",
          },
          recorder,
          submissionState,
          submitReviewMode: "cli",
          system: buildReviewerAgentPrompt({
            expenseCount: fixture.expenses.length,
            includeWebSearch: true,
            runtimeVariant: "sandbox",
            shellInstructions: SHELL_REVIEWER_SYSTEM_INSTRUCTIONS,
          }),
          tools,
        });
        return {
          ...llmResult,
          coldStartMs,
          containerMemoryBytes,
          containerMemoryStats,
          prepMs,
          warmStartMs,
        };
      },
      { spanType: "EXECUTOR" },
    );
  } finally {
    if (started) {
      try {
        await runProcess("docker", ["rm", "-f", containerName]);
      } catch {
        // Best effort cleanup.
      }
    }
  }
}

async function runVariant({
  fixture,
  options,
  run,
  runId,
  sessionId,
  traceController,
  variant,
}) {
  await forceGc();
  const baselineMemory = memorySnapshot();
  const peakTracker = createPeakTracker();
  const recorder = new Recorder({ run, sessionId, traceController, variant });
  const started = performance.now();
  peakTracker.start();
  let result;
  let error = null;
  let traceId = null;
  try {
    result = await recorder.span(
      "trace.variant_run",
      {
        "benchmark.root_trace": true,
        "benchmark.run_id": runId,
        "benchmark.run_index": run,
      },
      async () => {
        traceId = traceController.getTraceId();
        if (variant === "tool") {
          return runToolVariant({ fixture, options, recorder, variant });
        }
        if (variant === "tool-compaction") {
          return runToolVariant({
            compactContext: true,
            fixture,
            options,
            recorder,
            variant,
          });
        }
        if (variant === "just-bash") {
          return runJustBashVariant({ fixture, options, recorder });
        }
        if (variant === "sandbox") {
          return runSandboxVariant({ fixture, options, recorder, runId });
        }
        throw new Error(`Unhandled variant: ${variant}`);
      },
      {
        inputPreview: {
          run,
          task: TASK_ID,
          variant,
        },
      },
    );
    result.expenseFetchCoverage = summarizeExpenseFetchCoverage(
      variant,
      recorder.spans,
      fixture.expenses.length,
    );
    result.triageCoverage = result.expenseFetchCoverage;
    result.evaluation = scoreReviewOutput(
      result.output,
      fixture.expectedReview,
    );
    result.outputValidation = validateCanonicalSubmittedOutput({
      fixture,
      output: result.output,
    });
    result.quality = assessRunQuality({
      outputValidation: result.outputValidation,
      qualityPassThreshold: options.qualityPassThreshold,
      result,
      spans: recorder.spans,
      triageCoverage: result.expenseFetchCoverage,
      variant,
    });
  } catch (caught) {
    error = caught;
  } finally {
    peakTracker.stop();
  }
  const wallMs = performance.now() - started;
  const totalMs = wallMs - (result?.warmStartMs ?? 0);
  await forceGc();
  const retainedMemory = memorySnapshot();
  const peakMemory = peakTracker.stop();
  const retainedDelta = memoryDelta(retainedMemory, baselineMemory);
  const peakDelta = memoryDelta(peakMemory, baselineMemory);
  const derivedPrepMs = recorder.spans
    .filter(
      (span) =>
        span.name.startsWith("tool.") ||
        span.name.startsWith("bash.exec") ||
        span.name.startsWith("sandbox.exec"),
    )
    .reduce((sum, span) => sum + (span.durationMs ?? 0), 0);
  const derivedWebSearchMs = recorder.spans
    .filter((span) => span.name === "tool.web_search")
    .reduce((sum, span) => sum + (span.durationMs ?? 0), 0);

  return {
    containerMemoryBytes: result?.containerMemoryBytes ?? 0,
    containerMemoryStats: result?.containerMemoryStats ?? null,
    counters: recorder.counters,
    error: error ? formatError(error) : undefined,
    errorClass: error ? classifyError(error) : undefined,
    evaluation: result?.evaluation ?? undefined,
    expenseFetchCoverage: result?.expenseFetchCoverage ?? undefined,
    agentTimeoutMs:
      result && Object.hasOwn(result, "agentTimeoutMs")
        ? result.agentTimeoutMs
        : LLM_TIMEOUT_MS,
    llmMs: result?.llmMs ?? totalMs,
    output: result?.output ?? null,
    outputValidation: result?.outputValidation ?? undefined,
    peakDelta,
    retainedDelta,
    run,
    coldStartMs: result?.coldStartMs ?? 0,
    spanCount: recorder.spans.length,
    spans: recorder.spans,
    prepMs: result?.prepMs ?? derivedPrepMs,
    quality:
      result?.quality ??
      (error
        ? undefined
        : assessRunQuality({
            outputValidation:
              result?.outputValidation ??
              validateCanonicalSubmittedOutput({
                fixture,
                output: result?.output,
              }),
            qualityPassThreshold: options.qualityPassThreshold,
            result,
            spans: recorder.spans,
            triageCoverage: summarizeExpenseFetchCoverage(
              variant,
              recorder.spans,
              fixture.expenses.length,
            ),
            variant,
          })),
    submitted: Boolean(result?.submitted),
    submittedAt: result?.submittedAt ?? null,
    status: error ? "error" : "ok",
    totalMs,
    traceId,
    triageCoverage:
      result?.triageCoverage ??
      summarizeExpenseFetchCoverage(
        variant,
        recorder.spans,
        fixture.expenses.length,
      ),
    expenseFetchCoverage:
      result?.expenseFetchCoverage ??
      summarizeExpenseFetchCoverage(
        variant,
        recorder.spans,
        fixture.expenses.length,
      ),
    externalUsage: recorder.externalUsage,
    usage: addUsage(result?.usage ?? zeroUsage(), recorder.externalUsage),
    variant,
    wallMs,
    warmStartMs: result?.warmStartMs ?? 0,
    webSearchMs: Math.max(result?.webSearchMs ?? 0, derivedWebSearchMs),
    webSearchResults: recorder.webSearchResults,
  };
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[index];
}

function summarizeError(error) {
  const text =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return text.split("\n")[0].trim();
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function candidateKey(candidate) {
  return sortedUnique(candidate.expenseIds ?? []).join("|");
}

function setIntersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function f1(precision, recall) {
  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

function scoreReviewOutput(output, expectedReview) {
  const expectedCandidates = expectedReview.candidates;
  const predictedCandidates = Array.isArray(output?.decisions)
    ? output.decisions
        .filter((decision) => decision.outcome === "case")
        .map((decision) => ({
          ...decision,
          expenseIds: sortedUnique(decision.expenseIds ?? []),
          kind:
            decision.tags?.find((tag) => tag !== "NO_CASE") ??
            decision.title ??
            "case",
        }))
    : Array.isArray(output?.candidates)
      ? output.candidates.map((candidate) => ({
          ...candidate,
          expenseIds: sortedUnique(candidate.expenseIds ?? []),
        }))
      : [];

  const expectedByKey = new Map(
    expectedCandidates.map((candidate) => [candidateKey(candidate), candidate]),
  );
  const predictedByKey = new Map(
    predictedCandidates.map((candidate) => [
      candidateKey(candidate),
      candidate,
    ]),
  );
  const exactMatchedKeys = [...predictedByKey.keys()].filter((key) =>
    expectedByKey.has(key),
  );
  const expectedExpenseIds = sortedUnique(
    expectedCandidates.flatMap((candidate) => candidate.expenseIds),
  );
  const predictedExpenseIds = sortedUnique(
    predictedCandidates.flatMap((candidate) => candidate.expenseIds),
  );
  const expenseMatches = setIntersection(
    predictedExpenseIds,
    expectedExpenseIds,
  );

  let partialMatchCount = 0;
  const partialMatches = [];
  const unmatchedExpected = new Set(expectedCandidates.map(candidateKey));
  for (const predicted of predictedCandidates) {
    const predictedSet = sortedUnique(predicted.expenseIds ?? []);
    let best = null;
    for (const expected of expectedCandidates) {
      const overlap = setIntersection(predictedSet, expected.expenseIds);
      if (
        overlap.length === 0 ||
        !unmatchedExpected.has(candidateKey(expected))
      ) {
        continue;
      }
      const score =
        overlap.length /
        new Set([...predictedSet, ...expected.expenseIds]).size;
      if (!best || score > best.score) {
        best = { expected, overlap, score };
      }
    }
    if (best) {
      partialMatchCount++;
      unmatchedExpected.delete(candidateKey(best.expected));
      partialMatches.push({
        expectedExpenseIds: best.expected.expenseIds,
        expectedKind: best.expected.kind,
        overlapExpenseIds: best.overlap,
        predictedExpenseIds: predicted.expenseIds,
        predictedKind: predicted.kind ?? null,
        score: best.score,
      });
    }
  }

  const exactPrecision =
    predictedCandidates.length === 0
      ? 0
      : exactMatchedKeys.length / predictedCandidates.length;
  const exactRecall =
    expectedCandidates.length === 0
      ? 0
      : exactMatchedKeys.length / expectedCandidates.length;
  const expensePrecision =
    predictedExpenseIds.length === 0
      ? 0
      : expenseMatches.length / predictedExpenseIds.length;
  const expenseRecall =
    expectedExpenseIds.length === 0
      ? 0
      : expenseMatches.length / expectedExpenseIds.length;

  const kindComparable = exactMatchedKeys
    .map((key) => ({
      expected: expectedByKey.get(key),
      predicted: predictedByKey.get(key),
    }))
    .filter((entry) => entry.predicted?.kind);
  const kindCorrect = kindComparable.filter(
    (entry) => entry.expected.kind === entry.predicted.kind,
  ).length;

  return {
    exact: {
      f1: f1(exactPrecision, exactRecall),
      matched: exactMatchedKeys.length,
      precision: exactPrecision,
      recall: exactRecall,
    },
    expenseId: {
      f1: f1(expensePrecision, expenseRecall),
      matched: expenseMatches.length,
      precision: expensePrecision,
      recall: expenseRecall,
    },
    kind: {
      accuracy:
        kindComparable.length === 0 ? 0 : kindCorrect / kindComparable.length,
      comparable: kindComparable.length,
      correct: kindCorrect,
    },
    missingExpected: expectedCandidates
      .filter((candidate) => !predictedByKey.has(candidateKey(candidate)))
      .slice(0, 12)
      .map((candidate) => ({
        expenseIds: candidate.expenseIds,
        kind: candidate.kind,
        reasonSignals: candidate.reasonSignals,
      })),
    partial: {
      f1: f1(
        predictedCandidates.length === 0
          ? 0
          : partialMatchCount / predictedCandidates.length,
        expectedCandidates.length === 0
          ? 0
          : partialMatchCount / expectedCandidates.length,
      ),
      matched: partialMatchCount,
      matches: partialMatches.slice(0, 12),
      precision:
        predictedCandidates.length === 0
          ? 0
          : partialMatchCount / predictedCandidates.length,
      recall:
        expectedCandidates.length === 0
          ? 0
          : partialMatchCount / expectedCandidates.length,
    },
    predictedCandidateCount: predictedCandidates.length,
    predictedExpenseIdCount: predictedExpenseIds.length,
  };
}

function hasOnlyPaginationExpenseFilters(input = {}) {
  const allowedKeys = new Set(["detailLevel", "limit", "offset", "sortBy"]);
  return Object.keys(input ?? {}).every((key) => allowedKeys.has(key));
}

function summarizeNativeExpenseFetchCoverage(spans, expectedExpenseCount) {
  const fetchedExpenseIds = new Set();
  let matchedCount = 0;
  let pageCount = 0;

  for (const span of spans) {
    if (span.name !== "tool.get_expenses" || span.status !== "ok") {
      continue;
    }
    if (!hasOnlyPaginationExpenseFilters(span.inputPreview)) {
      continue;
    }

    pageCount += 1;
    matchedCount = Math.max(
      matchedCount,
      Number(span.outputPreview?.matchedCount ?? 0),
    );
    for (const expenseId of span.outputPreview?.expenseIds ?? []) {
      fetchedExpenseIds.add(expenseId);
    }
  }

  const coveredExpenseCount = fetchedExpenseIds.size;
  const completed = coveredExpenseCount >= expectedExpenseCount;
  return {
    completed,
    coveredExpenseCount,
    fetchedExpenseIdCount: fetchedExpenseIds.size,
    matchedCount,
    method: completed ? "native_get_expenses_pagination" : "missing",
    pageCount,
    requiredExpenseCount: expectedExpenseCount,
  };
}

function summarizeShellExpenseFetchCoverage(
  variant,
  spans,
  expectedExpenseCount,
) {
  const readSpan = spans.find((span) => {
    const command = String(span.inputPreview?.command ?? "");
    const commandName = String(
      span.attributes?.["bash.command"] ??
        span.attributes?.["sandbox.command"] ??
        "",
    );
    const isSetupCommand =
      commandName.startsWith("write_") ||
      commandName === "copy_submit_review_cli" ||
      commandName === "build_image";
    if (
      isSetupCommand ||
      /\bcat\s*>\s*\/workspace\/expenses\.json\b/.test(command)
    ) {
      return false;
    }
    return (
      (span.name.startsWith("bash.exec") ||
        span.name.startsWith("sandbox.exec")) &&
      span.attributes?.["shell.reads_expenses"] === true
    );
  });
  return {
    completed: Boolean(readSpan),
    coveredExpenseCount: readSpan ? expectedExpenseCount : 0,
    fetchedExpenseIdCount: readSpan ? expectedExpenseCount : 0,
    matchedCount: readSpan ? expectedExpenseCount : 0,
    method: readSpan ? `${variant}_agent_reads_expense_data` : "missing",
    pageCount: readSpan ? 1 : 0,
    requiredExpenseCount: expectedExpenseCount,
  };
}

function summarizeExpenseFetchCoverage(variant, spans, expectedExpenseCount) {
  if (isNativeToolVariant(variant)) {
    return summarizeNativeExpenseFetchCoverage(spans, expectedExpenseCount);
  }
  return summarizeShellExpenseFetchCoverage(
    variant,
    spans,
    expectedExpenseCount,
  );
}

function summarizeTriageCoverage(variant, spans, expectedExpenseCount) {
  return summarizeExpenseFetchCoverage(variant, spans, expectedExpenseCount);
}

function hasEvidenceToolWork(variant, spans) {
  if (isNativeToolVariant(variant)) {
    return spans.some(
      (span) =>
        span.name.startsWith("tool.") && span.name !== "tool.submit_review",
    );
  }
  return spans.some(
    (span) =>
      span.name.startsWith("bash.exec") || span.name.startsWith("sandbox.exec"),
  );
}

function assessRunQuality({
  judge,
  outputValidation,
  qualityPassThreshold,
  result,
  spans,
  triageCoverage,
  variant,
}) {
  const failureReasons = [];
  const submitted = Boolean(result?.submitted);
  const expenseFetchCompleted = Boolean(triageCoverage?.completed);
  const usedEvidenceTools = hasEvidenceToolWork(variant, spans);
  const usedWebSearch = spans.some((span) => span.name === "tool.web_search");

  if (!submitted) {
    failureReasons.push("missing_submission");
  }
  if (!expenseFetchCompleted) {
    failureReasons.push("missing_full_batch_expense_fetch");
  }
  if (!usedEvidenceTools) {
    failureReasons.push("no_evidence_tool_work");
  }
  if (!outputValidation?.schemaValid) {
    failureReasons.push("invalid_submission_schema");
  }
  if (!outputValidation?.validExpenseIds) {
    failureReasons.push("invalid_expense_ids");
  }
  if (!outputValidation?.fullBatchCovered) {
    failureReasons.push("missing_terminal_decisions_for_full_batch");
  }
  if (!outputValidation?.exactlyOnceCovered) {
    failureReasons.push("expense_ids_not_covered_exactly_once");
  }

  const harnessFailureReasons = [...failureReasons];
  const harnessPass = harnessFailureReasons.length === 0;
  if (judge) {
    if (!judge.pass) {
      failureReasons.push(
        judge.criticalFailures?.length
          ? "judge_critical_failure"
          : "judge_score_below_threshold",
      );
    }
    if ((judge.totalScore ?? 0) < qualityPassThreshold) {
      failureReasons.push("judge_score_below_threshold");
    }
  }

  return {
    failureReasons,
    harnessFailureReasons,
    harnessPass,
    judgePass: judge?.pass ?? null,
    judgeScore: judge?.totalScore ?? null,
    mode: judge ? "judge" : "harness",
    pass: failureReasons.length === 0,
    qualityPassThreshold,
    submitted,
    expenseFetchCompleted,
    triageCompleted: expenseFetchCompleted,
    usedEvidenceTools,
    usedWebSearch,
    validation: outputValidation,
  };
}

function summarize(results) {
  const variants = [...new Set(results.map((result) => result.variant))];
  return variants.map((variant) => {
    const rows = results.filter((result) => result.variant === variant);
    const okRows = rows.filter((row) => row.status !== "error");
    const qualityPassRows = okRows.filter((row) => row.quality?.pass);
    const judgedRows = okRows.filter((row) => row.judge);
    const judgePassRows = judgedRows.filter((row) => row.judge?.pass);
    const submittedRows = okRows.filter((row) => row.quality?.submitted);
    const expenseFetchedRows = okRows.filter(
      (row) => row.quality?.expenseFetchCompleted,
    );
    const qualityFailures = {};
    for (const row of okRows) {
      for (const reason of row.quality?.failureReasons ?? []) {
        qualityFailures[reason] = (qualityFailures[reason] ?? 0) + 1;
      }
    }
    const metricRows = okRows.length > 0 ? okRows : rows;
    const pick = (fn) => metricRows.map(fn);
    const metric = (fn) => ({
      p70: percentile(pick(fn), 70),
      p90: percentile(pick(fn), 90),
      p95: percentile(pick(fn), 95),
      p99: percentile(pick(fn), 99),
    });
    const average = (fn) =>
      okRows.length === 0
        ? 0
        : okRows.reduce((sum, row) => sum + fn(row), 0) / okRows.length;
    return {
      avgBashExecs: average((row) => row.counters.bashExecs),
      avgCompactionPasses: average((row) => row.counters.compactionPasses ?? 0),
      avgDockerExecs: average((row) => row.counters.dockerExecs),
      avgLlmCalls: average((row) => row.counters.llmCalls),
      avgProviderFailures: average((row) => row.counters.providerFailures ?? 0),
      avgProviderRetries: average((row) => row.counters.providerRetries ?? 0),
      avgSpanCount: average((row) => row.spanCount),
      avgToolCalls: average((row) => row.counters.toolCalls),
      avgWebSearchCalls: average((row) => row.counters.webSearchCalls),
      rowsSubmissionRejections: okRows.reduce(
        (sum, row) => sum + (row.counters.submissionRejections ?? 0),
        0,
      ),
      errorCount: rows.length - okRows.length,
      evaluation: {
        exactF1: metric((row) => row.evaluation?.exact?.f1 ?? 0),
        exactRecall: metric((row) => row.evaluation?.exact?.recall ?? 0),
        expenseF1: metric((row) => row.evaluation?.expenseId?.f1 ?? 0),
        expenseRecall: metric((row) => row.evaluation?.expenseId?.recall ?? 0),
        partialF1: metric((row) => row.evaluation?.partial?.f1 ?? 0),
        partialRecall: metric((row) => row.evaluation?.partial?.recall ?? 0),
      },
      judge: {
        dimensions: Object.fromEntries(
          JUDGE_DIMENSIONS.map((dimension) => [
            dimension,
            metric((row) => row.judge?.dimensions?.[dimension] ?? 0),
          ]),
        ),
        passCount: judgePassRows.length,
        score: metric((row) => row.judge?.totalScore ?? 0),
      },
      memory: {
        containerBytes: metric((row) => row.containerMemoryBytes),
        containerPeakBytes: metric(
          (row) =>
            row.containerMemoryStats?.peakBytes ??
            row.containerMemoryBytes ??
            0,
        ),
        peakHeapUsedBytes: metric((row) => row.peakDelta.heapUsed),
        peakMaxRssBytes: metric(
          (row) => row.peakDelta.maxRss ?? row.peakDelta.rss,
        ),
        peakRssBytes: metric((row) => row.peakDelta.rss),
        retainedRssBytes: metric((row) => row.retainedDelta.rss),
        runtimeWorkingSetBytes: metric((row) =>
          row.variant === "sandbox"
            ? (row.containerMemoryStats?.peakBytes ??
              row.containerMemoryBytes ??
              0)
            : row.peakDelta.rss,
        ),
      },
      time: {
        coldStartMs: metric((row) => row.coldStartMs),
        llmMs: metric((row) => row.llmMs),
        prepMs: metric((row) => row.prepMs),
        totalMs: metric((row) => row.totalMs),
        warmStartMs: metric((row) => row.warmStartMs),
        webSearchMs: metric((row) => row.webSearchMs),
      },
      tokens: {
        completion: metric((row) => row.usage.completionTokens),
        prompt: metric((row) => row.usage.promptTokens),
        total: metric((row) => row.usage.totalTokens),
      },
      runCount: rows.length,
      qualityFailureBreakdown: qualityFailures,
      judgedCount: judgedRows.length,
      judgePassCount: judgePassRows.length,
      qualityPassCount: qualityPassRows.length,
      qualityPassRate:
        okRows.length === 0 ? 0 : qualityPassRows.length / okRows.length,
      successCount: okRows.length,
      successRate: rows.length === 0 ? 0 : okRows.length / rows.length,
      submittedCount: submittedRows.length,
      expenseFetchCompletedCount: expenseFetchedRows.length,
      triageCompletedCount: expenseFetchedRows.length,
      variant,
    };
  });
}

function printSummary(summary) {
  printTable(
    summary,
    [
      { header: "variant", value: (row) => row.variant },
      {
        header: "ok",
        value: (row) => `${row.successCount}/${row.runCount}`,
      },
      {
        header: "quality",
        value: (row) => `${row.qualityPassCount}/${row.successCount}`,
      },
      {
        header: "submitted",
        value: (row) => `${row.submittedCount}/${row.successCount}`,
      },
      { header: "tokP70", value: (row) => row.tokens.total.p70.toFixed(0) },
      { header: "tokP90", value: (row) => row.tokens.total.p90.toFixed(0) },
      { header: "tokP95", value: (row) => row.tokens.total.p95.toFixed(0) },
      { header: "tokP99", value: (row) => row.tokens.total.p99.toFixed(0) },
      { header: "promptP95", value: (row) => row.tokens.prompt.p95.toFixed(0) },
      {
        header: "compP95",
        value: (row) => row.tokens.completion.p95.toFixed(0),
      },
    ],
    "token percentiles",
  );
  console.log("");
  printTable(
    summary,
    [
      { header: "variant", value: (row) => row.variant },
      {
        header: "judged",
        value: (row) => `${row.judgedCount}/${row.successCount}`,
      },
      {
        header: "judgePass",
        value: (row) => `${row.judgePassCount}/${row.judgedCount}`,
      },
      {
        header: "scoreP70",
        value: (row) => row.judge.score.p70.toFixed(1),
      },
      {
        header: "scoreP90",
        value: (row) => row.judge.score.p90.toFixed(1),
      },
      {
        header: "scoreP95",
        value: (row) => row.judge.score.p95.toFixed(1),
      },
      {
        header: "scoreP99",
        value: (row) => row.judge.score.p99.toFixed(1),
      },
    ],
    "judge quality percentiles",
  );
  console.log("");
  printTable(
    summary,
    [
      { header: "variant", value: (row) => row.variant },
      {
        header: "exactF1P95",
        value: (row) => row.evaluation.exactF1.p95.toFixed(3),
      },
      {
        header: "partialF1P95",
        value: (row) => row.evaluation.partialF1.p95.toFixed(3),
      },
      {
        header: "expenseF1P95",
        value: (row) => row.evaluation.expenseF1.p95.toFixed(3),
      },
      {
        header: "expenseRecallP95",
        value: (row) => row.evaluation.expenseRecall.p95.toFixed(3),
      },
      {
        header: "expenseF1P99",
        value: (row) => row.evaluation.expenseF1.p99.toFixed(3),
      },
      { header: "errors", value: (row) => String(row.errorCount) },
    ],
    "accuracy percentiles",
  );
  console.log("");
  printTable(
    summary,
    [
      { header: "variant", value: (row) => row.variant },
      {
        header: "coldP95",
        value: (row) => row.time.coldStartMs.p95.toFixed(0),
      },
      {
        header: "warmP95",
        value: (row) => row.time.warmStartMs.p95.toFixed(0),
      },
      {
        header: "webP95",
        value: (row) => row.time.webSearchMs.p95.toFixed(0),
      },
      { header: "prepP95", value: (row) => row.time.prepMs.p95.toFixed(0) },
      { header: "totalP70", value: (row) => row.time.totalMs.p70.toFixed(0) },
      { header: "totalP90", value: (row) => row.time.totalMs.p90.toFixed(0) },
      { header: "totalP95", value: (row) => row.time.totalMs.p95.toFixed(0) },
      { header: "totalP99", value: (row) => row.time.totalMs.p99.toFixed(0) },
      { header: "llmP95", value: (row) => row.time.llmMs.p95.toFixed(0) },
    ],
    "time percentiles, ms",
  );
  console.log("");
  printTable(
    summary,
    [
      { header: "variant", value: (row) => row.variant },
      {
        header: "workSetP70",
        value: (row) => formatMiB(row.memory.runtimeWorkingSetBytes.p70),
      },
      {
        header: "workSetP90",
        value: (row) => formatMiB(row.memory.runtimeWorkingSetBytes.p90),
      },
      {
        header: "workSetP95",
        value: (row) => formatMiB(row.memory.runtimeWorkingSetBytes.p95),
      },
      {
        header: "workSetP99",
        value: (row) => formatMiB(row.memory.runtimeWorkingSetBytes.p99),
      },
      {
        header: "hostPeakP95",
        value: (row) => formatMiB(row.memory.peakRssBytes.p95),
      },
      {
        header: "hostRetP95",
        value: (row) => formatMiB(row.memory.retainedRssBytes.p95),
      },
      {
        header: "contPeakP95",
        value: (row) =>
          row.memory.containerPeakBytes.p95 > 0
            ? formatMiB(row.memory.containerPeakBytes.p95)
            : "-",
      },
    ],
    "memory percentiles, MiB",
  );
  console.log("");
  printTable(
    summary,
    [
      { header: "variant", value: (row) => row.variant },
      { header: "tools", value: (row) => row.avgToolCalls.toFixed(1) },
      { header: "webCalls", value: (row) => row.avgWebSearchCalls.toFixed(1) },
      {
        header: "compact",
        value: (row) => row.avgCompactionPasses.toFixed(1),
      },
      { header: "llmCalls", value: (row) => row.avgLlmCalls.toFixed(1) },
      {
        header: "submit",
        value: (row) =>
          (row.successCount === 0
            ? 0
            : row.submittedCount / row.successCount
          ).toFixed(1),
      },
      {
        header: "rejects",
        value: (row) =>
          (
            (row.successCount === 0
              ? 0
              : row.rowsSubmissionRejections / row.successCount) || 0
          ).toFixed(1),
      },
      { header: "bashExecs", value: (row) => row.avgBashExecs.toFixed(1) },
      {
        header: "dockerExecs",
        value: (row) => row.avgDockerExecs.toFixed(1),
      },
      { header: "spans", value: (row) => row.avgSpanCount.toFixed(1) },
    ],
    "interface activity",
  );
}

function findVariantSummary(summary, variant) {
  return summary.find((row) => row.variant === variant);
}

function pickInterestingSpanNames(variant) {
  if (isNativeToolVariant(variant)) {
    return [
      "tool.get_expenses",
      "tool.analyze_receipt",
      "tool.web_search",
      "tool.submit_review",
      "llm.context_compaction",
      "llm.review_spend_decisions",
    ];
  }
  if (variant === "just-bash") {
    return [
      "bash.exec read_expenses",
      "bash.exec analyze_receipt",
      "bash.exec web_search",
      "bash.exec submit_review",
      "tool.web_search",
      "tool.submit_review",
      "llm.review_spend_decisions",
    ];
  }
  if (variant === "sandbox") {
    return [
      "sandbox.exec read_expenses",
      "sandbox.exec analyze_receipt",
      "sandbox.exec web_search",
      "sandbox.exec submit_review",
      "tool.web_search",
      "tool.submit_review",
      "llm.review_spend_decisions",
    ];
  }
  return [];
}

function summarizeSpanForTraceSample(span) {
  const attributes = Object.fromEntries(
    Object.entries(span.attributes ?? {}).filter(([key]) =>
      [
        "bash.command",
        "docker.image",
        "llm.compaction.compacted_message_count",
        "llm.compaction.compacted_tokens_estimate",
        "llm.compaction.message_count",
        "llm.compaction.original_tokens_estimate",
        "llm.model",
        "prompt.bytes",
        "sandbox.command",
        "shell.command",
        "shell.host_mediated",
        "shell.reads_expenses",
        "tool.expense_count",
        "tool.name",
        "tool.query_count",
        "tool.submission_mode",
      ].includes(key),
    ),
  );
  return {
    attributes,
    durationMs: span.durationMs ?? 0,
    inputPreview: span.inputPreview,
    name: span.name,
    outputPreview: span.outputPreview,
  };
}

function buildTraceSamples(results) {
  const seenVariants = new Set();
  const samples = [];

  for (const result of results) {
    if (seenVariants.has(result.variant)) {
      continue;
    }
    seenVariants.add(result.variant);
    const wanted = new Set(pickInterestingSpanNames(result.variant));
    samples.push({
      run: result.run,
      traceId: result.traceId ?? null,
      spans: result.spans
        .filter((span) => wanted.has(span.name))
        .map(summarizeSpanForTraceSample),
      variant: result.variant,
    });
  }

  return samples;
}

function formatTraceSampleValue(value, maxChars = 260) {
  if (value === undefined) {
    return undefined;
  }
  return previewValue(value, maxChars);
}

function buildTraceSampleMarkdown(traceSamples) {
  const lines = [
    `## Sample Trace Slices`,
    "",
    `These are real local spans from one benchmark run. Each variant below is one trace slice. I am only showing the spans that make the runtime shape obvious.`,
    "",
  ];

  for (const sample of traceSamples) {
    lines.push(`### \`${sample.variant}\``);
    lines.push("");
    if (sample.traceId) {
      lines.push(`- trace: \`${sample.traceId}\``);
    }
    for (const span of sample.spans) {
      lines.push(`- \`${span.name}\` (${span.durationMs.toFixed(0)}ms)`);
      if (Object.keys(span.attributes).length > 0) {
        lines.push(
          `  - attributes: ${formatTraceSampleValue(span.attributes)}`,
        );
      }
      if (span.inputPreview !== undefined) {
        lines.push(
          `  - input: ${formatTraceSampleValue(span.inputPreview, 320)}`,
        );
      }
      if (span.outputPreview !== undefined) {
        lines.push(
          `  - output: ${formatTraceSampleValue(span.outputPreview, 320)}`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildReadout(report) {
  const lines = [];
  const tool = findVariantSummary(report.summary, "tool");
  const toolCompaction = findVariantSummary(report.summary, "tool-compaction");
  const justBash = findVariantSummary(report.summary, "just-bash");
  const sandbox = findVariantSummary(report.summary, "sandbox");

  lines.push(`Company Spend Audit Benchmark Readout`);
  lines.push(
    `Fixture: ${report.fixture.expenseCount.toLocaleString()} anonymized company-paid expenses and reimbursements, ${report.fixture.expectedSpendSignals.length} diagnostic spend-pattern signals, ${REVIEW_POLICY.split(/\s+/).filter(Boolean).length.toLocaleString()} policy words.`,
  );

  if (tool || toolCompaction) {
    lines.push(
      `All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.`,
    );
  }

  if (justBash && sandbox) {
    lines.push(
      `Sandbox cold-start is ${sandbox.time.coldStartMs.p95.toFixed(0)}ms P95 and warm-start is ${sandbox.time.warmStartMs.p95.toFixed(0)}ms P95, versus ${justBash.time.coldStartMs.p95.toFixed(0)}ms and ${justBash.time.warmStartMs.p95.toFixed(0)}ms for just-bash.`,
    );
    lines.push(
      `Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.`,
    );
  }

  return lines;
}

function buildTraceRefs(results) {
  return results
    .filter((result) => result.traceId)
    .map((result) => ({
      run: result.run,
      traceId: result.traceId,
      variant: result.variant,
    }));
}

function summarizeBatchMetric({
  batch,
  batchResults,
  baselineMemory,
  elapsedMs,
  peakMemory,
  retainedMemory,
}) {
  const hostPeakDelta = memoryDelta(peakMemory, baselineMemory);
  const hostRetainedDelta = memoryDelta(retainedMemory, baselineMemory);
  const containerPeakBytes = batchResults.reduce(
    (sum, result) =>
      sum +
      (result.containerMemoryStats?.peakBytes ??
        result.containerMemoryBytes ??
        0),
    0,
  );
  const containerCurrentBytes = batchResults.reduce(
    (sum, result) => sum + (result.containerMemoryBytes ?? 0),
    0,
  );
  const totalPeakWorkingSetBytes = hostPeakDelta.rss + containerPeakBytes;
  return {
    batchIndex: batch.index,
    batchSize: batch.tasks.length,
    containerCurrentBytes,
    containerPeakBytes,
    elapsedMs,
    hostPeakDelta,
    hostRetainedDelta,
    peakDelta: hostPeakDelta,
    retainedDelta: hostRetainedDelta,
    runKeys: batch.tasks.map((task) => `${task.variant}#${task.run}`),
    statusCounts: {
      error: batchResults.filter((result) => result.status === "error").length,
      ok: batchResults.filter((result) => result.status !== "error").length,
    },
    totalPeakWorkingSetBytes,
    totalPeakWorkingSetPerRunBytes:
      batch.tasks.length === 0
        ? 0
        : totalPeakWorkingSetBytes / batch.tasks.length,
    variants: [...new Set(batch.tasks.map((task) => task.variant))],
  };
}

function isProviderErrorResult(result) {
  return (
    result.status === "error" &&
    typeof result.errorClass === "string" &&
    result.errorClass.startsWith("provider_")
  );
}

async function runVariantWithProviderRunRetries({
  fixture,
  options,
  run,
  runId,
  sessionId,
  traceController,
  variant,
}) {
  const providerRunRetryErrors = [];
  for (let attempt = 0; ; attempt++) {
    const result = await runVariant({
      fixture,
      options,
      run,
      runId,
      sessionId,
      traceController,
      variant,
    });
    if (
      !isProviderErrorResult(result) ||
      attempt >= options.providerRunRetries
    ) {
      result.providerRunRetryAttempts = attempt;
      if (providerRunRetryErrors.length > 0) {
        result.providerRunRetryErrors = providerRunRetryErrors;
      }
      return result;
    }

    const delayMs =
      PROVIDER_RUN_RETRY_DELAYS_MS[
        Math.min(attempt, PROVIDER_RUN_RETRY_DELAYS_MS.length - 1)
      ];
    providerRunRetryErrors.push({
      attempt: attempt + 1,
      delayMs,
      error: summarizeError(result.error),
      errorClass: result.errorClass,
    });
    console.error(
      `Retrying ${variant}#${run} after provider error ${result.errorClass}; attempt ${attempt + 1}/${options.providerRunRetries}, delay=${delayMs}ms`,
    );
    await sleep(delayMs);
  }
}

function printTraceRefs(traceRefs) {
  if (traceRefs.length === 0) {
    return;
  }
  console.log("Traces:");
  for (const traceRef of traceRefs) {
    console.log(
      `- run ${traceRef.run} ${traceRef.variant}: ${traceRef.traceId}`,
    );
  }
}

function buildScheduledTasks(options) {
  const tasks = [];
  const runIndexes =
    options.onlyRuns ?? Array.from({ length: options.runs }, (_, run) => run);
  if (options.schedule === "round-robin") {
    for (const run of runIndexes) {
      for (const variant of options.variants) {
        tasks.push({ run, variant });
      }
    }
    return tasks;
  }
  for (const variant of options.variants) {
    for (const run of runIndexes) {
      tasks.push({ run, variant });
    }
  }
  return tasks;
}

function compactExpenseForJudge(expense) {
  return {
    amountUsd: expense.amountUsd,
    category: expense.category,
    cityCode: expense.cityCode,
    expenseId: expense.expenseId,
    expenseType: expense.expenseType,
    memo: expense.memo,
    merchant: expense.merchant,
    merchantType: expense.merchantType,
    paymentChannel: expense.paymentChannel,
    purchasedAt: expense.purchasedAt,
    receiptFingerprint: expense.receiptFingerprint,
    receiptStatus: expense.receiptStatus,
    userId: expense.userId,
  };
}

function compactTraceSummary(result) {
  return {
    counters: result.counters,
    durationMs: {
      coldStartMs: result.coldStartMs,
      llmMs: result.llmMs,
      prepMs: result.prepMs,
      totalMs: result.totalMs,
      warmStartMs: result.warmStartMs,
      webSearchMs: result.webSearchMs,
    },
    spanCount: result.spanCount,
    spans: (result.spans ?? []).map((span) => ({
      durationMs: span.durationMs ?? 0,
      inputPreview: span.inputPreview,
      name: span.name,
      outputPreview: span.outputPreview,
      status: span.status,
    })),
    traceId: result.traceId ?? null,
    usage: result.usage,
  };
}

function buildJudgePacket({ fixture, options, result, runId }) {
  const submittedExpenseIds = new Set(
    collectCanonicalDecisionExpenseIds(result.output),
  );
  const caseExpenseIds = new Set(
    Array.isArray(result.output?.decisions)
      ? result.output.decisions
          .filter((decision) => decision.outcome === "case")
          .flatMap((decision) => decision.expenseIds ?? [])
      : [],
  );
  const receiptExpenseIds = [
    ...new Set([
      ...caseExpenseIds,
      ...[...submittedExpenseIds].slice(
        0,
        DEFAULT_RECEIPT_ANALYSIS_SAMPLE_SIZE,
      ),
    ]),
  ].slice(0, 80);
  const relevantUserIds = [
    ...new Set(
      fixture.expenses
        .filter((expense) => submittedExpenseIds.has(expense.expenseId))
        .map((expense) => expense.userId),
    ),
  ].slice(0, 40);
  const packet = {
    datasetManifest: {
      amountReviewedUsd: Number(
        fixture.expenses
          .reduce((sum, expense) => sum + expense.amountUsd, 0)
          .toFixed(2),
      ),
      categoryCount: new Set(
        fixture.expenses.map((expense) => expense.category),
      ).size,
      companyPaidCount: fixture.expenses.filter(
        (expense) => expense.expenseType === "expense",
      ).length,
      expenseCount: fixture.expenses.length,
      merchantCount: new Set(
        fixture.expenses.map((expense) => expense.merchant),
      ).size,
      policyWordCount: fixture.policy.split(/\s+/).filter(Boolean).length,
      reimbursementCount: fixture.expenses.filter(
        (expense) => expense.expenseType === "reimbursement",
      ).length,
      source: fixture.source,
      weekStart: fixture.source.weekStart,
    },
    evidence: {
      calendarEvents: Object.fromEntries(
        relevantUserIds.map((userId) => [
          userId,
          fixture.calendarEventsByUserId[userId] ?? [],
        ]),
      ),
      expenseFile: {
        description:
          "Compact anonymized weekly expense and reimbursement records embedded in this packet.",
        items: fixture.expenses.map(compactExpenseForJudge),
      },
      policy: fixture.policy,
      priorCases: fixture.priorCases.filter((priorCase) =>
        relevantUserIds.includes(priorCase.userId),
      ),
      receipts: Object.fromEntries(
        receiptExpenseIds.map((expenseId) => [
          expenseId,
          fixture.receiptsByExpenseId[expenseId] ?? "",
        ]),
      ),
      users: Object.fromEntries(
        relevantUserIds.map((userId) => [userId, fixture.users[userId]]),
      ),
    },
    harnessHealth: {
      expenseFetchCoverage: result.expenseFetchCoverage,
      runtimeStatus: result.status,
      submitted: result.submitted,
      triageCoverage: result.triageCoverage,
      validation: result.outputValidation,
    },
    judgeProvider: options.judgeProvider,
    qualityPassThreshold: options.qualityPassThreshold,
    rubric: JUDGE_RUBRIC,
    run: result.run,
    runId,
    schemaVersion: 1,
    submittedOutput: result.output,
    taskId: TASK_ID,
    traceSummary: compactTraceSummary(result),
    variant: result.variant,
  };
  assertNoHiddenLabels(packet);
  return packet;
}

function buildJudgePackets({ fixture, options, results, runId }) {
  return results
    .filter((result) => result.status !== "error")
    .map((result) => buildJudgePacket({ fixture, options, result, runId }));
}

async function writeJudgePackets({
  fixture,
  options,
  outputPath,
  results,
  runId,
}) {
  if (!options.exportJudgePackets) {
    return null;
  }
  const packets = buildJudgePackets({ fixture, options, results, runId });
  const judgePacketPath = outputPath.replace(/\.json$/, ".judge-packets.jsonl");
  await writeFile(
    judgePacketPath,
    packets.map((packet) => JSON.stringify(packet)).join("\n") + "\n",
  );
  return {
    packetCount: packets.length,
    path: judgePacketPath,
  };
}

function buildReport({
  batchMetrics = [],
  fixture,
  options,
  results,
  runId,
  sessionId,
  traceController,
}) {
  const summary = summarize(results);
  const traceSamples = buildTraceSamples(results);
  const traceRefs = buildTraceRefs(results);
  return {
    config: {
      batchSize: options.batchSize,
      measurementNotes: [
        "totalMs is task wall time excluding the synthetic warm-start probe.",
        "wallMs is full run wall time including the synthetic warm-start probe.",
        "peakDelta and retainedDelta are process RSS deltas and are not isolated per session when batchSize > 1.",
        "batchMetrics records host-process RSS plus Docker cgroup memory for each concurrent batch and should be used for active-session memory claims.",
        "totalPeakWorkingSetPerRunBytes is the primary batch-level memory metric for homogeneous batches.",
      ],
      llmMode: options.mockLlm ? "mock" : "live",
      judgeProvider: options.judgeProvider,
      judgeResultsPath: options.judgeResultsPath,
      qualityPassThreshold: options.qualityPassThreshold,
      maxExpenses: options.maxExpenses,
      model: options.model,
      modelAlias: options.modelAlias,
      modelInput: options.modelInput,
      preflight: options.mockLlm
        ? "skipped_mock"
        : options.skipPreflight
          ? "skipped_by_flag"
          : "enabled",
      providerErrorPolicy: options.allowProviderErrors
        ? "record"
        : "abort_after_checkpoint",
      providerRunRetries: options.providerRunRetries,
      runs: options.runs,
      onlyRuns: options.onlyRuns ?? [],
      schedule: options.schedule,
      variants: options.variants,
      weekStart: options.weekStart,
    },
    batchMetrics,
    fixture: {
      expectedSpendSignals: fixture.expectedSpendSignals,
      expectedReview: fixture.expectedReview,
      expenseCount: fixture.expenses.length,
      source: fixture.source,
    },
    judge: {
      passThreshold: options.qualityPassThreshold,
      provider: options.judgeProvider,
      resultsPath: options.judgeResultsPath || null,
      rubric: JUDGE_RUBRIC,
    },
    traces: {
      groupingSessionId: sessionId,
      mode: traceController.reason,
      traceRefs,
    },
    results,
    runId,
    summary,
    task: {
      id: TASK_ID,
    },
    traceSamples,
  };
}

function buildMarkdownReport(report) {
  const summaryRows = report.summary
    .map(
      (row) =>
        `| ${row.variant} | ${row.successCount}/${row.runCount} | ${row.qualityPassCount}/${row.successCount} | ${row.judgedCount}/${row.successCount} | ${row.judgePassCount}/${row.judgedCount} | ${row.submittedCount}/${row.successCount} | ${row.judge.score.p70.toFixed(1)} | ${row.judge.score.p90.toFixed(1)} | ${row.judge.score.p95.toFixed(1)} | ${row.judge.score.p99.toFixed(1)} | ${row.tokens.total.p70.toFixed(0)} | ${row.tokens.total.p90.toFixed(0)} | ${row.tokens.total.p95.toFixed(0)} | ${row.tokens.total.p99.toFixed(0)} | ${row.time.totalMs.p70.toFixed(0)} | ${row.time.totalMs.p90.toFixed(0)} | ${row.time.totalMs.p95.toFixed(0)} | ${row.time.totalMs.p99.toFixed(0)} | ${formatMiB(row.memory.runtimeWorkingSetBytes.p70)} | ${formatMiB(row.memory.runtimeWorkingSetBytes.p90)} | ${formatMiB(row.memory.runtimeWorkingSetBytes.p95)} | ${formatMiB(row.memory.runtimeWorkingSetBytes.p99)} | ${formatMiB(row.memory.peakRssBytes.p95)} | ${row.memory.containerPeakBytes.p95 > 0 ? formatMiB(row.memory.containerPeakBytes.p95) : "-"} |`,
    )
    .join("\n");

  return [
    `# Company Spend Audit Benchmark Readout`,
    "",
    ...buildReadout(report).map((line) => `- ${line}`),
    "",
    `## Runtime Summary`,
    "",
    `| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
    summaryRows,
    "",
    `## Notes`,
    "",
    ...(report.config.providerRunRetries > 0
      ? [
          `- Provider-connectivity failures are retried at the full-run level up to ${report.config.providerRunRetries} time${report.config.providerRunRetries === 1 ? "" : "s"} before counting as benchmark failures.`,
        ]
      : []),
    `- \`tool\` and \`tool-compaction\` include simplified \`analyze_receipt\`, \`get_users\`, \`get_cases\`, and calendar context tools for company-spend review.`,
    `- \`tool-compaction\` uses the same native tools as \`tool\`, plus AI SDK \`prepareStep\` message pruning with a deterministic evidence checkpoint when the conversation grows large.`,
    `- Native tool variants remove the agent-level ${Math.round(LLM_TIMEOUT_MS / 60000)} minute abort while keeping the same model step cap and provider/web-search behavior.`,
    `- Native tool variants use the same harness shape as the Brex audit agents, including a batched \`web_search\` tool that calls Gemini web tools through Vertex via the LLM gateway.`,
    `- \`just-bash\` and \`sandbox\` expose the same web-search backend as a \`web_search\` CLI and the same submission validator as a \`submit_review\` CLI behind the single bash tool.`,
    `- \`just-bash\` remains pure in-memory \`Bash + InMemoryFs\`; /tmp is an in-memory path and does not touch the host filesystem.`,
    `- \`sandbox\` remains the Docker/Moby comparator.`,
    `- Primary memory claims should use homogeneous-batch \`totalPeakWorkingSetPerRunBytes\`: host-process peak RSS delta plus Docker cgroup peak memory, divided by active sessions. Per-run RSS remains a diagnostic.`,
    `- \`totalMs\` excludes the synthetic warm-start probe. Raw rows also include \`wallMs\`, \`coldStartMs\`, and \`warmStartMs\`.`,
    `- \`Runtime OK\` means the provider and runtime completed. \`Quality Pass\` is judge-based when judge results are attached; otherwise it is only a harness-health signal for submitted output, full-batch expense fetch/read coverage, evidence work, schema validity, and valid expense ids.`,
    `- Exact F1 is retained only as a diagnostic against generated hidden cases. It is not the headline quality metric.`,
    "",
    buildTraceSampleMarkdown(report.traceSamples),
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  await loadEnvFile(options.envFile);
  const preflight = await runProviderPreflight(options);
  if (preflight.skipped) {
    console.error(`Provider preflight skipped: ${preflight.reason}`);
  } else {
    console.error(
      `Provider preflight passed in ${preflight.durationMs.toFixed(0)}ms`,
    );
  }
  const traceController = createTraceController();
  const fixture = await buildAnonymizedFixture(options);
  const runId = `${new Date()
    .toISOString()
    .replaceAll(/[:.]/g, "-")}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const sessionId = `company-spend-audit-benchmark-${runId}`;
  await mkdir(options.outputDir, { recursive: true });
  const outputPath = path.resolve(
    options.outputDir,
    `company-spend-audit-benchmark-${runId}.json`,
  );
  const checkpointPath = outputPath.replace(/\.json$/, ".partial.json");

  if (options.variants.includes("sandbox")) {
    await buildDockerImage();
  }

  const results = [];
  const batchMetrics = [];
  const tasks = buildScheduledTasks(options);

  for (let offset = 0; offset < tasks.length; offset += options.batchSize) {
    const batchIndex = Math.floor(offset / options.batchSize);
    const batch = tasks.slice(offset, offset + options.batchSize);
    console.error(
      `Running batch ${batchIndex + 1}/${Math.ceil(tasks.length / options.batchSize)}: ${batch.map((task) => `${task.variant}#${task.run}`).join(", ")}`,
    );
    await forceGc();
    const batchBaselineMemory = memorySnapshot();
    const batchPeakTracker = createPeakTracker();
    const batchStarted = performance.now();
    batchPeakTracker.start();
    const batchResults = await Promise.all(
      batch.map((task) =>
        runVariantWithProviderRunRetries({
          fixture,
          options,
          run: task.run,
          runId,
          sessionId,
          traceController,
          variant: task.variant,
        }),
      ),
    );
    const batchElapsedMs = performance.now() - batchStarted;
    const batchPeakMemory = batchPeakTracker.stop();
    await forceGc();
    const batchRetainedMemory = memorySnapshot();
    for (const result of batchResults) {
      result.batchIndex = batchIndex;
      result.batchSize = batch.length;
    }
    batchMetrics.push(
      summarizeBatchMetric({
        batch: { index: batchIndex, tasks: batch },
        batchResults,
        baselineMemory: batchBaselineMemory,
        elapsedMs: batchElapsedMs,
        peakMemory: batchPeakMemory,
        retainedMemory: batchRetainedMemory,
      }),
    );
    results.push(...batchResults);
    const checkpointReport = buildReport({
      batchMetrics,
      fixture,
      options,
      results,
      runId,
      sessionId,
      traceController,
    });
    await writeFile(checkpointPath, JSON.stringify(checkpointReport, null, 2));
    const providerErrors = batchResults.filter(isProviderErrorResult);
    if (providerErrors.length > 0 && !options.allowProviderErrors) {
      throw new Error(
        `Aborting benchmark after provider errors in batch ${batchIndex + 1}; partial checkpoint written to ${checkpointPath}. Errors: ${providerErrors
          .map(
            (result) =>
              `${result.variant}#${result.run} ${result.errorClass}: ${summarizeError(result.error)}`,
          )
          .join(" | ")}`,
      );
    }
  }

  let finalResults = results;
  if (options.judgeResultsPath) {
    const judgeResults = await readJudgeResultsJsonl(
      options.judgeResultsPath,
      options.qualityPassThreshold,
    );
    finalResults = mergeJudgeResultsIntoRuns({
      judgeResults,
      passThreshold: options.qualityPassThreshold,
      results,
      runId,
    });
  }

  const report = buildReport({
    batchMetrics,
    fixture,
    options,
    results: finalResults,
    runId,
    sessionId,
    traceController,
  });
  const judgePacketExport = await writeJudgePackets({
    fixture,
    options,
    outputPath,
    results: finalResults,
    runId,
  });
  if (judgePacketExport) {
    report.judge.packetsPath = judgePacketExport.path;
    report.judge.packetCount = judgePacketExport.packetCount;
  }
  const { summary } = report;
  const traceRefs = report.traces.traceRefs;

  await writeFile(outputPath, JSON.stringify(report, null, 2));
  const markdownPath = outputPath.replace(/\.json$/, ".md");
  await writeFile(markdownPath, buildMarkdownReport(report));

  if (options.json) {
    console.log(
      JSON.stringify({ markdownPath, outputPath, summary, traceRefs }, null, 2),
    );
    return;
  }

  console.log(buildReadout(report).join("\n"));
  console.log("");
  printSummary(summary);
  console.log(`\nLLM mode: ${report.config.llmMode}`);
  console.log(`Traces: ${traceController.reason}`);
  printTraceRefs(traceRefs);
  console.log(`Report: ${outputPath}`);
  console.log(`Readout: ${markdownPath}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(formatError(error));
    process.exit(1);
  });
