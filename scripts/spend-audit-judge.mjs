import { readFile } from "node:fs/promises";

export const JUDGE_DIMENSIONS = [
  "coverage",
  "caseWorthiness",
  "evidenceGrounding",
  "policyApplication",
  "groupingSpendReasoning",
  "actionability",
  "conciseness",
];

export const JUDGE_RUBRIC = {
  criticalFailures: [
    "Fabricated expense, receipt, policy, prior-case, web, or calendar evidence.",
    "Fails to audit the full company spend batch.",
    "Creates cases from vague suspicion without policy-grounded evidence.",
    "Clears direct policy breaches with unsupported assumptions.",
    "Produces unusable output or omits terminal decisions for material in-scope spend.",
  ],
  dimensions: {
    actionability: {
      description:
        "Reviewer-ready titles, priorities, recommended actions, and next evidence steps.",
      maxScore: 10,
    },
    caseWorthiness: {
      description:
        "Escalates material policy issues while avoiding speculative or low-value cases.",
      maxScore: 20,
    },
    conciseness: {
      description:
        "Clear, compact output that can be skimmed without losing important evidence.",
      maxScore: 5,
    },
    coverage: {
      description:
        "Audits the whole company spend batch and triages company-paid expenses plus reimbursements.",
      maxScore: 20,
    },
    evidenceGrounding: {
      description:
        "Cites concrete expense, receipt, policy, prior-case, user, web, or calendar evidence without fabrication.",
      maxScore: 20,
    },
    groupingSpendReasoning: {
      description:
        "Groups related spend correctly and explains company-spend patterns instead of isolated line items only.",
      maxScore: 10,
    },
    policyApplication: {
      description:
        "Applies the policy to the facts, including exceptions and no-case discipline.",
      maxScore: 15,
    },
  },
  passThreshold: 80,
  version: 1,
};

export function emptyJudgeBreakdown() {
  return Object.fromEntries(JUDGE_DIMENSIONS.map((key) => [key, 0]));
}

export function normalizeJudgeResult(raw, defaultThreshold = 80) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Judge result must be a JSON object");
  }
  const dimensions = {
    ...emptyJudgeBreakdown(),
    ...(raw.dimensions ?? {}),
  };
  for (const key of JUDGE_DIMENSIONS) {
    const maxScore = JUDGE_RUBRIC.dimensions[key].maxScore;
    const value = Number(dimensions[key]);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      throw new Error(
        `Judge dimension ${key} must be a number between 0 and ${maxScore}`,
      );
    }
    dimensions[key] = value;
  }

  const computedTotal = JUDGE_DIMENSIONS.reduce(
    (sum, key) => sum + dimensions[key],
    0,
  );
  const totalScore =
    raw.totalScore === undefined ? computedTotal : Number(raw.totalScore);
  if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > 100) {
    throw new Error("Judge totalScore must be a number between 0 and 100");
  }
  if (Math.abs(totalScore - computedTotal) > 0.01) {
    throw new Error(
      `Judge totalScore ${totalScore} does not match dimension sum ${computedTotal}`,
    );
  }

  const criticalFailures = Array.isArray(raw.criticalFailures)
    ? raw.criticalFailures.map(String).filter(Boolean)
    : [];
  const pass =
    raw.pass === undefined
      ? totalScore >= defaultThreshold && criticalFailures.length === 0
      : Boolean(raw.pass) &&
        totalScore >= defaultThreshold &&
        criticalFailures.length === 0;

  return {
    criticalFailures,
    dimensions,
    missedOpportunities: Array.isArray(raw.missedOpportunities)
      ? raw.missedOpportunities.map(String)
      : [],
    pass,
    run: raw.run,
    runId: raw.runId,
    strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
    totalScore,
    variant: raw.variant,
    weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses.map(String) : [],
  };
}

export function parseJudgeResultsJsonl(text, defaultThreshold = 80) {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return normalizeJudgeResult(JSON.parse(line), defaultThreshold);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Invalid judge result on line ${index + 1}: ${message}`,
        );
      }
    });
}

export async function readJudgeResultsJsonl(filePath, defaultThreshold = 80) {
  return parseJudgeResultsJsonl(
    await readFile(filePath, "utf8"),
    defaultThreshold,
  );
}

export function judgeResultKey(result) {
  return `${result.runId ?? ""}|${result.variant ?? ""}|${result.run ?? ""}`;
}

export function mergeJudgeResultsIntoRuns({
  passThreshold = 80,
  results,
  runId,
  judgeResults,
}) {
  const byKey = new Map();
  for (const judgeResult of judgeResults) {
    byKey.set(judgeResultKey(judgeResult), judgeResult);
  }

  return results.map((result) => {
    const judge =
      byKey.get(
        judgeResultKey({ run: result.run, runId, variant: result.variant }),
      ) ??
      byKey.get(
        judgeResultKey({
          run: result.run,
          runId: undefined,
          variant: result.variant,
        }),
      ) ??
      null;
    if (!judge) {
      return result;
    }
    const failureReasons = new Set(result.quality?.failureReasons ?? []);
    if (!judge.pass) {
      failureReasons.add(
        judge.criticalFailures.length > 0
          ? "judge_critical_failure"
          : "judge_score_below_threshold",
      );
    }
    return {
      ...result,
      judge,
      quality: {
        ...(result.quality ?? {}),
        failureReasons: [...failureReasons],
        judgePass: judge.pass,
        judgeScore: judge.totalScore,
        mode: "judge",
        pass:
          Boolean(result.quality?.harnessPass ?? result.quality?.pass) &&
          judge.pass &&
          judge.totalScore >= passThreshold,
      },
    };
  });
}

export function assertNoHiddenLabels(value, path = "packet") {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(expected.*|.*Expected.*|hidden.*|.*Hidden.*|labels|labelSet|fraudSignals|spendSignals|scenario.*)$/i.test(
        key,
      )
    ) {
      throw new Error(`Hidden label-like key leaked into ${path}.${key}`);
    }
    assertNoHiddenLabels(child, `${path}.${key}`);
  }
}
