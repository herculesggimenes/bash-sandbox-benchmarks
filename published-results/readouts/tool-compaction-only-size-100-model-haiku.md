# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 100 anonymized company-paid expenses and reimbursements, 7 diagnostic spend-pattern signals, 1,529 policy words.
- All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool-compaction | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 167621 | 255964 | 300204 | 477180 | 173697 | 253135 | 271588 | 321367 | 8.42 | 9.28 | 9.36 | 9.78 | 9.36 | - |

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

- `llm.review_spend_decisions` (142921ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "compactContext": true, "expenseCount": 100, "variant": "tool-compaction" }
  - output: { "caseDecisionCount": 11, "decisionCount": 12, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash $220 stored-value load on corporate Visa, memo claims 'team incidentals'", "type": "expense" }, { "reference": "exp_0088", "summary": "Apple Cash $350 stored-value load on personal card reim...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0063", "exp_0070", "exp_0077", "exp_0084", "exp_0007", "exp_0014", "exp_0091", "exp_0021", "exp_0098", "exp_0028", "exp_0035", "exp_0049", "exp_0056", "exp_0048", "exp_0055", "exp_0062", "exp_0069", "exp_0043", "exp_0042", "exp_0076", "exp_0083", "exp_0041", "exp_0006"...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 50, "offset": 50 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0025", "exp_0032", "exp_0039", "exp_0046", "exp_0053", "exp_0060", "exp_0067", "exp_0073", "exp_0052", "exp_0059", "exp_0066", "exp_0003", "exp_0080", "exp_0010", "exp_0087", "exp_0017", "exp_0094", "exp_0024", "exp_0031", "exp_0038", "exp_0045", "exp_0072", "exp_0030"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 10 }
  - input: { "expenseIds": [ "exp_0097", "exp_0088", "exp_0059", "exp_0087", "exp_0076", "exp_0075", "exp_0024", "exp_0025", "exp_0081", "exp_0082" ] }
  - output: [ { "expenseId": "exp_0097", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-C3DD6A | Date: 2026-04-15 10:48" }, { "expenseId": "exp_0088", "receiptPreview": "Apple Cash | Location: Los Angeles, CA | Receipt #: RCPT-145E2C | Date: 2026-04-13 16:51" }, { "expenseId": "exp_0059", "receiptPr...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 9 }
  - input: { "expenseIds": [ "exp_0056", "exp_0083", "exp_0001", "exp_0014", "exp_0042", "exp_0043", "exp_0041", "exp_0049", "exp_0095" ] }
  - output: [ { "expenseId": "exp_0056", "receiptPreview": "Receipt unavailable | Expense id: exp_0056 | Merchant claimed by submitter: Soho House | Amount: $1485.00" }, { "expenseId": "exp_0083", "receiptPreview": "The Smith | Location: London, UK | Receipt #: RCPT-541C9E | Date: 2026-04-15 12:46" }, { "expenseId": "exp_0001", "...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 12, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash $220 stored-value load on corporate Visa, memo claims 'team incidentals'", "type": "expense" }, { "reference": "exp_0088", "summary": "Apple Cash $350 stored-value load on personal card reim...
  - output: { "accepted": false, "caseDecisionCount": 11, "decisionCount": 12, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 3 expense ids; first missing ids: exp_0048, exp_0055, exp_0077; every in-scope expense id must appear in exactly one case or no_case decision", "su...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 3 }
  - input: { "expenseIds": [ "exp_0048", "exp_0055", "exp_0077" ] }
  - output: [ { "expenseId": "exp_0048", "receiptPreview": "Figma | Location: Los Angeles, CA | Receipt #: RCPT-6AF914 | Date: 2026-04-15 17:11" }, { "expenseId": "exp_0055", "receiptPreview": "United Airlines | Location: Sao Paulo, BR | Receipt #: RCPT-F2A393 | Date: 2026-04-15 16:42" }, { "expenseId": "exp_0077", "receiptPrevie...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 13703, "llm.compaction.compacted_tokens_estimate": 7500, "llm.compaction.message_count": 15, "llm.compaction.compacted_message_count": 13 }
  - output: { "compactedMessageCount": 13, "compactedTokenEstimate": 7500, "originalMessageCount": 15, "originalTokenEstimate": 13703 }
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 12, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash $220 stored-value load on corporate Visa, memo claims 'team incidentals'", "type": "expense" }, { "reference": "exp_0088", "summary": "Apple Cash $350 stored-value load on personal card reim...
  - output: { "accepted": false, "caseDecisionCount": 11, "decisionCount": 12, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 1 expense ids; first missing ids: exp_0077; every in-scope expense id must appear in exactly one case or no_case decision", "submissionFile": null,...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 18384, "llm.compaction.compacted_tokens_estimate": 11397, "llm.compaction.message_count": 17, "llm.compaction.compacted_message_count": 14 }
  - output: { "compactedMessageCount": 14, "compactedTokenEstimate": 11397, "originalMessageCount": 17, "originalTokenEstimate": 18384 }
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 11, "decisionCount": 12, "decisions": [ { "evidence": [ { "reference": "exp_0097", "summary": "Apple Cash $220 stored-value load on corporate Visa, memo claims 'team incidentals'", "type": "expense" }, { "reference": "exp_0088", "summary": "Apple Cash $350 stored-value load on personal card reim...
  - output: { "accepted": true, "caseDecisionCount": 11, "decisionCount": 12, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 11, "coveredExpenseCount": 100, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpe...

