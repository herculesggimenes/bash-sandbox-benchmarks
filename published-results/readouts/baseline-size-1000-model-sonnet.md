# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 1,000 anonymized company-paid expenses and reimbursements, 70 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 193ms P95 and warm-start is 52ms P95, versus 2ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 3/20 | 2/3 | 0/3 | 0/0 | 2/3 | 0.0 | 0.0 | 0.0 | 0.0 | 957353 | 957353 | 957353 | 957353 | 436054 | 436054 | 436054 | 436054 | 234.88 | 234.88 | 234.88 | 234.88 | 234.88 | - |
| just-bash | 20/20 | 19/20 | 0/20 | 0/0 | 19/20 | 0.0 | 0.0 | 0.0 | 0.0 | 511271 | 594253 | 672105 | 866713 | 287327 | 301484 | 308550 | 323456 | 157.92 | 234.88 | 249.30 | 276.89 | 249.30 | - |
| sandbox | 20/20 | 19/20 | 0/20 | 0/0 | 19/20 | 0.0 | 0.0 | 0.0 | 0.0 | 547148 | 639416 | 651707 | 812696 | 255933 | 294822 | 299702 | 335418 | 6.66 | 6.68 | 6.70 | 6.73 | 246.50 | 6.70 |

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

- `llm.review_spend_decisions` (480008ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 1000, "variant": "tool" }
- `tool.get_expenses` (7ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 500, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 500, "offset": 500 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0032", "exp_0802", "exp_0571", "exp_0340", "exp_0109", "exp_0516", "exp_0879", "exp_0648", "exp_0417", "exp_0186", "exp_0347", "exp_0116", "exp_0886", "exp_0655", "exp_0424", "exp_0193", "exp_0963", "exp_0732", "exp_0501", "exp_0270", "exp_0039", "exp_0515", "exp_0809"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 27 }
  - input: { "expenseIds": [ "exp_0231", "exp_0273", "exp_0287", "exp_0223", "exp_0238", "exp_0826", "exp_0321", "exp_0097", "exp_0319", "exp_0088", "exp_0825", "exp_0237", "exp_0236", "exp_0789", "exp_0220", "exp_0059", "exp_0809", "exp_0277", "exp_0270", "exp_0262", "exp_0323", "exp_0443", "exp_0211", "exp_0275", "exp_0808", "...
  - output: [ { "expenseId": "exp_0231", "receiptPreview": "Anthropic | Location: Sao Paulo, BR | Receipt #: RCPT-95D638 | Date: 2026-04-16 16:50" }, { "expenseId": "exp_0273", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-12E4F3 | Date: 2026-04-16 10:56" }, { "expenseId": "exp_0287", "receiptPrevi...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 11 }
  - input: { "expenseIds": [ "exp_0616", "exp_0270", "exp_0962", "exp_0043", "exp_0196", "exp_0911", "exp_0912", "exp_0357", "exp_0358", "exp_0359", "exp_0910" ] }
  - output: [ { "expenseId": "exp_0616", "receiptPreview": "Venmo | Location: San Francisco, CA | Receipt #: RCPT-8039C7 | Date: 2026-04-16 16:15" }, { "expenseId": "exp_0270", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-370D67 | Date: 2026-04-14 12:41" }, { "expenseId": "exp_0962", "receipt...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 20 }
  - input: { "expenseIds": [ "exp_0056", "exp_0503", "exp_0354", "exp_0801", "exp_0950", "exp_0205", "exp_0652", "exp_0195", "exp_0043", "exp_0910", "exp_0912", "exp_0359", "exp_0358", "exp_0357", "exp_0011", "exp_0186", "exp_0025", "exp_0024", "exp_0193", "exp_0928" ] }
  - output: [ { "expenseId": "exp_0056", "receiptPreview": "Receipt unavailable | Expense id: exp_0056 | Merchant claimed by submitter: Soho House | Amount: $1485.00" }, { "expenseId": "exp_0503", "receiptPreview": "Receipt unavailable | Expense id: exp_0503 | Merchant claimed by submitter: Soho House | Amount: $1705.00" }, { "ex...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 15, "decisionCount": 44, "decisions": [ { "evidence": [ { "reference": "exp_0273", "summary": "Apple Cash load $248.74, receipt shows 'Stored-value / cash-equivalent load: $241.28'", "type": "receipt" }, { "reference": "exp_0287", "summary": "Apple Cash load $262.79, corporate card ending 1178",...
  - output: { "accepted": false, "caseDecisionCount": 15, "decisionCount": 44, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; invalid expense ids: esp_0611, esp_0919; duplicate expense ids: exp_0088, exp_0912, exp_0182, exp_0011, exp_0186, exp_0195, exp_0252, exp_0947, exp_0606, e...
- `tool.get_expenses` (12ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 1000, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...

### `just-bash`

- `llm.review_spend_decisions` (264079ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 1000, "variant": "just-bash" }
  - output: { "caseDecisionCount": 6, "decisionCount": 10, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 6, "decisionCount": 10, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
  - output: { "accepted": true, "caseDecisionCount": 6, "decisionCount": 10, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 6, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds":...

### `sandbox`

- `llm.review_spend_decisions` (212221ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 1000, "variant": "sandbox" }
  - output: { "caseDecisionCount": 6, "decisionCount": 17, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
- `sandbox.exec submit_review` (88ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": false, \"caseDecisionCount\": 6, \"decisionCount\": 17, \"loadError\": null, \"message\": \"not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0962, exp_0270, exp_0087, exp_0193, exp_0909, exp_0056, exp_0652, exp_0950, exp_0105, exp_0940, ex...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 6, "decisionCount": 17, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
  - output: { "accepted": false, "caseDecisionCount": 6, "decisionCount": 17, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0962, exp_0270, exp_0087, exp_0193, exp_0909, exp_0056, exp_0652, exp_0950, exp_0105, exp_0940, exp_0928, exp_0966; every in-scop...
- `sandbox.exec submit_review` (74ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 6, \"decisionCount\": 17, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 6, \"coveredExpenseCount\": 1000, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, ...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 6, "decisionCount": 17, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
  - output: { "accepted": true, "caseDecisionCount": 6, "decisionCount": 17, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 6, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds":...

