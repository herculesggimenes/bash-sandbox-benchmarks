# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 100 anonymized company-paid expenses and reimbursements, 7 diagnostic spend-pattern signals, 1,529 policy words.
- All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool-compaction | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 59687 | 82358 | 83087 | 103281 | 135441 | 212655 | 214645 | 241565 | 4.34 | 8.25 | 8.58 | 9.44 | 8.58 | - |

## Notes

- `tool` and `tool-compaction` include simplified `analyze_receipt`, `get_users`, `get_cases`, and calendar context tools for company-spend review.
- `tool-compaction` uses the same native tools as `tool`, plus AI SDK `prepareStep` message pruning with a deterministic evidence checkpoint when the conversation grows large.
- Native tool variants use the same harness shape as the Brex audit agents, including a batched `web_search` tool that calls Gemini web tools through Vertex via the LLM gateway.
- `just-bash` and `sandbox` expose the same web-search backend as a `web_search` CLI and the same submission validator as a `submit_review` CLI behind the single bash tool.
- `just-bash` remains pure in-memory `Bash + InMemoryFs`; /tmp is an in-memory path and does not touch the host filesystem.
- `sandbox` remains the Docker/Moby comparator.
- Primary memory claims should use homogeneous-batch `totalPeakWorkingSetPerRunBytes`: host-process peak RSS delta plus Docker cgroup peak memory, divided by active sessions. Per-run RSS remains a diagnostic.
- `totalMs` excludes the synthetic warm-start probe. Raw rows also include `wallMs`, `coldStartMs`, and `warmStartMs`.
- `Runtime OK` means the provider and runtime completed. `Quality Pass` is judge-based when judge results are attached; otherwise it is only a harness-health signal for submitted output, full-batch expense fetch/read coverage, evidence work, schema validity, and valid expense ids.
- Exact F1 is retained only as a diagnostic against generated hidden cases. It is not the headline quality metric.

## Sample Trace Slices

These are real spans from one benchmark run. Each variant below is one trace. I am only showing the spans that make the runtime shape obvious.
The local report includes benchmark span slices for the runtime-shape comparison.

### `tool-compaction`

- `llm.review_spend_decisions` (135438ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "compactContext": true, "expenseCount": 100, "variant": "tool-compaction" }
  - output: { "caseDecisionCount": 11, "decisionCount": 25, "decisions": [ { "evidence": [ { "reference": "exp_0024", "summary": "Company-paid expense $486.72, United Airlines, receipt_4b4d6e7e3b, corporate card", "type": "expense" }, { "reference": "exp_0025", "summary": "Reimbursement request $481.85, same receipt fingerprint, ...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0063", "exp_0070", "exp_0077", "exp_0084", "exp_0007", "exp_0014", "exp_0091", "exp_0021", "exp_0098", "exp_0028", "exp_0035", "exp_0049", "exp_0056", "exp_0048", "exp_0055", "exp_0062", "exp_0069", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0006"...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 50 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0025", "exp_0032", "exp_0039", "exp_0046", "exp_0053", "exp_0060", "exp_0067", "exp_0073", "exp_0052", "exp_0059", "exp_0066", "exp_0003", "exp_0080", "exp_0010", "exp_0087", "exp_0017", "exp_0094", "exp_0024", "exp_0031", "exp_0038", "exp_0045", "exp_0072", "exp_0030"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 7 }
  - input: { "expenseIds": [ "exp_0024", "exp_0025", "exp_0081", "exp_0082", "exp_0097", "exp_0088", "exp_0059" ] }
  - output: [ { "expenseId": "exp_0024", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-98337A | Date: 2026-04-12 11:59" }, { "expenseId": "exp_0025", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-98337A | Date: 2026-04-12 11:59" }, { "expenseId": "exp_0081"...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0024", "exp_0025", "exp_0081", "exp_0082", "exp_0097", "exp_0088", "exp_0059", "exp_0056", "exp_0087", "exp_0076", "exp_0075" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0056", "exp_0076", "exp_0097", "exp_0075", "exp_0082", "exp_0081", "exp_0088", "exp_0025", "exp_0059", "exp_0087", "exp_0024" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 9 }
  - input: { "expenseIds": [ "exp_0056", "exp_0087", "exp_0076", "exp_0075", "exp_0041", "exp_0042", "exp_0043", "exp_0083", "exp_0001" ] }
  - output: [ { "expenseId": "exp_0056", "receiptPreview": "Receipt unavailable | Expense id: exp_0056 | Merchant claimed by submitter: Soho House | Amount: $1485.00" }, { "expenseId": "exp_0087", "receiptPreview": "OpenAI | Location: San Francisco, CA | Receipt #: RCPT-FD038C | Date: 2026-04-12 13:38" }, { "expenseId": "exp_0076...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0041", "exp_0042", "exp_0043", "exp_0083", "exp_0001", "exp_0068" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0043", "exp_0042", "exp_0083", "exp_0041", "exp_0068", "exp_0001" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "ha...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 25, "decisions": [ { "evidence": [ { "reference": "exp_0024", "summary": "Company-paid expense $486.72, United Airlines, receipt_4b4d6e7e3b, corporate card", "type": "expense" }, { "reference": "exp_0025", "summary": "Reimbursement request $481.85, same receipt fingerprint, ...
  - output: { "accepted": true, "caseDecisionCount": 11, "decisionCount": 25, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 11, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpe...

