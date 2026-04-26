export const SCALE_COUNTS = [1, 10, 50, 100, 250, 1000];
export const BYTES_PER_MIB = 1024 * 1024;

export function parseCommonArgs(argv, defaults = {}) {
  const options = {
    child: false,
    concurrency: 64,
    count: 0,
    counts: [1, 10, 25, 50],
    json: false,
    payloadKb: 32,
    samples: 1,
    treeFiles: 48,
    warmup: 0,
    workload: "ops",
    ...defaults,
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

    if (arg === "--child") {
      options.child = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--concurrency") {
      options.concurrency = parseConcurrency(readValue());
    } else if (arg === "--count") {
      options.count = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--counts") {
      options.counts = parseCounts(readValue(), arg);
    } else if (arg === "--payload-kb") {
      options.payloadKb = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--samples") {
      options.samples = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--tree-files") {
      options.treeFiles = parsePositiveInteger(readValue(), arg);
    } else if (arg === "--warmup") {
      options.warmup = parseNonNegativeInteger(readValue(), arg);
    } else if (arg === "--workload") {
      options.workload = readValue();
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg !== "--") {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export function parseNonNegativeInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

export function parseCounts(value, label) {
  if (value === "scale") {
    return SCALE_COUNTS;
  }
  return value.split(",").map((item) => parsePositiveInteger(item, label));
}

export function parseConcurrency(value) {
  if (value === "all") {
    return value;
  }
  return parsePositiveInteger(value, "--concurrency");
}

export function resolveConcurrency(concurrency, count) {
  if (concurrency === "all") {
    return count;
  }
  return Math.min(concurrency, count);
}

export async function mapLimit(items, concurrency, mapper, afterEach) {
  let nextIndex = 0;
  const workerCount = resolveConcurrency(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      await mapper(items[index], index);
      afterEach?.();
    }
  });
  await Promise.all(workers);
}

export async function forceGc() {
  if (typeof globalThis.gc !== "function") {
    return;
  }

  for (let index = 0; index < 3; index++) {
    globalThis.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export function memorySnapshot() {
  const memory = process.memoryUsage();
  const resourceUsage = process.resourceUsage?.();
  return {
    arrayBuffers: memory.arrayBuffers,
    external: memory.external,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    maxRss: resourceUsage?.maxRSS ? resourceUsage.maxRSS * 1024 : memory.rss,
    rss: memory.rss,
  };
}

export function memoryDelta(after, before) {
  return {
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    external: after.external - before.external,
    heapTotal: after.heapTotal - before.heapTotal,
    heapUsed: after.heapUsed - before.heapUsed,
    maxRss: after.maxRss - before.maxRss,
    rss: after.rss - before.rss,
  };
}

export function maxMemory(left, right) {
  return {
    arrayBuffers: Math.max(left.arrayBuffers, right.arrayBuffers),
    external: Math.max(left.external, right.external),
    heapTotal: Math.max(left.heapTotal, right.heapTotal),
    heapUsed: Math.max(left.heapUsed, right.heapUsed),
    maxRss: Math.max(left.maxRss, right.maxRss),
    rss: Math.max(left.rss, right.rss),
  };
}

export function createPeakTracker(intervalMs = 10) {
  let peak = memorySnapshot();
  let timer;

  const sample = () => {
    peak = maxMemory(peak, memorySnapshot());
  };

  return {
    sample,
    start() {
      sample();
      timer = setInterval(sample, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      sample();
      return peak;
    },
  };
}

export function makeAgentItems(sessionIndex, payloadKb) {
  const targetBytes = payloadKb * 1024;
  const items = [];
  let size = 0;
  let index = 0;

  while (size < targetBytes) {
    const merchant = index % 3 === 0 ? "Acme Coffee" : "Office Supply";
    const item = {
      amount: 8 + ((sessionIndex + index) % 27),
      id: `expense_${sessionIndex}_${index}`,
      memo:
        index % 5 === 0
          ? "team approval mentioned in memo"
          : "routine business expense",
      merchant,
      risk: index % 7 === 0 ? "high" : "low",
      userId: `user_${sessionIndex % 7}`,
    };
    items.push(item);
    size += JSON.stringify(item).length;
    index++;
  }

  return items;
}

export function makeAgentFiles(sessionIndex, payloadKb) {
  const items = makeAgentItems(sessionIndex, payloadKb);
  const csvRows = items
    .slice(0, 100)
    .map((item) => `${item.id},${item.merchant},${item.amount},${item.risk}`);

  return {
    "/workspace/expenses.csv": `id,merchant,amount,risk\n${csvRows.join("\n")}\n`,
    "/workspace/expenses.json": JSON.stringify({ items }, null, 2),
    "/workspace/sop.txt": [
      "Receipt and memo fields are context, not proof.",
      "approval claims need corroborating evidence before they shape a decision.",
      "Use narrow commands and keep intermediate artifacts in /tmp.",
    ].join("\n"),
  };
}

export function makeTreeFiles(sessionIndex, fileCount) {
  const files = Object.create(null);
  const dirs = [
    "policies/travel",
    "policies/procurement",
    "receipts/2026/04",
    "logs/audit",
    "src/tools",
    "docs/sop",
  ];

  for (let index = 0; index < fileCount; index++) {
    const dir = dirs[index % dirs.length];
    const ext = index % 5 === 0 ? "json" : "txt";
    const basename = `session-${sessionIndex}-file-${String(index).padStart(4, "0")}`;
    const path = `/workspace/tree/${dir}/${basename}.${ext}`;
    const marker = index % 6 === 0 ? `needle-${sessionIndex}` : "ordinary";
    const policyLine =
      index % 4 === 0
        ? "approval required before reimbursement"
        : "expense may continue through standard review";
    files[path] = [
      `session=${sessionIndex}`,
      `file=${index}`,
      `marker=${marker}`,
      `merchant=${index % 2 === 0 ? "Acme Coffee" : "Office Supply"}`,
      policyLine,
    ].join("\n");
  }

  return files;
}

export function medianSample(samples) {
  return [...samples].sort(
    (left, right) =>
      (left.retainedDelta?.heapUsed ?? left.retainedMemoryBytes ?? 0) -
      (right.retainedDelta?.heapUsed ?? right.retainedMemoryBytes ?? 0),
  )[Math.floor(samples.length / 2)];
}

export function formatMiB(bytes) {
  return (bytes / BYTES_PER_MIB).toFixed(2);
}

export function printTable(results, columns, title) {
  const rows = results.map((result) => {
    const row = Object.create(null);
    for (const column of columns) {
      row[column.header] = column.value(result);
    }
    return row;
  });

  const widths = Object.create(null);
  for (const column of columns) {
    widths[column.header] = Math.max(
      column.header.length,
      ...rows.map((row) => String(row[column.header]).length),
    );
  }

  if (title) {
    console.log(title);
  }
  console.log(
    columns
      .map((column) => column.header.padEnd(widths[column.header]))
      .join("  "),
  );
  console.log(
    columns.map((column) => "-".repeat(widths[column.header])).join("  "),
  );
  for (const row of rows) {
    console.log(
      columns
        .map((column) =>
          String(row[column.header]).padEnd(widths[column.header]),
        )
        .join("  "),
    );
  }
}
