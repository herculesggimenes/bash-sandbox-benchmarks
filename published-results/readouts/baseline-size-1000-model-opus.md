# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 1,000 anonymized company-paid expenses and reimbursements, 70 diagnostic spend-pattern signals, 1,529 policy words.
- All three variants include web_search and submit_review. The native tool baseline exposes them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.
- Sandbox cold-start is 175ms P95 and warm-start is 47ms P95, versus 3ms and 0ms for just-bash.
- Even if sandbox and just-bash landed at the same wall-clock time, most product agents still would not need the extra machine capability enough to justify the added compute boundary.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 11/20 | 11/11 | 0/11 | 0/0 | 11/11 | 0.0 | 0.0 | 0.0 | 0.0 | 833603 | 962892 | 1000210 | 1000210 | 400541 | 418690 | 420769 | 420769 | 178.23 | 204.14 | 270.05 | 270.05 | 270.05 | - |
| just-bash | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 1907215 | 2136308 | 2199268 | 2290396 | 283417 | 315199 | 350087 | 432712 | 172.34 | 204.03 | 240.91 | 269.92 | 240.91 | - |
| sandbox | 20/20 | 20/20 | 0/20 | 0/0 | 20/20 | 0.0 | 0.0 | 0.0 | 0.0 | 1510766 | 1962176 | 2056056 | 2115952 | 270179 | 291033 | 295412 | 318987 | 6.67 | 6.71 | 6.82 | 6.92 | 236.11 | 6.82 |

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

- `llm.review_spend_decisions` (480012ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "expenseCount": 1000, "variant": "tool" }
- `tool.get_expenses` (7ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 250 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0328", "exp_0097", "exp_0867", "exp_0636", "exp_0405", "exp_0174", "exp_0944", "exp_0713", "exp_0482", "exp_0251", "exp_0020", "exp_0951", "exp_0720", "exp_0489", "exp_0258", "exp_0027", "exp_0797", "exp_0566", "exp_0104", "exp_0874", "exp_0643", "exp_0412", "exp_0181"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 500 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0032", "exp_0802", "exp_0571", "exp_0340", "exp_0109", "exp_0516", "exp_0879", "exp_0648", "exp_0417", "exp_0186", "exp_0347", "exp_0116", "exp_0886", "exp_0655", "exp_0424", "exp_0193", "exp_0963", "exp_0732", "exp_0501", "exp_0270", "exp_0039", "exp_0515", "exp_0809"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 250, "offset": 750 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0737", "exp_0506", "exp_0275", "exp_0044", "exp_0814", "exp_0583", "exp_0352", "exp_0744", "exp_0513", "exp_0282", "exp_0051", "exp_0821", "exp_0590", "exp_0128", "exp_0898", "exp_0667", "exp_0975", "exp_0905", "exp_0443", "exp_0212", "exp_0982", "exp_0438", "exp_0991"...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_3bcbb238da" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0027", "exp_0367", "exp_0366", "exp_0932" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_40ab8404f0" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0196", "exp_0195", "exp_0043", "exp_0948" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_4b4d6e7e3b" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0928", "exp_0025", "exp_0193", "exp_0024" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_ec31d3f860" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0986", "exp_0082", "exp_0081", "exp_0246" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseType": "expense", "merchantContains": "Apple Cash", "minAmountUsd": 100 }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0273", "exp_0287", "exp_0825", "exp_0223", "exp_0237", "exp_0321", "exp_0097", "exp_0789", "exp_0235", "exp_0319", "exp_0809", "exp_0277", "exp_0807", "exp_0275", "exp_0443", "exp_0323", "exp_0211" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "me...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseType": "reimbursement", "merchantContains": "Apple Cash" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0238", "exp_0826", "exp_0818", "exp_0258", "exp_0236", "exp_0088", "exp_0220", "exp_0262", "exp_0808", "exp_0982", "exp_0296" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "merchantContains": "Venmo" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0616", "exp_0270", "exp_0962" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (3ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "merchantContains": "Soho House" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0056", "exp_0503", "exp_0950", "exp_0354", "exp_0801", "exp_0205", "exp_0652" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "merchantContains": "Nobu" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0385", "exp_0105", "exp_0272", "exp_0439", "exp_0606", "exp_0773", "exp_0940" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_01099135d4" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0475", "exp_0068", "exp_0960" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_08afa22c84" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0056", "exp_0333", "exp_0954" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_1325b54742" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0912", "exp_0011", "exp_0186" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "limit": 60, "userId": "user_f4c3389a" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0140", "exp_0070", "exp_0301", "exp_0308", "exp_0154", "exp_0315", "exp_0098", "exp_0413", "exp_0966", "exp_0819", "exp_0048", "exp_0300", "exp_0153", "exp_0307", "exp_0804", "exp_0103", "exp_0047", "exp_0586", "exp_0833", "exp_0971", "exp_0832", "exp_0831", "exp_0992"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_15c6dc34a7" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0341", "exp_0901", "exp_0004" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_16597a96a1" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0406", "exp_0021", "exp_0918" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_125128a1d6" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0181", "exp_0899", "exp_0001" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_1626ba67e8" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0046", "exp_0240", "exp_0953" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_23b87c9e10" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0966", "exp_0047", "exp_0199" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 8 }
  - input: { "expenseIds": [ "exp_0616", "exp_0270", "exp_0962", "exp_0238", "exp_0826", "exp_0273", "exp_0097", "exp_0789" ] }
  - output: [ { "expenseId": "exp_0616", "receiptPreview": "Venmo | Location: San Francisco, CA | Receipt #: RCPT-8039C7 | Date: 2026-04-16 16:15" }, { "expenseId": "exp_0270", "receiptPreview": "United Airlines | Location: San Francisco, CA | Receipt #: RCPT-370D67 | Date: 2026-04-14 12:41" }, { "expenseId": "exp_0962", "receipt...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 19, "decisionCount": 41, "decisions": [ { "evidence": [ { "reference": "exp_0616", "summary": "Venmo receipt shows 'Stored-value / cash-equivalent load: $213.40' plus service fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash receipt shows 'Stored-value / cash-equivalen...
  - output: { "accepted": false, "caseDecisionCount": 19, "decisionCount": 41, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0281, exp_0027, exp_0469, exp_0225; missing 33 expense ids; first missing ids: exp_0013, exp_0018, exp_0032, exp_0041, exp_0042,...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 19, "decisionCount": 40, "decisions": [ { "evidence": [ { "reference": "exp_0616", "summary": "Venmo receipt shows 'Stored-value / cash-equivalent load: $213.40' plus service fee", "type": "receipt" }, { "reference": "exp_0273", "summary": "Apple Cash receipt shows 'Stored-value / cash-equivalen...
  - output: { "accepted": false, "caseDecisionCount": 19, "decisionCount": 40, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 5 expense ids; first missing ids: exp_0057, exp_0293, exp_0752, exp_0753, exp_0754; every in-scope expense id must appear in exactly one case or no...

### `just-bash`

- `llm.review_spend_decisions` (286712ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 1000, "variant": "just-bash" }
  - output: { "caseDecisionCount": 9, "decisionCount": 10, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 9, "decisionCount": 10, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
  - output: { "accepted": false, "caseDecisionCount": 9, "decisionCount": 10, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0049, exp_0943, exp_0908, exp_0945, exp_0194, exp_0031, exp_0407, exp_0037, exp_0034, exp_0408, exp_0058, exp_0955, exp_0184, exp...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "just_bash_cli" }
  - input: { "caseDecisionCount": 9, "decisionCount": 10, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0059", "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0231", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0270", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp...
  - output: { "accepted": true, "caseDecisionCount": 9, "decisionCount": 10, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 9, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds":...

### `sandbox`

- `llm.review_spend_decisions` (225471ms)
  - attributes: { "llm.model": "claude-opus-4-5-20251101", "prompt.bytes": 397 }
  - input: { "availableTools": [ "bash" ], "expenseCount": 1000, "variant": "sandbox" }
  - output: { "caseDecisionCount": 10, "decisionCount": 16, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp_0319", "exp_0321", "exp_0323", "ex...
- `sandbox.exec submit_review` (85ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": false, \"caseDecisionCount\": 11, \"decisionCount\": 17, \"loadError\": null, \"message\": \"not accepted; repair the submission and call submit_review again; schema errors: decisions.8.expenseIds: Too small: expected array to have >=1 items\", \"submissionFile\": \"/tmp/submission....
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 11, "decisionCount": 17, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp_0319", "exp_0321", "exp_0323", "ex...
  - output: { "accepted": false, "caseDecisionCount": 11, "decisionCount": 17, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; schema errors: decisions.8.expenseIds: Too small: expected array to have >=1 items", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisio...
- `sandbox.exec submit_review` (85ms)
  - attributes: { "shell.command": "submit_review", "shell.host_mediated": true }
  - input: { "command": "submit_review /tmp/submission.json" }
  - output: { "stdoutPreview": "{ \"accepted\": true, \"caseDecisionCount\": 10, \"decisionCount\": 16, \"loadError\": null, \"message\": \"accepted\", \"submissionFile\": \"/tmp/submission.json\", \"validation\": { \"caseDecisionCount\": 10, \"coveredExpenseCount\": 1000, \"duplicateExpenseIds\": [], \"exactlyOnceCovered\": true...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "sandbox_cli" }
  - input: { "caseDecisionCount": 10, "decisionCount": 16, "decisions": [ { "outcome": "case", "expenseIds": [ "exp_0088", "exp_0097", "exp_0211", "exp_0220", "exp_0223", "exp_0235", "exp_0236", "exp_0237", "exp_0238", "exp_0262", "exp_0273", "exp_0275", "exp_0277", "exp_0287", "exp_0296", "exp_0319", "exp_0321", "exp_0323", "ex...
  - output: { "accepted": true, "caseDecisionCount": 10, "decisionCount": 16, "loadError": null, "message": "accepted", "submissionFile": "/tmp/submission.json", "validation": { "caseDecisionCount": 10, "coveredExpenseCount": 1000, "duplicateExpenseIds": [], "exactlyOnceCovered": true, "fullBatchCovered": true, "invalidExpenseIds...

