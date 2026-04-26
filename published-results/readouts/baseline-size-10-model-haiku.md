# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 10 anonymized company-paid expenses and reimbursements, 0 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 160ms P95 and warm-start is 47ms P95, versus 1ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 53589 | 89530 | 91867 | 138974 | 49824 | 67289 | 79890 | 110410 | 44.08 | 64.30 | 85.09 | 117.23 | 85.09 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 162725 | 195563 | 203662 | 240596 | 71137 | 98328 | 107280 | 113462 | 47.13 | 76.11 | 85.09 | 129.33 | 85.09 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 188753 | 240142 | 251137 | 255003 | 77844 | 87681 | 102029 | 125406 | 5.64 | 5.69 | 5.69 | 5.70 | 85.06 | 5.69 |

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

- `llm.review_spend_decisions` (42535ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 10, "variant": "tool" }
  - output: { "caseDecisionCount": 2, "decisionCount": 6, "decisions": [ { "evidence": [ { "reference": "exp_0001", "summary": "Amazon Business reimbursement, non-itemized receipt showing only total $340, receipt status explicitly marked non_itemized", "type": "expense" }, { "reference": "Policy Section 3: Reimbursement Rules", "...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 10, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0007", "exp_0006", "exp_0005", "exp_0004", "exp_0003", "exp_0010", "exp_0002", "exp_0009", "exp_0008", "exp_0001" ], "fields": [ "id", "type", "usd", "cat", "merchant", "user", "receiptFp", "receipt" ], "hasMore": false, "limit": 10, "matchedCount": 10, "offset": 0, "r...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0001", "exp_0002", "exp_0003", "exp_0004", "exp_0005", "exp_0006", "exp_0007", "exp_0008", "exp_0009", "exp_0010" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0007", "exp_0006", "exp_0005", "exp_0004", "exp_0003", "exp_0010", "exp_0002", "exp_0009", "exp_0008", "exp_0001" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptS...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 10 }
  - input: { "expenseIds": [ "exp_0001", "exp_0002", "exp_0003", "exp_0004", "exp_0005", "exp_0006", "exp_0007", "exp_0008", "exp_0009", "exp_0010" ] }
  - output: [ { "expenseId": "exp_0001", "receiptPreview": "Amazon Business | Location: San Francisco, CA | Receipt #: RCPT-70F9D6 | Date: 2026-04-10 08:00" }, { "expenseId": "exp_0002", "receiptPreview": "Delta Air Lines | Location: New York, NY | Receipt #: RCPT-55A27E | Date: 2026-04-11 11:13" }, { "expenseId": "exp_0003", "re...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 2, "decisionCount": 6, "decisions": [ { "evidence": [ { "reference": "exp_0001", "summary": "Amazon Business reimbursement, non-itemized receipt showing only total $340, receipt status explicitly marked non_itemized", "type": "expense" }, { "reference": "Policy Section 3: Reimbursement Rules", "...
  - output: { "accepted": true, "caseDecisionCount": 2, "decisionCount": 6, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 2, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpenseI...

### `just-bash`

- `llm.review_spend_decisions` (65557ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 10, "variant": "just-bash" }
  - output: { "caseDecisionCount": 4, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0002", "exp_0010" ], "title": "Potential Duplicate Delta Air Lines Purchase Across Company-Paid and Reimbursement Channels", "priority": "critical", "tags": [ "DUPLICATE_SPEND", "REIMBURSEMENT_RISK", "CASH_FLOW_DUPLI...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 4, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0002", "exp_0010" ], "title": "Potential Duplicate Delta Air Lines Purchase Across Company-Paid and Reimbursement Channels", "priority": "critical", "tags": [ "DUPLICATE_SPEND", "REIMBURSEMENT_RISK", "CASH_FLOW_DUPLI...
  - output: { "accepted": true, "caseDecisionCount": 4, "decisionCount": 6, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 4, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": []...

### `sandbox`

- `llm.review_spend_decisions` (99792ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 10, "variant": "sandbox" }
  - output: { "caseDecisionCount": 4, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0002", "exp_0010" ], "title": "Duplicate Delta Air Lines flight: company-paid and reimbursement for same flight", "priority": "critical", "tags": [ "DUPLICATE_RECEIPT", "REIMBURSEMENT_MISUSE", "MATERIAL_DUPLICATE" ],...
- `sandbox.exec submit_review` (71ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 4, \"decisionCount\": 6, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 4, \"coveredExpenseCount\": 10, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, \"f...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 4, "decisionCount": 6, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0002", "exp_0010" ], "title": "Duplicate Delta Air Lines flight: company-paid and reimbursement for same flight", "priority": "critical", "tags": [ "DUPLICATE_RECEIPT", "REIMBURSEMENT_MISUSE", "MATERIAL_DUPLICATE" ],...
  - output: { "accepted": true, "caseDecisionCount": 4, "decisionCount": 6, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 4, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": []...

