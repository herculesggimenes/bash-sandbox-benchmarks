#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  queryExpenses,
  summarizeExpenseQueryResult,
} from "../src/workloads/spend-audit/domain/expense-query.mjs";
import { validateSubmittedOutput } from "../src/workloads/spend-audit/domain/submission.mjs";
import {
  createSpendAuditWorkspace,
  describeSpendAuditWorkbench,
  SPEND_AUDIT_WORKSPACE_FILES,
  SPEND_AUDIT_WORKBENCH_COMMANDS,
} from "../src/workloads/spend-audit/surface/manifest.mjs";
import {
  JUDGE_DIMENSIONS,
  assertNoHiddenLabels,
  normalizeJudgeResult,
  parseJudgeResultsJsonl,
} from "./spend-audit-judge.mjs";

function fullDimensions(scoreByDimension = {}) {
  const defaults = {
    actionability: 8,
    caseWorthiness: 17,
    conciseness: 5,
    coverage: 18,
    evidenceGrounding: 17,
    groupingSpendReasoning: 8,
    policyApplication: 13,
  };
  return { ...defaults, ...scoreByDimension };
}

function total(dimensions) {
  return JUDGE_DIMENSIONS.reduce((sum, key) => sum + dimensions[key], 0);
}

const contractExpenses = [
  {
    amountUsd: 40,
    category: "meal",
    cityCode: "sfo",
    expenseId: "exp_0001",
    expenseType: "expense",
    memo: "client lunch",
    merchant: "The Smith",
    merchantType: "restaurant",
    paymentChannel: "corporate_card",
    purchasedAt: "2026-04-10T08:00:00.000Z",
    receiptFingerprint: "receipt_a",
    receiptStatus: "attached",
    userId: "user_a",
  },
  {
    amountUsd: 120,
    category: "software",
    cityCode: "nyc",
    expenseId: "exp_0002",
    expenseType: "expense",
    memo: "subscription",
    merchant: "GitHub",
    merchantType: "software",
    paymentChannel: "invoice",
    purchasedAt: "2026-04-11T08:00:00.000Z",
    receiptFingerprint: "receipt_a",
    receiptStatus: "attached",
    userId: "user_b",
  },
];

const contractFixture = {
  calendarEventsByUserId: { user_a: [] },
  expenses: contractExpenses,
  policy: "Use evidence.",
  priorCases: [],
  users: { user_a: { userId: "user_a" } },
};

const validSubmission = {
  companySpendSummary: {
    amountAtIssueUsd: 0,
    amountReviewedUsd: 160,
    categoriesReviewed: ["meal", "software"],
    notableSpendClusters: [],
    totalReviewed: 2,
    unresolvedLimitations: [],
  },
  decisions: contractExpenses.map((expense) => ({
    evidence: [],
    expenseIds: [expense.expenseId],
    outcome: "no_case",
    reasoning: "No policy breach found.",
    tags: [],
  })),
};

{
  const result = queryExpenses(contractExpenses, {
    detailLevel: "overview",
    limit: 1,
  });
  assert.deepEqual(result.overview.fields, [
    "id",
    "type",
    "usd",
    "cat",
    "merchant",
    "user",
    "receiptFp",
    "receipt",
  ]);
  assert.deepEqual(result.overview.items[0], [
    "exp_0002",
    "expense",
    120,
    "software",
    "GitHub",
    "user_b",
    "receipt_a",
    "attached",
  ]);
  assert.equal(result.summary.duplicateReceiptFingerprints[0].count, 2);
  assert.equal(summarizeExpenseQueryResult(result).expenseIds[0], "exp_0002");
}

{
  const result = queryExpenses(contractExpenses, {
    detailLevel: "detailed",
    minAmountUsd: 100,
  });
  assert.deepEqual(result.expenseIds, ["exp_0002"]);
  assert.equal(result.expenses[0].memo, "subscription");
}

{
  const workspace = createSpendAuditWorkspace(contractFixture);
  assert.deepEqual(
    Object.keys(workspace).sort(),
    [...SPEND_AUDIT_WORKSPACE_FILES].sort(),
  );
  assert.deepEqual(
    JSON.parse(workspace["/workspace/expenses.json"]),
    contractExpenses,
  );
  assert.match(describeSpendAuditWorkbench(), /submit_review/);
  assert.deepEqual(
    SPEND_AUDIT_WORKBENCH_COMMANDS.map((command) => command.name),
    [
      "get_expenses",
      "analyze_receipt",
      "get_users",
      "get_cases",
      "analyze_calendar_events",
      "web_search",
      "submit_review",
      "python3",
    ],
  );
}

{
  const validation = validateSubmittedOutput({
    fixture: contractFixture,
    output: validSubmission,
  });
  assert.equal(validation.exactlyOnceCovered, true);
  assert.equal(validation.schemaValid, true);
}

{
  const duplicate = structuredClone(validSubmission);
  duplicate.decisions[1].expenseIds = ["exp_0001"];
  const validation = validateSubmittedOutput({
    fixture: contractFixture,
    output: duplicate,
  });
  assert.equal(validation.exactlyOnceCovered, false);
  assert.deepEqual(validation.duplicateExpenseIds, ["exp_0001"]);
}

{
  const dimensions = fullDimensions();
  const result = normalizeJudgeResult(
    {
      dimensions,
      run: 0,
      variant: "tool",
    },
    80,
  );
  assert.equal(result.totalScore, total(dimensions));
  assert.equal(result.pass, true);
}

{
  const dimensions = fullDimensions({ evidenceGrounding: 8 });
  const result = normalizeJudgeResult(
    {
      dimensions,
      run: 0,
      variant: "sandbox",
    },
    80,
  );
  assert.equal(result.totalScore, total(dimensions));
  assert.equal(result.pass, false);
}

{
  const dimensions = fullDimensions();
  const result = normalizeJudgeResult(
    {
      criticalFailures: ["Fabricated receipt evidence"],
      dimensions,
      pass: true,
      run: 0,
      variant: "just-bash",
    },
    80,
  );
  assert.equal(result.totalScore, total(dimensions));
  assert.equal(result.pass, false);
}

{
  const dimensions = fullDimensions();
  const parsed = parseJudgeResultsJsonl(
    `${JSON.stringify({ dimensions, run: 0, variant: "tool" })}\n`,
    80,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pass, true);
}

{
  assert.throws(
    () =>
      parseJudgeResultsJsonl(
        JSON.stringify({
          dimensions: fullDimensions({ coverage: 99 }),
          run: 0,
          variant: "tool",
        }),
      ),
    /Invalid judge result/,
  );
}

{
  assert.doesNotThrow(() =>
    assertNoHiddenLabels({
      datasetManifest: { expenseCount: 1000 },
      evidence: { expenseFile: { items: [] } },
      submittedOutput: { decisions: [] },
    }),
  );
  assert.throws(
    () =>
      assertNoHiddenLabels({
        expectedReview: { cases: [] },
      }),
    /Hidden label-like key/,
  );
}

console.log("spend audit benchmark tests passed");
