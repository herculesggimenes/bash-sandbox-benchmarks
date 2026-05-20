# Native Tool Rerun At 1000 Expenses

This readout publishes the refreshed no-agent-timeout native `tool` and `tool-compaction` cells for the 1000-expense spend-audit benchmark. Raw reports remain under the ignored `results/` tree; this file is the compact shareable aggregate.

Metrics are computed from runtime-completed rows. `Submitted` is shown separately because a run can complete without producing a valid spend-review submission.

| Model  | Runtime           |    OK | Submitted | Tokens P70/P95 | Time P70/P95 | Precision P70/P95 | Recall P70/P95 | F1 P70/P95 |
| ------ | ----------------- | ----: | --------: | -------------: | -----------: | ----------------: | -------------: | ---------: |
| haiku  | `tool`            | 17/20 |     15/20 |   781k / 1.32M |  285s / 348s |         37% / 51% |      53% / 72% |  43% / 56% |
| haiku  | `tool-compaction` | 19/20 |     19/20 |   612k / 1.36M |  285s / 517s |        45% / 100% |      52% / 65% |  46% / 65% |
| sonnet | `tool`            | 15/20 |     14/20 |    723k / 833k |  753s / 875s |         55% / 60% |      78% / 82% |  64% / 66% |
| sonnet | `tool-compaction` | 20/20 |     20/20 |    656k / 856k | 785s / 1059s |         56% / 61% |      80% / 83% |  61% / 66% |
| opus   | `tool`            | 20/20 |     20/20 |    625k / 788k |  415s / 575s |         53% / 59% |      65% / 70% |  57% / 62% |
| opus   | `tool-compaction` | 20/20 |     20/20 |    376k / 503k |  408s / 612s |         58% / 60% |      67% / 78% |  60% / 63% |

## Error Summary

- haiku `tool`: 3 runtime_error.
- haiku `tool-compaction`: 1 provider_connectivity.
- sonnet `tool`: 5 runtime_error.
- sonnet `tool-compaction`: no runtime errors.
- opus `tool`: no runtime errors.
- opus `tool-compaction`: no runtime errors.

## Source Reports

- haiku `tool`: `results/spend-audit-native-tool-haiku-1000-r20-b10-2026-05-18/company-spend-audit-benchmark-2026-05-19T01-03-03-896Z-60633-8a4789df.json`
- haiku `tool-compaction`: `results/spend-audit-native-tool-haiku-1000-r20-b10-2026-05-18/company-spend-audit-benchmark-2026-05-19T01-03-03-896Z-60633-8a4789df.json`
- sonnet `tool`: `results/spend-audit-native-tool-sonnet-1000-r20-sharded-p5-2026-05-18/run-*/company-spend-audit-benchmark-*.json`
- sonnet `tool-compaction`: `results/spend-audit-native-tool-sonnet-1000-r20-sharded-p5-2026-05-18/run-*/company-spend-audit-benchmark-*.json`
- opus `tool`: `results/spend-audit-native-tool-opus-1000-r20-b10-2026-05-18/company-spend-audit-benchmark-2026-05-18T23-46-54-986Z-18443-3bf43547.json`
- opus `tool-compaction`: `results/spend-audit-native-tool-opus-1000-r20-b10-2026-05-18/company-spend-audit-benchmark-2026-05-18T23-46-54-986Z-18443-3bf43547.json`
