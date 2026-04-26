#!/usr/bin/env node

import assert from "node:assert/strict";
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
