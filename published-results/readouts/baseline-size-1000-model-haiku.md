# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 1,000 anonymized company-paid expenses and reimbursements, 70 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 232ms P95 and warm-start is 57ms P95, versus 2ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 16/20 | 14/16 | 0/16 | 0/0 | 14/16 | 0.0 | 0.0 | 0.0 | 0.0 | 623729 | 1063920 | 5647292 | 5647292 | 243744 | 320730 | 450291 | 450291 | 211.06 | 247.86 | 315.95 | 315.95 | 315.95 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 785198 | 1054192 | 1059289 | 1300758 | 150442 | 171336 | 176034 | 183616 | 211.03 | 245.75 | 247.89 | 315.08 | 247.89 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 616172 | 1051785 | 1070754 | 1280925 | 139162 | 166187 | 181875 | 225617 | 6.67 | 6.71 | 6.73 | 6.82 | 247.34 | 6.73 |

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

- `llm.review_spend_decisions` (320727ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 1000, "variant": "tool" }
  - output: { "caseDecisionCount": 15, "decisionCount": 16, "decisions": [ { "evidence": [ { "reference": "exp_0059", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" }, { "reference": "exp_0981", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" } ], "expenseIds": [ "exp_0059", "exp_0981" ], "outcome": "case", "...
- `tool.get_expenses` (12ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 250 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0328", "exp_0097", "exp_0867", "exp_0636", "exp_0405", "exp_0174", "exp_0944", "exp_0713", "exp_0482", "exp_0251", "exp_0020", "exp_0951", "exp_0720", "exp_0489", "exp_0258", "exp_0027", "exp_0797", "exp_0566", "exp_0104", "exp_0874", "exp_0643", "exp_0412", "exp_0181"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 500 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0032", "exp_0802", "exp_0571", "exp_0340", "exp_0109", "exp_0516", "exp_0879", "exp_0648", "exp_0417", "exp_0186", "exp_0347", "exp_0116", "exp_0886", "exp_0655", "exp_0424", "exp_0193", "exp_0963", "exp_0732", "exp_0501", "exp_0270", "exp_0039", "exp_0515", "exp_0809"...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 750 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0737", "exp_0506", "exp_0275", "exp_0044", "exp_0814", "exp_0583", "exp_0352", "exp_0744", "exp_0513", "exp_0282", "exp_0051", "exp_0821", "exp_0590", "exp_0128", "exp_0898", "exp_0667", "exp_0975", "exp_0905", "exp_0443", "exp_0212", "exp_0982", "exp_0438", "exp_0991"...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 33 }
  - input: { "expenseIds": [ "exp_0231", "exp_0273", "exp_0287", "exp_0223", "exp_0237", "exp_0238", "exp_0245", "exp_0262", "exp_0270", "exp_0275", "exp_0277", "exp_0286", "exp_0319", "exp_0321", "exp_0323", "exp_0097", "exp_0220", "exp_0235", "exp_0236", "exp_0211", "exp_0274", "exp_0276", "exp_0288", "exp_0296", "exp_0809", "...
  - output: [ { "expenseId": "exp_0231", "receiptPreview": "Anthropic | Location: Sao Paulo, BR | Receipt #: RCPT-95D638 | Date: 2026-04-16 16:50" }, { "expenseId": "exp_0273", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-12E4F3 | Date: 2026-04-16 10:56" }, { "expenseId": "exp_0287", "receiptPrevi...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 17 }
  - input: { "expenseIds": [ "exp_0043", "exp_0042", "exp_0041", "exp_0196", "exp_0195", "exp_0358", "exp_0357", "exp_0359", "exp_0912", "exp_0911", "exp_0910", "exp_0280", "exp_0833", "exp_0832", "exp_0831", "exp_0278", "exp_0279" ] }
  - output: [ { "expenseId": "exp_0043", "receiptPreview": "The Smith | Location: New York, NY | Receipt #: RCPT-45DC63 | Date: 2026-04-15 14:32" }, { "expenseId": "exp_0042", "receiptPreview": "The Smith | Location: New York, NY | Receipt #: RCPT-EC1C1E | Date: 2026-04-15 13:21" }, { "expenseId": "exp_0041", "receiptPreview": "T...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 14 }
  - input: { "expenseIds": [ "exp_0056", "exp_0105", "exp_0272", "exp_0439", "exp_0503", "exp_0606", "exp_0652", "exp_0773", "exp_0801", "exp_0940", "exp_0950", "exp_0354", "exp_0205", "exp_0385" ] }
  - output: [ { "expenseId": "exp_0056", "receiptPreview": "Receipt unavailable | Expense id: exp_0056 | Merchant claimed by submitter: Soho House | Amount: $1485.00" }, { "expenseId": "exp_0105", "receiptPreview": "Nobu Downtown | Location: New York, NY | Receipt #: RCPT-2EB4D2 | Date: 2026-04-16 12:32" }, { "expenseId": "exp_02...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 17 }
  - input: { "expenseIds": [ "exp_0076", "exp_0075", "exp_0411", "exp_0450", "exp_0457", "exp_0957", "exp_0975", "exp_0224", "exp_0103", "exp_0140", "exp_0151", "exp_0152", "exp_0153", "exp_0154", "exp_0156", "exp_0157", "exp_0159" ] }
  - output: [ { "expenseId": "exp_0076", "receiptPreview": "Anthropic | Location: Bogota, CO | Receipt #: RCPT-7A89F9 | Date: 2026-04-15 13:15" }, { "expenseId": "exp_0075", "receiptPreview": "Anthropic | Location: London, UK | Receipt #: RCPT-557FB9 | Date: 2026-04-14 10:02" }, { "expenseId": "exp_0411", "receiptPreview": "Anthr...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 14, "decisionCount": 15, "decisions": [ { "evidence": [ { "reference": "exp_0059", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" }, { "reference": "exp_0981", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" } ], "expenseIds": [ "exp_0059", "exp_0981" ], "outcome": "case", "...
  - output: { "accepted": false, "caseDecisionCount": 14, "decisionCount": 15, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0220, exp_0236, exp_0211, exp_0773, exp_0789, exp_0981; missing 4 expense ids; first missing ids: exp_0245, exp_0276, exp_0359, ...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 14, "decisionCount": 16, "decisions": [ { "evidence": [ { "reference": "exp_0059", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" }, { "reference": "exp_0981", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" } ], "expenseIds": [ "exp_0059", "exp_0981" ], "outcome": "case", "...
  - output: { "accepted": false, "caseDecisionCount": 14, "decisionCount": 16, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 3 expense ids; first missing ids: exp_0831, exp_0832, exp_0833; every in-scope expense id must appear in exactly one case or no_case decision", "su...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 14, "decisionCount": 15, "decisions": [ { "evidence": [ { "reference": "exp_0059", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" }, { "reference": "exp_0981", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" } ], "expenseIds": [ "exp_0059", "exp_0981" ], "outcome": "case", "...
  - output: { "accepted": false, "caseDecisionCount": 14, "decisionCount": 15, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0957, exp_0975; every in-scope expense id must appear in exactly one case or no_case decision", "submissionFile": null, "validat...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 15, "decisionCount": 16, "decisions": [ { "evidence": [ { "reference": "exp_0059", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" }, { "reference": "exp_0981", "summary": "Delta $679.89 RCPT-320AE1", "type": "expense" } ], "expenseIds": [ "exp_0059", "exp_0981" ], "outcome": "case", "...
  - output: { "accepted": true, "caseDecisionCount": 15, "decisionCount": 16, "loadError": null, "message": "accepted", "submissionFile": null, "validation": { "caseDecisionCount": 15, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": [], "missingExp...

### `just-bash`

- `llm.review_spend_decisions` (140090ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 1000, "variant": "just-bash" }
  - output: { "caseDecisionCount": 15, "decisionCount": 21, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0097", "exp_0211", "exp_0223", "exp_0231", "exp_0235", "exp_0237", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0319", "exp_0321", "exp_0323", "exp_0443", "exp_0789", "exp_0809", "exp_0825", "ex...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 15, "decisionCount": 21, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0097", "exp_0211", "exp_0223", "exp_0231", "exp_0235", "exp_0237", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0319", "exp_0321", "exp_0323", "exp_0443", "exp_0789", "exp_0809", "exp_0825", "ex...
  - output: { "accepted": true, "caseDecisionCount": 15, "decisionCount": 21, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 15, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds...

### `sandbox`

- `llm.review_spend_decisions` (55377ms)
  - attributes: { "llm.model": "claude-haiku-4-5-20251001", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 1000, "variant": "sandbox" }
  - output: { "caseDecisionCount": 7, "decisionCount": 8, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp_...
- `sandbox.exec submit_review` (68ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 7, \"decisionCount\": 8, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 7, \"coveredExpenseCount\": 1000, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true, \...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 7, "decisionCount": 8, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp_...
  - output: { "accepted": true, "caseDecisionCount": 7, "decisionCount": 8, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 7, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds": ...

