# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 100 anonymized company-paid expenses and reimbursements, 7 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 169ms P95 and warm-start is 49ms P95, versus 1ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 20/20 | 19/20 | 0/20 | 0/0 | 19/20 | 0.0 | 0.0 | 0.0 | 0.0 | 218897 | 324880 | 434502 | 3262959 | 219165 | 325568 | 364716 | 389567 | 63.67 | 128.78 | 158.17 | 201.83 | 158.17 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 294949 | 382742 | 454119 | 638008 | 107028 | 117379 | 136303 | 147294 | 63.67 | 128.77 | 158.19 | 208.73 | 158.19 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 359547 | 476505 | 618005 | 1242936 | 113574 | 153419 | 177700 | 187989 | 5.74 | 5.77 | 5.77 | 5.85 | 158.19 | 5.77 |

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

- `llm.review_spend_decisions` (98137ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 100, "variant": "tool" }
  - output: { "caseDecisionCount": 7, "decisionCount": 10, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash stored-value load for $220 (including $6.60 fee) charged to corporate Visa on 2026-04-15. Memo states 'team incidentals stored value load' with no business justification or program exception ...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0063", "exp_0070", "exp_0077", "exp_0084", "exp_0007", "exp_0014", "exp_0091", "exp_0021", "exp_0098", "exp_0028", "exp_0035", "exp_0049", "exp_0056", "exp_0048", "exp_0055", "exp_0062", "exp_0069", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0006"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 50 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0025", "exp_0032", "exp_0039", "exp_0046", "exp_0053", "exp_0060", "exp_0067", "exp_0073", "exp_0052", "exp_0059", "exp_0066", "exp_0003", "exp_0080", "exp_0010", "exp_0087", "exp_0017", "exp_0094", "exp_0024", "exp_0031", "exp_0038", "exp_0045", "exp_0072", "exp_0030"...
- `tool.analyze_receipt` (1ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 12 }
  - input: { "expenseIds": [ "exp_0097", "exp_0088", "exp_0059", "exp_0024", "exp_0025", "exp_0081", "exp_0082", "exp_0056", "exp_0083", "exp_0087", "exp_0076", "exp_0075" ] }
  - output: [ { "expenseId": "exp_0097", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-C3DD6A | Date: 2026-04-15 10:48" }, { "expenseId": "exp_0088", "receiptPreview": "Apple Cash | Location: Los Angeles, CA | Receipt #: RCPT-145E2C | Date: 2026-04-13 16:51" }, { "expenseId": "exp_0059", "receiptPr...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "merchantContains": "The Smith" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0014", "exp_0098", "exp_0049", "exp_0069", "exp_0043", "exp_0042", "exp_0083", "exp_0041", "exp_0026", "exp_0054", "exp_0074", "exp_0095", "exp_0053", "exp_0060", "exp_0094", "exp_0038", "exp_0092" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "me...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 7, "decisionCount": 10, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash stored-value load for $220 (including $6.60 fee) charged to corporate Visa on 2026-04-15. Memo states 'team incidentals stored value load' with no business justification or program exception ...
  - output: { "accepted": false, "caseDecisionCount": 7, "decisionCount": 10, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 1 expense ids; first missing ids: exp_0007; every in-scope expense id must appear in exactly one case or no_case decision", "submissionFile": null, ...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 1 }
  - input: { "expenseIds": [ "exp_0007" ] }
  - output: [ { "expenseId": "exp_0007", "receiptPreview": "Marriott Marquis | Location: Sao Paulo, BR | Receipt #: RCPT-2B4F73 | Date: 2026-04-16 15:18" } ]
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 7, "decisionCount": 10, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash stored-value load for $220 (including $6.60 fee) charged to corporate Visa on 2026-04-15. Memo states 'team incidentals stored value load' with no business justification or program exception ...
  - output: { "accepted": true, "caseDecisionCount": 7, "decisionCount": 10, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 7, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpens...

### `just-bash`

- `llm.review_spend_decisions` (147291ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 100, "variant": "just-bash" }
  - output: { "caseDecisionCount": 6, "decisionCount": 7, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0097", "exp_0088" ], "title": "Prohibited Cash-Equivalent Purchases", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "POLICY_VIOLATION" ], "reasoning": "Two cash-equivalent (Apple Cash stored-value) purchases ...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 6, "decisionCount": 7, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0097", "exp_0088" ], "title": "Prohibited Cash-Equivalent Purchases", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "POLICY_VIOLATION" ], "reasoning": "Two cash-equivalent (Apple Cash stored-value) purchases ...
  - output: { "accepted": true, "caseDecisionCount": 6, "decisionCount": 7, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 6, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [...

### `sandbox`

- `llm.review_spend_decisions` (118494ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 100, "variant": "sandbox" }
  - output: { "caseDecisionCount": 6, "decisionCount": 12, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Prohibited cash-equivalent purchases", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three cash-equivalent expenses: Apple Cash l...
- `sandbox.exec submit_review` (81ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 6, \"decisionCount\": 12, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 6, \"coveredExpenseCount\": 100, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, \...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 6, "decisionCount": 12, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Prohibited cash-equivalent purchases", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three cash-equivalent expenses: Apple Cash l...
  - output: { "accepted": true, "caseDecisionCount": 6, "decisionCount": 12, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 6, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": ...

