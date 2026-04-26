# Company Spend Audit Benchmark Readout

- Company Spend Audit Benchmark Readout
- Fixture: 1,000 anonymized company-paid expenses and reimbursements, 70 diagnostic spend-pattern signals, 1,529 policy words.
- All variants include web_search and submit_review. Native tool variants expose them as top-level tools, while just-bash and sandbox expose them as CLIs behind the single bash surface.

## Runtime Summary

| Variant | Runtime OK | Quality Pass | Judged | Judge Pass | Submitted | Judge P70 | Judge P90 | Judge P95 | Judge P99 | Token P70 | Token P90 | Token P95 | Token P99 | Total P70 (ms) | Total P90 (ms) | Total P95 (ms) | Total P99 (ms) | Working Set P70 | Working Set P90 | Working Set P95 | Working Set P99 | Host RSS P95 | Container Peak P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool-compaction | 3/20 | 3/3 | 0/3 | 0/0 | 3/3 | 0.0 | 0.0 | 0.0 | 0.0 | 503534 | 503534 | 503534 | 503534 | 477054 | 477054 | 477054 | 477054 | 16.75 | 16.75 | 16.75 | 16.75 | 16.75 | - |

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

- `llm.review_spend_decisions` (480006ms)
  - attributes: { "llm.model": "claude-sonnet-4-5-20250929", "prompt.bytes": 428 }
  - input: { "availableTools": [ "get_policy", "get_expenses", "get_users", "get_cases", "analyze_calendar_events", "analyze_receipt", "web_search" ], "compactContext": true, "expenseCount": 1000, "variant": "tool-compaction" }
- `tool.get_expenses` (8ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 500, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 500, "offset": 500 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0032", "exp_0802", "exp_0571", "exp_0340", "exp_0109", "exp_0516", "exp_0879", "exp_0648", "exp_0417", "exp_0186", "exp_0347", "exp_0116", "exp_0886", "exp_0655", "exp_0424", "exp_0193", "exp_0963", "exp_0732", "exp_0501", "exp_0270", "exp_0039", "exp_0515", "exp_0809"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseType": "expense", "limit": 50, "merchantContains": "Apple Cash", "minAmountUsd": 0 }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0273", "exp_0287", "exp_0825", "exp_0223", "exp_0237", "exp_0321", "exp_0097", "exp_0789", "exp_0235", "exp_0319", "exp_0809", "exp_0277", "exp_0807", "exp_0275", "exp_0443", "exp_0323", "exp_0211" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "me...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseType": "reimbursement", "limit": 50, "merchantContains": "Apple Cash", "minAmountUsd": 0 }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0238", "exp_0826", "exp_0818", "exp_0258", "exp_0236", "exp_0088", "exp_0220", "exp_0262", "exp_0808", "exp_0982", "exp_0296" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "limit": 50, "merchantContains": "Venmo", "minAmountUsd": 0 }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0616", "exp_0270", "exp_0962" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 50, "matched...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseIds": [ "exp_0059", "exp_0981" ] }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0059", "exp_0981" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matchedCount": 2, "...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 8 }
  - input: { "expenseIds": [ "exp_0273", "exp_0287", "exp_0097", "exp_0789", "exp_0616", "exp_0270", "exp_0059", "exp_0981" ] }
  - output: [ { "expenseId": "exp_0273", "receiptPreview": "Apple Cash | Location: San Francisco, CA | Receipt #: RCPT-12E4F3 | Date: 2026-04-16 10:56" }, { "expenseId": "exp_0287", "receiptPreview": "Apple Cash | Location: Sao Paulo, BR | Receipt #: RCPT-D3F977 | Date: 2026-04-16 08:58" }, { "expenseId": "exp_0097", "receiptPrev...
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 5, "decisionCount": 5, "decisions": [ { "evidence": [ { "reference": "exp_0273", "summary": "Receipt shows 'Stored-value / cash-equivalent load: $241.28' plus service fee", "type": "receipt" }, { "reference": "exp_0287", "summary": "Receipt shows 'Stored-value / cash-equivalent load: $254.91' pl...
  - output: { "accepted": false, "caseDecisionCount": 5, "decisionCount": 5, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; missing 966 expense ids; first missing ids: exp_0001, exp_0002, exp_0003, exp_0004, exp_0005, exp_0006, exp_0007, exp_0008, exp_0009, exp_0010, exp_0011, exp...
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 1 }
  - input: { "expenseIds": [ "exp_0231" ] }
  - output: [ { "expenseId": "exp_0231", "receiptPreview": "Anthropic | Location: Sao Paulo, BR | Receipt #: RCPT-95D638 | Date: 2026-04-16 16:50" } ]
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_3bcbb238da" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0027", "exp_0367", "exp_0366", "exp_0932" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_40ab8404f0" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0196", "exp_0195", "exp_0043", "exp_0948" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_4b4d6e7e3b" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0928", "exp_0025", "exp_0193", "exp_0024" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_ec31d3f860" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0986", "exp_0082", "exp_0081", "exp_0246" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `tool.analyze_receipt` (1ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 8 }
  - input: { "expenseIds": [ "exp_0027", "exp_0367", "exp_0366", "exp_0932", "exp_0196", "exp_0195", "exp_0043", "exp_0948" ] }
  - output: [ { "expenseId": "exp_0027", "receiptPreview": "Staples | Location: London, UK | Receipt #: RCPT-BAC5E8 | Date: 2026-04-15 09:38" }, { "expenseId": "exp_0367", "receiptPreview": "Staples | Location: London, UK | Receipt #: RCPT-BAC5E8 | Date: 2026-04-15 09:38" }, { "expenseId": "exp_0366", "receiptPreview": "Staples |...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "merchantContains": "Soho House" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0056", "exp_0503", "exp_0950", "exp_0354", "exp_0801", "exp_0205", "exp_0652" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "merchantContains": "Nobu Downtown" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0385", "exp_0105", "exp_0272", "exp_0439", "exp_0606", "exp_0773", "exp_0940" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 43436, "llm.compaction.compacted_tokens_estimate": 11793, "llm.compaction.message_count": 15, "llm.compaction.compacted_message_count": 13 }
  - output: { "compactedMessageCount": 13, "compactedTokenEstimate": 11793, "originalMessageCount": 15, "originalTokenEstimate": 43436 }
- `tool.get_expenses` (10ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 200 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 100, "minAmountUsd": 500 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0217", "exp_0525", "exp_0140", "exp_0609", "exp_0686", "exp_0224", "exp_0301", "exp_0308", "exp_0084", "exp_0161", "exp_0007", "exp_0553", "exp_0490", "exp_0336", "exp_0105", "exp_0182", "exp_0952", "exp_0959", "exp_0805", "exp_0119", "exp_0966", "exp_0126", "exp_0133"...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 52517, "llm.compaction.compacted_tokens_estimate": 19626, "llm.compaction.message_count": 17, "llm.compaction.compacted_message_count": 14 }
  - output: { "compactedMessageCount": 14, "compactedTokenEstimate": 19626, "originalMessageCount": 17, "originalTokenEstimate": 52517 }
- `tool.get_expenses` (4ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 200, "offset": 200 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0377", "exp_0146", "exp_0916", "exp_0685", "exp_0454", "exp_0223", "exp_0384", "exp_0153", "exp_0923", "exp_0692", "exp_0461", "exp_0230", "exp_1000", "exp_0769", "exp_0042", "exp_0538", "exp_0307", "exp_0076", "exp_0846", "exp_0615", "exp_0776", "exp_0545", "exp_0314"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 200, "offset": 400 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0768", "exp_0537", "exp_0306", "exp_0075", "exp_0467", "exp_0236", "exp_0005", "exp_0775", "exp_0544", "exp_0313", "exp_0082", "exp_0852", "exp_0621", "exp_0390", "exp_0159", "exp_0929", "exp_0698", "exp_0628", "exp_0397", "exp_0166", "exp_0936", "exp_0705", "exp_0474"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 200, "offset": 600 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0143", "exp_0913", "exp_0682", "exp_0451", "exp_0220", "exp_0759", "exp_0528", "exp_0297", "exp_0066", "exp_0227", "exp_0997", "exp_0766", "exp_0535", "exp_0304", "exp_0843", "exp_0612", "exp_0381", "exp_0150", "exp_0920", "exp_0689", "exp_0458", "exp_0850", "exp_0619"...
- `tool.get_expenses` (1ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 200, "offset": 800 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0842", "exp_0436", "exp_0611", "exp_0380", "exp_0149", "exp_0310", "exp_0079", "exp_0849", "exp_0618", "exp_0387", "exp_0156", "exp_0926", "exp_0695", "exp_0233", "exp_0002", "exp_0772", "exp_0541", "exp_0933", "exp_0702", "exp_0471", "exp_0240", "exp_0009", "exp_0779"...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 73939, "llm.compaction.compacted_tokens_estimate": 38674, "llm.compaction.message_count": 19, "llm.compaction.compacted_message_count": 14 }
  - output: { "compactedMessageCount": 14, "compactedTokenEstimate": 38674, "originalMessageCount": 19, "originalTokenEstimate": 73939 }
- `tool.get_expenses` (6ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_01099135d4" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0475", "exp_0068", "exp_0960" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (6ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_72d8d6ca24" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0062", "exp_0508", "exp_0946" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": 25, "matched...
- `tool.get_expenses` (4ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 78168, "llm.compaction.compacted_tokens_estimate": 39942, "llm.compaction.message_count": 21, "llm.compaction.compacted_message_count": 15 }
  - output: { "compactedMessageCount": 15, "compactedTokenEstimate": 39942, "originalMessageCount": 21, "originalTokenEstimate": 78168 }
- `tool.get_expenses` (9ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseType": "expense" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0217", "exp_0987", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0455", "exp_0224", "exp_0763", "exp_0532", "exp_0301", "exp_0924"...
- `tool.get_expenses` (2ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "expenseType": "reimbursement", "limit": 50 }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0448", "exp_0756", "exp_0686", "exp_0994", "exp_0616", "exp_0385", "exp_0931", "exp_0238", "exp_0546", "exp_0476", "exp_0553", "exp_0359", "exp_0912", "exp_0091", "exp_0861", "exp_0637", "exp_0406", "exp_0358", "exp_0911", "exp_0021", "exp_0791", "exp_0490", "exp_0259"...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 86714, "llm.compaction.compacted_tokens_estimate": 45766, "llm.compaction.message_count": 23, "llm.compaction.compacted_message_count": 16 }
  - output: { "compactedMessageCount": 16, "compactedTokenEstimate": 45766, "originalMessageCount": 23, "originalTokenEstimate": 86714 }
- `tool.analyze_receipt` (0ms)
  - attributes: { "tool.name": "analyze_receipt", "tool.expense_count": 9 }
  - input: { "expenseIds": [ "exp_0059", "exp_0981", "exp_0056", "exp_0503", "exp_0950", "exp_0801", "exp_0652", "exp_0354", "exp_0205" ] }
  - output: [ { "expenseId": "exp_0059", "receiptPreview": "Delta Air Lines | Location: London, UK | Receipt #: RCPT-320AE1 | Date: 2026-04-12 17:34" }, { "expenseId": "exp_0981", "receiptPreview": "Delta Air Lines | Location: London, UK | Receipt #: RCPT-320AE1 | Date: 2026-04-12 17:34" }, { "expenseId": "exp_0056", "receiptPrev...
- `tool.get_expenses` (0ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "detailed", "receiptFingerprint": "receipt_40ab8404f0" }
  - output: { "detailLevel": "detailed", "expenseIds": [ "exp_0196", "exp_0195", "exp_0043", "exp_0948" ], "fields": [ "expenseId", "expenseType", "amountUsd", "category", "merchant", "merchantType", "userId", "paymentChannel", "receiptFingerprint", "receiptStatus", "purchasedAt", "cityCode", "memo" ], "hasMore": false, "limit": ...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 88349, "llm.compaction.compacted_tokens_estimate": 38396, "llm.compaction.message_count": 25, "llm.compaction.compacted_message_count": 17 }
  - output: { "compactedMessageCount": 17, "compactedTokenEstimate": 38396, "originalMessageCount": 25, "originalTokenEstimate": 88349 }
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 21, "decisionCount": 22, "decisions": [ { "evidence": [ { "reference": "exp_0059, exp_0981", "summary": "Delta Air Lines flight receipt RCPT-320AE1 shows $598.30 flight fare + $81.59 bag/seat selection = $679.89. Both expenses reference same receipt with memo 'team incidentals handled through De...
  - output: { "accepted": false, "caseDecisionCount": 21, "decisionCount": 22, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0191, exp_0231, exp_0441, exp_0525, exp_0294, exp_0063, exp_0602, exp_0371, exp_0140, exp_0070, exp_0840, exp_0609, exp_0378, ex...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 97300, "llm.compaction.compacted_tokens_estimate": 25994, "llm.compaction.message_count": 27, "llm.compaction.compacted_message_count": 18 }
  - output: { "compactedMessageCount": 18, "compactedTokenEstimate": 25994, "originalMessageCount": 27, "originalTokenEstimate": 97300 }
- `tool.get_expenses` (10ms)
  - attributes: { "tool.name": "get_expenses" }
  - input: { "detailLevel": "overview", "limit": 1000, "offset": 0 }
  - output: { "detailLevel": "overview", "expenseIds": [ "exp_0728", "exp_0203", "exp_0679", "exp_0448", "exp_0217", "exp_0987", "exp_0756", "exp_0525", "exp_0294", "exp_0063", "exp_0602", "exp_0371", "exp_0140", "exp_0070", "exp_0840", "exp_0609", "exp_0378", "exp_0147", "exp_0917", "exp_0686", "exp_0455", "exp_0224", "exp_0994"...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 123750, "llm.compaction.compacted_tokens_estimate": 48287, "llm.compaction.message_count": 29, "llm.compaction.compacted_message_count": 19 }
  - output: { "compactedMessageCount": 19, "compactedTokenEstimate": 48287, "originalMessageCount": 29, "originalTokenEstimate": 123750 }
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 141154, "llm.compaction.compacted_tokens_estimate": 57192, "llm.compaction.message_count": 31, "llm.compaction.compacted_message_count": 20 }
  - output: { "compactedMessageCount": 20, "compactedTokenEstimate": 57192, "originalMessageCount": 31, "originalTokenEstimate": 141154 }
- `tool.submit_review` (0ms)
  - attributes: { "tool.name": "submit_review", "tool.submission_mode": "tool_direct" }
  - input: { "caseDecisionCount": 18, "decisionCount": 19, "decisions": [ { "evidence": [ { "reference": "exp_0059, exp_0981", "summary": "Delta Air Lines receipt shows flight fare + baggage", "type": "receipt" }, { "reference": "cash_equivalent_prohibition", "summary": "Cash-equivalent expenses prohibited", "type": "policy" } ]...
  - output: { "accepted": false, "caseDecisionCount": 18, "decisionCount": 19, "loadError": null, "message": "not accepted; repair the submission and call submit_review again; duplicate expense ids: exp_0350, exp_0068, exp_0475, exp_0960; missing 4 expense ids; first missing ids: exp_0185, exp_0448, exp_0756, exp_0923; every in-s...
- `llm.context_compaction` (0ms)
  - attributes: { "llm.compaction.original_tokens_estimate": 147095, "llm.compaction.compacted_tokens_estimate": 61674, "llm.compaction.message_count": 33, "llm.compaction.compacted_message_count": 21 }
  - output: { "compactedMessageCount": 21, "compactedTokenEstimate": 61674, "originalMessageCount": 33, "originalTokenEstimate": 147095 }

