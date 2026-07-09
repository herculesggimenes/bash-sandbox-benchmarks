const DETAILED_FIELDS = Object.freeze([
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
]);

const OVERVIEW_FIELDS = Object.freeze([
  "id",
  "type",
  "usd",
  "cat",
  "merchant",
  "user",
  "receiptFp",
  "receipt",
]);

function projectExpenseForTool(expense) {
  return Object.fromEntries(
    DETAILED_FIELDS.map((field) => [field, expense[field]]),
  );
}

function projectExpenseOverviewForTool(expense) {
  return [
    expense.expenseId,
    expense.expenseType,
    expense.amountUsd,
    expense.category,
    expense.merchant,
    expense.userId,
    expense.receiptFingerprint,
    expense.receiptStatus,
  ];
}

function countRowsBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort());
}

function amountRowsBy(rows, keyFn) {
  const amounts = new Map();
  for (const row of rows) {
    const key = keyFn(row) ?? "unknown";
    amounts.set(key, (amounts.get(key) ?? 0) + row.amountUsd);
  }
  return Object.fromEntries(
    [...amounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, amount]) => [key, Number(amount.toFixed(2))]),
  );
}

function topRowsByCount(rows, keyFn, limit = 8) {
  const counts = countRowsBy(rows, keyFn);
  return Object.entries(counts)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, limit)
    .map(([key, count]) => ({ count, key }));
}

function buildExpenseQuerySummary(rows, page) {
  const duplicateReceiptFingerprints = Object.entries(
    countRowsBy(rows, (expense) => expense.receiptFingerprint),
  )
    .filter(([, count]) => count > 1)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 12)
    .map(([receiptFingerprint, count]) => ({ count, receiptFingerprint }));

  return {
    amountByCategory: amountRowsBy(rows, (expense) => expense.category),
    amountByExpenseType: amountRowsBy(rows, (expense) => expense.expenseType),
    amountReviewedUsd: Number(
      rows.reduce((sum, expense) => sum + expense.amountUsd, 0).toFixed(2),
    ),
    countsByCategory: countRowsBy(rows, (expense) => expense.category),
    countsByExpenseType: countRowsBy(rows, (expense) => expense.expenseType),
    countsByReceiptStatus: countRowsBy(
      rows,
      (expense) => expense.receiptStatus,
    ),
    duplicateReceiptFingerprints,
    merchantCount: new Set(rows.map((expense) => expense.merchant)).size,
    sampleExpenseIds: page.slice(0, 5).map((expense) => expense.expenseId),
    topMerchants: topRowsByCount(rows, (expense) => expense.merchant),
    topUsers: topRowsByCount(rows, (expense) => expense.userId),
    userCount: new Set(rows.map((expense) => expense.userId)).size,
  };
}

export function queryExpenses(expenses, query = {}) {
  let rows = [...expenses];
  const detailLevel = query.detailLevel ?? "overview";

  if (query.expenseIds?.length) {
    const wanted = new Set(query.expenseIds);
    rows = rows.filter((expense) => wanted.has(expense.expenseId));
  }
  if (query.expenseType) {
    rows = rows.filter((expense) => expense.expenseType === query.expenseType);
  }
  if (query.merchantContains) {
    const pattern = query.merchantContains.toLowerCase();
    rows = rows.filter((expense) =>
      expense.merchant.toLowerCase().includes(pattern),
    );
  }
  if (query.userId) {
    rows = rows.filter((expense) => expense.userId === query.userId);
  }
  if (query.receiptFingerprint) {
    rows = rows.filter(
      (expense) => expense.receiptFingerprint === query.receiptFingerprint,
    );
  }
  if (query.minAmountUsd !== undefined) {
    rows = rows.filter((expense) => expense.amountUsd >= query.minAmountUsd);
  }
  if (query.maxAmountUsd !== undefined) {
    rows = rows.filter((expense) => expense.amountUsd <= query.maxAmountUsd);
  }
  if (query.purchasedAtStart) {
    rows = rows.filter(
      (expense) => expense.purchasedAt >= query.purchasedAtStart,
    );
  }
  if (query.purchasedAtEnd) {
    rows = rows.filter(
      (expense) => expense.purchasedAt <= query.purchasedAtEnd,
    );
  }

  if (query.sortBy === "amount_desc") {
    rows.sort((left, right) => right.amountUsd - left.amountUsd);
  } else {
    rows.sort((left, right) =>
      right.purchasedAt.localeCompare(left.purchasedAt),
    );
  }

  const totalCount = rows.length;
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.max(1, query.limit ?? 25);
  const page = rows.slice(offset, offset + limit);
  const expenseIds = page.map((expense) => expense.expenseId);
  const base = {
    detailLevel,
    hasMore: offset + page.length < totalCount,
    limit,
    matchedCount: totalCount,
    offset,
    returnedCount: page.length,
    summary:
      offset === 0
        ? buildExpenseQuerySummary(rows, page)
        : {
            aggregateSummaryIncludedOnOffset: 0,
            sampleExpenseIds: page
              .slice(0, 5)
              .map((expense) => expense.expenseId),
          },
  };

  if (detailLevel === "detailed") {
    return {
      ...base,
      expenseIds,
      expenses: page.map(projectExpenseForTool),
      fields: DETAILED_FIELDS,
    };
  }

  return {
    ...base,
    overview: {
      fields: OVERVIEW_FIELDS,
      items: page.map(projectExpenseOverviewForTool),
      rowFormat:
        "array values correspond to fields by position to keep model context compact; id values are exact expense ids",
    },
  };
}

export function expenseIdsFromExpenseQueryResult(result) {
  return (
    result.expenseIds ??
    result.expenses?.map((expense) => expense.expenseId) ??
    result.overview?.items?.map((expense) =>
      Array.isArray(expense) ? expense[0] : expense.expenseId,
    ) ??
    []
  );
}

export function summarizeExpenseQueryResult(result) {
  return {
    detailLevel: result.detailLevel,
    expenseIds: expenseIdsFromExpenseQueryResult(result),
    fields:
      result.detailLevel === "detailed"
        ? result.fields
        : result.overview?.fields,
    hasMore: result.hasMore,
    limit: result.limit,
    matchedCount: result.matchedCount,
    offset: result.offset,
    returnedCount: result.returnedCount,
    sample:
      result.detailLevel === "detailed"
        ? result.expenses?.slice(0, 3)
        : result.overview?.items?.slice(0, 5),
    summary: result.summary,
  };
}
