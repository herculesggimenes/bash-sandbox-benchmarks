# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 10 anonymized company-paid expenses and reimbursements, 0 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 120ms P95 and warm-start is 48ms P95, versus 1ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 40536 | 47321 | 49061 | 67982 | 60811 | 65590 | 74189 | 82798 | 40.91 | 70.11 | 79.16 | 193.53 | 79.16 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 158740 | 191407 | 201646 | 341710 | 110146 | 128745 | 132289 | 177225 | 44.13 | 88.27 | 131.83 | 206.34 | 131.83 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 161486 | 176759 | 179812 | 241252 | 107550 | 113866 | 123181 | 136669 | 5.66 | 5.68 | 5.69 | 5.69 | 129.44 | 5.69 |

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

- `llm.review_spend_decisions` (56350ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 10, "variant": "tool" }
  - output: { "caseDecisionCount": 1, "decisionCount": 5, "decisions": [ { "evidence": [ { "reference": "receipt_125128a1d6 (exp_0001)", "summary": "Receipt text states 'Non-itemized receipt image: total only' with $340.00 total", "type": "receipt" }, { "reference": "exp_0001", "summary": "Reimbursement request via personal card,...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 10, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0007", "exp_0006", "exp_0005", "exp_0004", "exp_0003", "exp_0010", "exp_0002", "exp_0009", "exp_0008", "exp_0001" ], "fields": [ "id", "type", "usd", "cat", "merchant", "user", "receiptFp", "receipt" ], "hasMore": false, "limit": 10, "matchedCount": 10, "offset": 0, "r...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0010", "exp_0002" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0010", "exp_0002" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matchedCount": 2, "...
- `tool.analyze_receipt` (1ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 6 }
  - input: { "expenseIds": [ "exp_0010", "exp_0002", "exp_0001", "exp_0004", "exp_0009", "exp_0007" ] }
  - output: [ { "expenseId": "exp_0010", "receiptPreview": "Delta Air Lines | Location: New York, NY | Receipt #: RCPT-37CFC7 | Date: 2026-04-12 13:57" }, { "expenseId": "exp_0002", "receiptPreview": "Delta Air Lines | Location: New York, NY | Receipt #: RCPT-55A27E | Date: 2026-04-11 11:13" }, { "expenseId": "exp_0001", "receipt...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 4 }
  - input: { "expenseIds": [ "exp_0005", "exp_0006", "exp_0003", "exp_0008" ] }
  - output: [ { "expenseId": "exp_0005", "receiptPreview": "Office Depot | Location: Mexico City, MX | Receipt #: RCPT-7C0E34 | Date: 2026-04-14 09:52" }, { "expenseId": "exp_0006", "receiptPreview": "Hyatt Regency | Location: Madrid, ES | Receipt #: RCPT-95813D | Date: 2026-04-15 12:05" }, { "expenseId": "exp_0003", "receiptPrev...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 1, "decisionCount": 5, "decisions": [ { "evidence": [ { "reference": "receipt_125128a1d6 (exp_0001)", "summary": "Receipt text states 'Non-itemized receipt image: total only' with $340.00 total", "type": "receipt" }, { "reference": "exp_0001", "summary": "Reimbursement request via personal card,...
  - output: { "accepted": true, "caseDecisionCount": 1, "decisionCount": 5, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 1, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpenseI...

### `just-bash`

- `llm.review_spend_decisions` (126241ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 10, "variant": "just-bash" }
  - output: { "caseDecisionCount": 3, "decisionCount": 7, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0001" ], "title": "Non-itemized reimbursement lacks required documentation", "priority": "medium", "tags": [ "DOCUMENTATION_ISSUE", "REIMBURSEMENT" ], "reasoning": "Reimbursement request for $340 from Amazon Business...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 3, "decisionCount": 7, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0001" ], "title": "Non-itemized reimbursement lacks required documentation", "priority": "medium", "tags": [ "DOCUMENTATION_ISSUE", "REIMBURSEMENT" ], "reasoning": "Reimbursement request for $340 from Amazon Business...
  - output: { "accepted": true, "caseDecisionCount": 3, "decisionCount": 7, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 3, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": []...

### `sandbox`

- `llm.review_spend_decisions` (72868ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 10, "variant": "sandbox" }
  - output: { "caseDecisionCount": 2, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0002", "exp_0010" ], "title": "Duplicate Delta Air Lines Flight Across Company-Paid and Reimbursement Channels", "priority": "critical", "tags": [ "DUPLICATE_REIMBURSEMENT", "CHANNEL_OVERLAP" ], "reasoning": "exp_000...
- `sandbox.exec submit_review` (67ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 2, \"decisionCount\": 6, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 2, \"coveredExpenseCount\": 10, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, \"f...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 2, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0002", "exp_0010" ], "title": "Duplicate Delta Air Lines Flight Across Company-Paid and Reimbursement Channels", "priority": "critical", "tags": [ "DUPLICATE_REIMBURSEMENT", "CHANNEL_OVERLAP" ], "reasoning": "exp_000...
  - output: { "accepted": true, "caseDecisionCount": 2, "decisionCount": 6, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 2, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": []...

