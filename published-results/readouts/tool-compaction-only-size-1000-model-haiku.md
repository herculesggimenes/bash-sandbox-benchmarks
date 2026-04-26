# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 1,000 anonymized company-paid expenses and reimbursements, 70 diagnostic spend-pattern signals, 1,529 policy words.
- All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool-compaction | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 439502 | 653881 | 661684 | 949861 | 287251 | 326870 | 387124 | 455173 | 17.38 | 19.64 | 21.89 | 24.72 | 21.89 | - |

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

- `llm.review_spend_decisions` (211574ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "compactContext": true, "expenseCount": 1000, "variant": "tool-compaction" }
  - output: { "caseDecisionCount": 9, "decisionCount": 10, "decisions": [ { "evidence": [ { "reference": "exp_0231", "summary": "Anthropic stored-value/cash-equivalent load $241.28 + fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash stored-value load $241.28 + fee", "type": "receipt" }, { "reference": "...
- `tool.get_expenses` (4ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 100 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0959", "exp_0497", "exp_0266", "exp_0035", "exp_0805", "exp_0574", "exp_0343", "exp_0112", "exp_0504", "exp_0273", "exp_0812", "exp_0581", "exp_0350", "exp_0119", "exp_0889", "exp_0658", "exp_0427", "exp_0196", "exp_0966", "exp_0735", "exp_0896", "exp_0665", "exp_0434"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 200 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0377", "exp_0146", "exp_0916", "exp_0685", "exp_0454", "exp_0223", "exp_0384", "exp_0153", "exp_0923", "exp_0692", "exp_0461", "exp_0230", "exp_1000", "exp_0769", "exp_0042", "exp_0538", "exp_0307", "exp_0076", "exp_0846", "exp_0615", "exp_0776", "exp_0545", "exp_0314"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 300 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0712", "exp_0481", "exp_0873", "exp_0642", "exp_0411", "exp_0180", "exp_0719", "exp_0488", "exp_0257", "exp_0026", "exp_0796", "exp_0565", "exp_0103", "exp_0264", "exp_0033", "exp_0803", "exp_0572", "exp_0341", "exp_0110", "exp_0880", "exp_0649", "exp_0418", "exp_0187"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 400 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0768", "exp_0537", "exp_0306", "exp_0075", "exp_0467", "exp_0236", "exp_0005", "exp_0775", "exp_0544", "exp_0313", "exp_0082", "exp_0852", "exp_0621", "exp_0390", "exp_0159", "exp_0929", "exp_0698", "exp_0628", "exp_0397", "exp_0166", "exp_0936", "exp_0705", "exp_0474"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 500 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0032", "exp_0802", "exp_0571", "exp_0340", "exp_0109", "exp_0516", "exp_0879", "exp_0648", "exp_0417", "exp_0186", "exp_0347", "exp_0116", "exp_0886", "exp_0655", "exp_0424", "exp_0193", "exp_0963", "exp_0732", "exp_0501", "exp_0270", "exp_0039", "exp_0515", "exp_0809"...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 600 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0143", "exp_0913", "exp_0682", "exp_0451", "exp_0220", "exp_0759", "exp_0528", "exp_0297", "exp_0066", "exp_0227", "exp_0997", "exp_0766", "exp_0535", "exp_0304", "exp_0843", "exp_0612", "exp_0381", "exp_0150", "exp_0920", "exp_0689", "exp_0458", "exp_0850", "exp_0619"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 700 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0269", "exp_0038", "exp_0430", "exp_0969", "exp_0738", "exp_0507", "exp_0276", "exp_0045", "exp_0815", "exp_0584", "exp_0353", "exp_0892", "exp_0661", "exp_0801", "exp_0597", "exp_0990", "exp_0072", "exp_0989", "exp_0464", "exp_0107", "exp_0877", "exp_0646", "exp_0415"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 800 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0842", "exp_0436", "exp_0611", "exp_0380", "exp_0149", "exp_0310", "exp_0079", "exp_0849", "exp_0618", "exp_0387", "exp_0156", "exp_0926", "exp_0695", "exp_0233", "exp_0002", "exp_0772", "exp_0541", "exp_0933", "exp_0702", "exp_0471", "exp_0240", "exp_0009", "exp_0779"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "offset": 900 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0568", "exp_0337", "exp_0106", "exp_0876", "exp_0645", "exp_0414", "exp_0183", "exp_0953", "exp_0722", "exp_0491", "exp_0260", "exp_0029", "exp_0190", "exp_0960", "exp_0729", "exp_0498", "exp_0267", "exp_0036", "exp_0122", "exp_0675", "exp_0806", "exp_0575", "exp_0344"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 17 }
  - input: { "expenseIds": [ "exp_0231", "exp_0273", "exp_0287", "exp_0825", "exp_0616", "exp_0238", "exp_0248", "exp_0270", "exp_0056", "exp_0105", "exp_0272", "exp_0503", "exp_0652", "exp_0205", "exp_0354", "exp_0059", "exp_0981" ] }
  - output: [ { "expenseId": "exp_0231", "receiptPreview": "Anthropic | Location: Sao Paulo, BR | Receipt #: RCPT-95D638 | Date: 2026-04-16 16:50" }, { "expenseId": "exp_0273", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-12E4F3 | Date: 2026-04-16 10:56" }, { "expenseId": "exp_0287", "receiptPrevi...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 10, "decisionCount": 12, "decisions": [ { "evidence": [ { "reference": "exp_0231", "summary": "Anthropic stored-value/cash-equivalent load $241.28 + fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash stored-value load $241.28 + fee", "type": "receipt" }, { "reference": ...
  - output: { "accepted": false, "caseDecisionCount": 10, "decisionCount": 12, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; invalid expense ids: exp_01500_cluster; duplicate expense ids: exp_0273, exp_0193, exp_0829, exp_0652, exp_0270, exp_0122, exp_0201, exp_0359, exp_0912, ex...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 9, "decisionCount": 11, "decisions": [ { "evidence": [ { "reference": "exp_0231", "summary": "Anthropic stored-value/cash-equivalent load $241.28 + fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash stored-value load $241.28 + fee", "type": "receipt" }, { "reference": "...
  - output: { "accepted": false, "caseDecisionCount": 9, "decisionCount": 11, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0323, exp_0801, exp_0913, exp_0217, exp_0773, exp_0911, exp_0983; missing 11 expense ids; first missing ids: exp_0077, exp_0084, ...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 9, "decisionCount": 10, "decisions": [ { "evidence": [ { "reference": "exp_0231", "summary": "Anthropic stored-value/cash-equivalent load $241.28 + fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash stored-value load $241.28 + fee", "type": "receipt" }, { "reference": "...
  - output: { "accepted": false, "caseDecisionCount": 9, "decisionCount": 10, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 5 expense ids; first missing ids: exp_0046, exp_0323, exp_0786, exp_0913, exp_0959; every in-scope expense id must appear in exactly one case or no_...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 51794, "llm.compaction.compacted_tokens_estimate": 21950, "llm.compaction.message_count": 15, "llm.compaction.compacted_message_count": 13 }
  - output: { "compactedMessageCount": 13, "compactedTokenEstimate": 21950, "originalMessageCount": 15, "originalTokenEstimate": 51794 }
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 9, "decisionCount": 10, "decisions": [ { "evidence": [ { "reference": "exp_0231", "summary": "Anthropic stored-value/cash-equivalent load $241.28 + fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash stored-value load $241.28 + fee", "type": "receipt" }, { "reference": "...
  - output: { "accepted": true, "caseDecisionCount": 9, "decisionCount": 10, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 9, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExpen...

