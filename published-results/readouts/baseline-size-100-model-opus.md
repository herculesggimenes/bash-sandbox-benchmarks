# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 100 anonymized company-paid expenses and reimbursements, 7 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 181ms P95 and warm-start is 54ms P95, versus 1ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 59727 | 76901 | 84553 | 140372 | 132133 | 159050 | 179142 | 210668 | 138.58 | 203.28 | 220.97 | 226.06 | 220.97 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 393416 | 521773 | 563856 | 589255 | 182649 | 218208 | 236795 | 280125 | 146.94 | 203.28 | 220.92 | 226.06 | 220.92 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 457212 | 597270 | 743465 | 814979 | 193432 | 237879 | 260830 | 316921 | 5.74 | 5.78 | 5.80 | 5.88 | 220.14 | 5.80 |

## Notes

- `tool` includes simplified `analyze_receipt`, `get_users`, `get_cases`, and calendar context tools for company-spend review.
- `tool` uses the same harness shape as the Brex audit agents, including a batched `web_search` tool that calls Gemini web tools through Vertex via the LLM gateway.
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

### `tool`

- `llm.review_spend_decisions` (125455ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 100, "variant": "tool" }
  - output: { "caseDecisionCount": 11, "decisionCount": 34, "decisions": [ { "evidence": [ { "reference": "exp_0024", "summary": "Company-paid expense $486.72, United Airlines, corporate card, receipt_4b4d6e7e3b", "type": "expense" }, { "reference": "exp_0025", "summary": "Reimbursement request $481.85, same user, same receipt fi...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0063", "exp_0070", "exp_0077", "exp_0084", "exp_0007", "exp_0014", "exp_0091", "exp_0021", "exp_0098", "exp_0028", "exp_0035", "exp_0049", "exp_0056", "exp_0048", "exp_0055", "exp_0062", "exp_0069", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0006"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 50 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0025", "exp_0032", "exp_0039", "exp_0046", "exp_0053", "exp_0060", "exp_0067", "exp_0073", "exp_0052", "exp_0059", "exp_0066", "exp_0003", "exp_0080", "exp_0010", "exp_0087", "exp_0017", "exp_0094", "exp_0024", "exp_0031", "exp_0038", "exp_0045", "exp_0072", "exp_0030"...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0024", "exp_0025", "exp_0081", "exp_0082", "exp_0097", "exp_0088", "exp_0059", "exp_0087", "exp_0076", "exp_0075", "exp_0056", "exp_0043", "exp_0042", "exp_0041", "exp_0083", "exp_0001" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0056", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0097", "exp_0075", "exp_0082", "exp_0081", "exp_0088", "exp_0025", "exp_0059", "exp_0087", "exp_0024", "exp_0001" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "me...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 10 }
  - input: { "expenseIds": [ "exp_0024", "exp_0025", "exp_0081", "exp_0082", "exp_0097", "exp_0088", "exp_0059", "exp_0087", "exp_0076", "exp_0075" ] }
  - output: [ { "expenseId": "exp_0024", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-98337A | Date: 2026-04-12 11:59" }, { "expenseId": "exp_0025", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-98337A | Date: 2026-04-12 11:59" }, { "expenseId": "exp_0081"...
- `tool.analyze_receipt` (1ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 5 }
  - input: { "expenseIds": [ "exp_0043", "exp_0042", "exp_0041", "exp_0083", "exp_0001" ] }
  - output: [ { "expenseId": "exp_0043", "receiptPreview": "The Smith | Location: New York, NY | Receipt #: RCPT-45DC63 | Date: 2026-04-15 14:32" }, { "expenseId": "exp_0042", "receiptPreview": "The Smith | Location: New York, NY | Receipt #: RCPT-EC1C1E | Date: 2026-04-15 13:21" }, { "expenseId": "exp_0041", "receiptPreview": "T...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 34, "decisions": [ { "evidence": [ { "reference": "exp_0024", "summary": "Company-paid expense $486.72, United Airlines, corporate card, receipt_4b4d6e7e3b", "type": "expense" }, { "reference": "exp_0025", "summary": "Reimbursement request $481.85, same user, same receipt fi...
  - output: { "accepted": true, "caseDecisionCount": 11, "decisionCount": 34, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 11, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpe...

### `just-bash`

- `llm.review_spend_decisions` (168269ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 100, "variant": "just-bash" }
  - output: { "caseDecisionCount": 7, "decisionCount": 14, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0024", "exp_0025" ], "title": "Duplicate Receipt: Same Flight Claimed as Both Company-Paid and Reimbursement", "priority": "critical", "tags": [ "DUPLICATE_RECEIPT", "REIMBURSEMENT_OVERLAP" ], "reasoning": "Expenses...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 7, "decisionCount": 14, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0024", "exp_0025" ], "title": "Duplicate Receipt: Same Flight Claimed as Both Company-Paid and Reimbursement", "priority": "critical", "tags": [ "DUPLICATE_RECEIPT", "REIMBURSEMENT_OVERLAP" ], "reasoning": "Expenses...
  - output: { "accepted": true, "caseDecisionCount": 7, "decisionCount": 14, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 7, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": ...

### `sandbox`

- `llm.review_spend_decisions` (177015ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 100, "variant": "sandbox" }
  - output: { "caseDecisionCount": 7, "decisionCount": 15, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0088", "exp_0097" ], "title": "Apple Cash Stored-Value Card Loads", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Two Apple Cash expenses show stored-value/cash-equivalent ...
- `sandbox.exec submit_review` (51ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 7, \"decisionCount\": 15, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 7, \"coveredExpenseCount\": 100, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, \...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 7, "decisionCount": 15, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0088", "exp_0097" ], "title": "Apple Cash Stored-Value Card Loads", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Two Apple Cash expenses show stored-value/cash-equivalent ...
  - output: { "accepted": true, "caseDecisionCount": 7, "decisionCount": 15, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 7, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": ...

