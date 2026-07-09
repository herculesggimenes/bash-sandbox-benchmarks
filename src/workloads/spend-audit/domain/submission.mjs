import { z } from "zod";

export const reviewDecisionSchema = z.object({
  evidence: z
    .array(
      z.object({
        reference: z.string(),
        summary: z.string(),
        type: z.string().min(1),
      }),
    )
    .default([]),
  expenseIds: z.array(z.string()).min(1),
  outcome: z.enum(["case", "no_case"]),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  reasoning: z.string(),
  recommendedAction: z.string().optional(),
  tags: z.array(z.string()).default([]),
  title: z.string().optional(),
});

export const companySpendSummarySchema = z.object({
  amountAtIssueUsd: z.number().nonnegative(),
  amountReviewedUsd: z.number().nonnegative(),
  categoriesReviewed: z.array(z.string()),
  notableSpendClusters: z.array(z.string()),
  totalReviewed: z.number().int().nonnegative(),
  unresolvedLimitations: z.array(z.string()),
});

export const reviewOutputSchema = z.object({
  companySpendSummary: companySpendSummarySchema,
  decisions: z.array(reviewDecisionSchema),
});

export function collectDecisionExpenseIds(output) {
  const ids = Array.isArray(output?.decisions)
    ? output.decisions.flatMap((decision) => decision.expenseIds ?? [])
    : Array.isArray(output?.candidates)
      ? output.candidates.flatMap((candidate) => candidate.expenseIds ?? [])
      : [];
  return [...new Set(ids)].sort();
}

export function collectAllDecisionExpenseIds(output) {
  return Array.isArray(output?.decisions)
    ? output.decisions.flatMap((decision) => decision.expenseIds ?? [])
    : Array.isArray(output?.candidates)
      ? output.candidates.flatMap((candidate) => candidate.expenseIds ?? [])
      : [];
}

export function validateSubmittedOutput({ fixture, output, sampleLimit = 80 }) {
  const schemaResult = reviewOutputSchema.safeParse(output);
  const validExpenseIds = new Set(
    fixture.expenses.map((expense) => expense.expenseId),
  );
  const allSubmittedExpenseIds = collectAllDecisionExpenseIds(output);
  const submittedExpenseIds = collectDecisionExpenseIds(output);
  const seenExpenseIds = new Set();
  const duplicateExpenseIds = [];
  for (const expenseId of allSubmittedExpenseIds) {
    if (seenExpenseIds.has(expenseId)) {
      duplicateExpenseIds.push(expenseId);
    }
    seenExpenseIds.add(expenseId);
  }
  const invalidExpenseIds = submittedExpenseIds.filter(
    (expenseId) => !validExpenseIds.has(expenseId),
  );
  const missingExpenseIds = fixture.expenses
    .map((expense) => expense.expenseId)
    .filter((expenseId) => !submittedExpenseIds.includes(expenseId));
  const coveredExpenseCount = submittedExpenseIds.filter((expenseId) =>
    validExpenseIds.has(expenseId),
  ).length;
  const caseDecisionCount = Array.isArray(output?.decisions)
    ? output.decisions.filter((decision) => decision.outcome === "case").length
    : Array.isArray(output?.candidates)
      ? output.candidates.length
      : 0;
  const exactlyOnceCovered =
    coveredExpenseCount === fixture.expenses.length &&
    allSubmittedExpenseIds.length === fixture.expenses.length &&
    duplicateExpenseIds.length === 0;
  return {
    caseDecisionCount,
    coveredExpenseCount,
    duplicateExpenseIds: [...new Set(duplicateExpenseIds)].slice(0, 20),
    exactlyOnceCovered,
    fullBatchCovered: coveredExpenseCount === fixture.expenses.length,
    invalidExpenseIds: invalidExpenseIds.slice(0, 20),
    missingExpenseIdCount: missingExpenseIds.length,
    missingExpenseIds: missingExpenseIds.slice(0, sampleLimit),
    schemaErrors: schemaResult.success
      ? []
      : schemaResult.error.issues
          .map((issue) => {
            const issuePath =
              issue.path.length > 0 ? issue.path.join(".") : "$";
            return `${issuePath}: ${issue.message}`;
          })
          .slice(0, 12),
    schemaValid: schemaResult.success,
    submittedExpenseIdCount: submittedExpenseIds.length,
    totalExpenseCount: fixture.expenses.length,
    validExpenseIds: invalidExpenseIds.length === 0,
  };
}
