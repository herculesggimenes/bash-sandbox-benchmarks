# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 100 anonymized company-paid expenses and reimbursements, 7 diagnostic spend-pattern signals, 1,529 policy words.
- All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool-compaction | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 107143 | 114371 | 121216 | 127577 | 230256 | 298055 | 315202 | 320107 | 4.61 | 15.66 | 15.94 | 17.02 | 15.94 | - |

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

- `llm.review_spend_decisions` (320105ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "compactContext": true, "expenseCount": 100, "variant": "tool-compaction" }
  - output: { "caseDecisionCount": 12, "decisionCount": 29, "decisions": [ { "evidence": [ { "reference": "receipt_4b4d6e7e3b", "summary": "Identical United Airlines receipt RCPT-98337A for $486.72 flight dated 2026-04-12", "type": "receipt" }, { "reference": "exp_0024", "summary": "Company-paid expense by user_f4c3389a, $486.72,...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0063", "exp_0070", "exp_0077", "exp_0084", "exp_0007", "exp_0014", "exp_0091", "exp_0021", "exp_0098", "exp_0028", "exp_0035", "exp_0049", "exp_0056", "exp_0048", "exp_0055", "exp_0062", "exp_0069", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0006"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 7 }
  - input: { "expenseIds": [ "exp_0025", "exp_0024", "exp_0082", "exp_0081", "exp_0097", "exp_0088", "exp_0059" ] }
  - output: [ { "expenseId": "exp_0025", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-98337A | Date: 2026-04-12 11:59" }, { "expenseId": "exp_0024", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-98337A | Date: 2026-04-12 11:59" }, { "expenseId": "exp_0082"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 12 }
  - input: { "expenseIds": [ "exp_0076", "exp_0075", "exp_0087", "exp_0084", "exp_0078", "exp_0048", "exp_0056", "exp_0007", "exp_0037", "exp_0058", "exp_0070", "exp_0077" ] }
  - output: [ { "expenseId": "exp_0076", "receiptPreview": "Anthropic | Location: Bogota, CO | Receipt #: RCPT-7A89F9 | Date: 2026-04-15 13:15" }, { "expenseId": "exp_0075", "receiptPreview": "Anthropic | Location: London, UK | Receipt #: RCPT-557FB9 | Date: 2026-04-14 10:02" }, { "expenseId": "exp_0087", "receiptPreview": "OpenA...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 12 }
  - input: { "expenseIds": [ "exp_0100", "exp_0091", "exp_0096", "exp_0046", "exp_0016", "exp_0001", "exp_0014", "exp_0098", "exp_0049", "exp_0069", "exp_0083", "exp_0094" ] }
  - output: [ { "expenseId": "exp_0100", "receiptPreview": "Delta Air Lines | Location: Bogota, CO | Receipt #: RCPT-102D7A | Date: 2026-04-11 08:27" }, { "expenseId": "exp_0091", "receiptPreview": "Amazon Business | Location: London, UK | Receipt #: RCPT-0767C0 | Date: 2026-04-16 14:30" }, { "expenseId": "exp_0096", "receiptPrev...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 8 }
  - input: { "expenseIds": [ "exp_0043", "exp_0042", "exp_0041", "exp_0053", "exp_0038", "exp_0099", "exp_0079", "exp_0089" ] }
  - output: [ { "expenseId": "exp_0043", "receiptPreview": "The Smith | Location: New York, NY | Receipt #: RCPT-45DC63 | Date: 2026-04-15 14:32" }, { "expenseId": "exp_0042", "receiptPreview": "The Smith | Location: New York, NY | Receipt #: RCPT-EC1C1E | Date: 2026-04-15 13:21" }, { "expenseId": "exp_0041", "receiptPreview": "T...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 12, "decisionCount": 29, "decisions": [ { "evidence": [ { "reference": "receipt_4b4d6e7e3b", "summary": "Identical United Airlines receipt RCPT-98337A for $486.72 flight dated 2026-04-12", "type": "receipt" }, { "reference": "exp_0024", "summary": "Company-paid expense by user_f4c3389a, $486.72,...
  - output: { "accepted": false, "caseDecisionCount": 12, "decisionCount": 29, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 1 expense ids; first missing ids: exp_0031; every in-scope expense id must appear in exactly one case or no_case decision", "submissionFile": null,...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 1 }
  - input: { "expenseIds": [ "exp_0031" ] }
  - output: [ { "expenseId": "exp_0031", "receiptPreview": "Hilton Garden Inn | Location: Sao Paulo, BR | Receipt #: RCPT-9F6EFE | Date: 2026-04-12 10:30" } ]
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 18529, "llm.compaction.compacted_tokens_estimate": 11636, "llm.compaction.message_count": 15, "llm.compaction.compacted_message_count": 13 }
  - output: { "compactedMessageCount": 13, "compactedTokenEstimate": 11636, "originalMessageCount": 15, "originalTokenEstimate": 18529 }
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 12, "decisionCount": 29, "decisions": [ { "evidence": [ { "reference": "receipt_4b4d6e7e3b", "summary": "Identical United Airlines receipt RCPT-98337A for $486.72 flight dated 2026-04-12", "type": "receipt" }, { "reference": "exp_0024", "summary": "Company-paid expense by user_f4c3389a, $486.72,...
  - output: { "accepted": true, "caseDecisionCount": 12, "decisionCount": 29, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 12, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpe...

