# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 10 anonymized company-paid expenses and reimbursements, 0 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 119ms P95 and warm-start is 46ms P95, versus 1ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 30505 | 31776 | 40238 | 40296 | 47746 | 55748 | 56558 | 57019 | 31.95 | 44.63 | 54.98 | 107.42 | 54.98 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 101974 | 111715 | 112480 | 116583 | 66398 | 73098 | 73542 | 80902 | 36.16 | 54.05 | 54.98 | 107.31 | 54.98 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 89820 | 104782 | 114715 | 135721 | 63998 | 71285 | 74190 | 82439 | 5.59 | 5.66 | 5.66 | 5.84 | 54.98 | 5.66 |

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

- `llm.review_spend_decisions` (55746ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 10, "variant": "tool" }
  - output: { "caseDecisionCount": 2, "decisionCount": 6, "decisions": [ { "evidence": [ { "reference": "receipt_125128a1d6", "summary": "Receipt shows only total $340, no itemization of what was purchased", "type": "receipt" }, { "reference": "exp_0001", "summary": "receiptStatus: non_itemized, category: receipt_review, generic ...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 10, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0007", "exp_0006", "exp_0005", "exp_0004", "exp_0003", "exp_0010", "exp_0002", "exp_0009", "exp_0008", "exp_0001" ], "fields": [ "id", "type", "usd", "cat", "merchant", "user", "receiptFp", "receipt" ], "hasMore": false, "limit": 10, "matchedCount": 10, "offset": 0, "r...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0001", "exp_0007", "exp_0005", "exp_0004", "exp_0009", "exp_0002", "exp_0010" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0007", "exp_0005", "exp_0004", "exp_0010", "exp_0002", "exp_0009", "exp_0001" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 10 }
  - input: { "expenseIds": [ "exp_0001", "exp_0007", "exp_0005", "exp_0004", "exp_0009", "exp_0002", "exp_0010", "exp_0003", "exp_0006", "exp_0008" ] }
  - output: [ { "expenseId": "exp_0001", "receiptPreview": "Amazon Business | Location: San Francisco, CA | Receipt #: RCPT-70F9D6 | Date: 2026-04-10 08:00" }, { "expenseId": "exp_0007", "receiptPreview": "Marriott Marquis | Location: Sao Paulo, BR | Receipt #: RCPT-2B4F73 | Date: 2026-04-16 15:18" }, { "expenseId": "exp_0005", "...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 2, "decisionCount": 6, "decisions": [ { "evidence": [ { "reference": "receipt_125128a1d6", "summary": "Receipt shows only total $340, no itemization of what was purchased", "type": "receipt" }, { "reference": "exp_0001", "summary": "receiptStatus: non_itemized, category: receipt_review, generic ...
  - output: { "accepted": true, "caseDecisionCount": 2, "decisionCount": 6, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 2, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpenseI...

### `just-bash`

- `llm.review_spend_decisions` (66392ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 10, "variant": "just-bash" }
  - output: { "caseDecisionCount": 1, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0001" ], "title": "Non-itemized receipt on reimbursement request", "priority": "medium", "tags": [ "DOCUMENTATION_ISSUE" ], "reasoning": "Reimbursement request for $340 from Amazon Business has non-itemized receipt s...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 1, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0001" ], "title": "Non-itemized receipt on reimbursement request", "priority": "medium", "tags": [ "DOCUMENTATION_ISSUE" ], "reasoning": "Reimbursement request for $340 from Amazon Business has non-itemized receipt s...
  - output: { "accepted": true, "caseDecisionCount": 1, "decisionCount": 6, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 1, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": []...

### `sandbox`

- `llm.review_spend_decisions` (54766ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 10, "variant": "sandbox" }
  - output: { "caseDecisionCount": 1, "decisionCount": 5, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0001" ], "title": "Non-itemized receipt on Amazon Business reimbursement", "priority": "medium", "tags": [ "DOCUMENTATION_ISSUE", "MISSING_ITEMIZATION" ], "reasoning": "Employee reimbursement request for $340 from Am...
- `sandbox.exec submit_review` (67ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 1, \"decisionCount\": 5, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 1, \"coveredExpenseCount\": 10, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, \"f...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 1, "decisionCount": 5, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0001" ], "title": "Non-itemized receipt on Amazon Business reimbursement", "priority": "medium", "tags": [ "DOCUMENTATION_ISSUE", "MISSING_ITEMIZATION" ], "reasoning": "Employee reimbursement request for $340 from Am...
  - output: { "accepted": true, "caseDecisionCount": 1, "decisionCount": 5, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 1, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": []...

