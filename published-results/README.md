# Published Results

This directory contains the compact, shareable result bundle for the company-spend audit benchmark.

The full raw `results/` tree is intentionally not committed because it contains hundreds of historical smoke runs and large JSON/judge-packet files. Re-run the commands in the root README to regenerate raw reports locally.

Included files:

- `spend-audit-matrix-summary.csv`: aggregate metrics for the baseline matrix and the later compaction-only matrix.
- `spend-audit-matrix-summary.json`: the same aggregate metrics plus source/published readout mapping.
- `readouts/*.md`: stable copies of the final per-cell Markdown readouts.

The summary files include `rawReportPath` for local regeneration/auditing, but
the raw JSON reports themselves are not committed.

Matrices represented:

- `baseline`: `tool`, `just-bash`, and `sandbox` over sizes `10`, `100`, and `1000` with Haiku, Sonnet, and Opus.
- `tool-compaction-only`: `tool-compaction` over the same sizes and models.

Notes:

- Quality metrics are diagnostic generated-reference precision/recall/F1, not the LLM-judge score.
- P70/P95 values are computed from successful runs only; completion counts are shown separately.
- Memory is the benchmark's runtime working-set metric in MiB.
