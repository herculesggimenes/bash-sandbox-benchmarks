# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 100 anonymized company-paid expenses and reimbursements, 7 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 227ms P95 and warm-start is 58ms P95, versus 2ms and 1ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 99097 | 122521 | 123943 | 136589 | 240094 | 279571 | 312465 | 328090 | 157.88 | 171.48 | 173.56 | 258.73 | 173.56 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 374650 | 416654 | 447632 | 520052 | 192381 | 260034 | 260080 | 288233 | 158.52 | 173.02 | 204.17 | 257.92 | 204.17 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 345409 | 406424 | 412997 | 635558 | 171141 | 207131 | 217230 | 415654 | 5.78 | 5.81 | 5.82 | 5.88 | 195.81 | 5.82 |

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

- `llm.review_spend_decisions` (312462ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 100, "variant": "tool" }
  - output: { "caseDecisionCount": 11, "decisionCount": 24, "decisions": [ { "evidence": [ { "reference": "exp_0097 receipt_6424c4d21d", "summary": "Apple Cash receipt shows stored-value load $213.40 + fee $6.60, paid with Corporate Visa, company-paid expense", "type": "receipt" }, { "reference": "exp_0088 receipt_d2f7472e40", "s...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0063", "exp_0070", "exp_0077", "exp_0084", "exp_0007", "exp_0014", "exp_0091", "exp_0021", "exp_0098", "exp_0028", "exp_0035", "exp_0049", "exp_0056", "exp_0048", "exp_0055", "exp_0062", "exp_0069", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0006"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 7 }
  - input: { "expenseIds": [ "exp_0097", "exp_0088", "exp_0059", "exp_0024", "exp_0025", "exp_0081", "exp_0082" ] }
  - output: [ { "expenseId": "exp_0097", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-C3DD6A | Date: 2026-04-15 10:48" }, { "expenseId": "exp_0088", "receiptPreview": "Apple Cash | Location: Los Angeles, CA | Receipt #: RCPT-145E2C | Date: 2026-04-13 16:51" }, { "expenseId": "exp_0059", "receiptPr...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 9 }
  - input: { "expenseIds": [ "exp_0084", "exp_0048", "exp_0087", "exp_0076", "exp_0075", "exp_0056", "exp_0068", "exp_0083", "exp_0001" ] }
  - output: [ { "expenseId": "exp_0084", "receiptPreview": "Figma | Location: Bogota, CO | Receipt #: RCPT-396B11 | Date: 2026-04-16 15:59" }, { "expenseId": "exp_0048", "receiptPreview": "Figma | Location: Los Angeles, CA | Receipt #: RCPT-6AF914 | Date: 2026-04-15 17:11" }, { "expenseId": "exp_0087", "receiptPreview": "OpenAI |...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 7 }
  - input: { "expenseIds": [ "exp_0049", "exp_0053", "exp_0038", "exp_0014", "exp_0041", "exp_0042", "exp_0043" ] }
  - output: [ { "expenseId": "exp_0049", "receiptPreview": "The Smith | Location: San Francisco, CA | Receipt #: RCPT-A52810 | Date: 2026-04-16 09:24" }, { "expenseId": "exp_0053", "receiptPreview": "The Smith | Location: Mexico City, MX | Receipt #: RCPT-CA2CFD | Date: 2026-04-13 10:16" }, { "expenseId": "exp_0038", "receiptPrev...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 24, "decisions": [ { "evidence": [ { "reference": "exp_0097 receipt_6424c4d21d", "summary": "Apple Cash receipt shows stored-value load $213.40 + fee $6.60, paid with Corporate Visa, company-paid expense", "type": "receipt" }, { "reference": "exp_0088 receipt_d2f7472e40", "s...
  - output: { "accepted": false, "caseDecisionCount": 11, "decisionCount": 24, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 2 expense ids; first missing ids: exp_0028, exp_0059; every in-scope expense id must appear in exactly one case or no_case decision", "submissionFi...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 1 }
  - input: { "expenseIds": [ "exp_0028" ] }
  - output: [ { "expenseId": "exp_0028", "receiptPreview": "Amtrak | Location: Bogota, CO | Receipt #: RCPT-CC8C80 | Date: 2026-04-16 12:51" } ]
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 24, "decisions": [ { "evidence": [ { "reference": "exp_0097 receipt_6424c4d21d", "summary": "Apple Cash receipt shows stored-value load $213.40 + fee $6.60, paid with Corporate Visa, company-paid expense", "type": "receipt" }, { "reference": "exp_0088 receipt_d2f7472e40", "s...
  - output: { "accepted": true, "caseDecisionCount": 11, "decisionCount": 24, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 11, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpe...

### `just-bash`

- `llm.review_spend_decisions` (260078ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 100, "variant": "just-bash" }
  - output: { "caseDecisionCount": 7, "decisionCount": 13, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Prohibited cash-equivalent spend", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three expenses show direct cash-equivalent purch...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 7, "decisionCount": 13, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Prohibited cash-equivalent spend", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three expenses show direct cash-equivalent purch...
  - output: { "accepted": false, "caseDecisionCount": 7, "decisionCount": 13, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0056, exp_0068; every in-scope expense id must appear in exactly one case or no_case decision", "submissionFile": "/tmp/submissio...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 7, "decisionCount": 13, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Prohibited cash-equivalent spend", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three expenses show direct cash-equivalent purch...
  - output: { "accepted": true, "caseDecisionCount": 7, "decisionCount": 13, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 7, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": ...

### `sandbox`

- `llm.review_spend_decisions` (157601ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 100, "variant": "sandbox" }
  - output: { "caseDecisionCount": 11, "decisionCount": 17, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Cash-Equivalent Spend - Policy Violation", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three expenses show direct cash-equival...
- `sandbox.exec submit_review` (73ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 11, \"decisionCount\": 17, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 11, \"coveredExpenseCount\": 100, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true,...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 11, "decisionCount": 17, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097" ], "title": "Cash-Equivalent Spend - Policy Violation", "priority": "critical", "tags": [ "PROHIBITED_SPEND", "CASH_EQUIVALENT" ], "reasoning": "Three expenses show direct cash-equival...
  - output: { "accepted": true, "caseDecisionCount": 11, "decisionCount": 17, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 11, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds"...

