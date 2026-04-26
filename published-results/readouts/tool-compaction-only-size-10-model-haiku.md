# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 10 anonymized company-paid expenses and reimbursements, 0 diagnostic spend-pattern signals, 1,529 policy words.
- All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool-compaction | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 47076 | 53496 | 56167 | 69445 | 42834 | 49794 | 56913 | 59688 | 4.70 | 5.78 | 5.88 | 5.89 | 5.88 | - |

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

- `llm.review_spend_decisions` (42327ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "compactContext": true, "expenseCount": 10, "variant": "tool-compaction" }
  - output: { "caseDecisionCount": 2, "decisionCount": 5, "decisions": [ { "evidence": [ { "reference": "exp_0001 receipt RCPT-70F9D6", "summary": "Non-itemized receipt showing only total ($340) with no line-item detail. Memo states generic 'reimbursement request for Amazon Business' with no supporting narrative.", "type": "recei...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 10, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0007", "exp_0006", "exp_0005", "exp_0004", "exp_0003", "exp_0010", "exp_0002", "exp_0009", "exp_0008", "exp_0001" ], "fields": [ "id", "type", "usd", "cat", "merchant", "user", "receiptFp", "receipt" ], "hasMore": false, "limit": 10, "matchedCount": 10, "offset": 0, "r...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 10 }
  - input: { "expenseIds": [ "exp_0001", "exp_0007", "exp_0002", "exp_0010", "exp_0005", "exp_0004", "exp_0009", "exp_0003", "exp_0006", "exp_0008" ] }
  - output: [ { "expenseId": "exp_0001", "receiptPreview": "Amazon Business | Location: San Francisco, CA | Receipt #: RCPT-70F9D6 | Date: 2026-04-10 08:00" }, { "expenseId": "exp_0007", "receiptPreview": "Marriott Marquis | Location: Sao Paulo, BR | Receipt #: RCPT-2B4F73 | Date: 2026-04-16 15:18" }, { "expenseId": "exp_0002", "...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 2, "decisionCount": 5, "decisions": [ { "evidence": [ { "reference": "exp_0001 receipt RCPT-70F9D6", "summary": "Non-itemized receipt showing only total ($340) with no line-item detail. Memo states generic 'reimbursement request for Amazon Business' with no supporting narrative.", "type": "recei...
  - output: { "accepted": true, "caseDecisionCount": 2, "decisionCount": 5, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 2, "coveredExpenseCount": 10, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpenseI...

