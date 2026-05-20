# Published Results

This directory contains the compact, shareable result bundle for the company-spend audit benchmark.

The full raw `results/` tree is intentionally not committed because it contains hundreds of historical smoke runs and large JSON/judge-packet files. Re-run the commands in the root README to regenerate raw reports locally.

Included files:

- `spend-audit-matrix-summary.csv`: aggregate metrics for the baseline matrix and the later compaction-only matrix.
- `spend-audit-matrix-summary.json`: the same aggregate metrics plus source/published readout mapping.
- `spend-audit-native-tool-rerun-1000-summary.csv`: refreshed `1000`-expense native `tool` and `tool-compaction` aggregate metrics after removing the agent-level timeout.
- `spend-audit-native-tool-rerun-1000-summary.json`: the same refreshed native-tool aggregate plus source report mapping and error summaries.
- `readouts/*.md`: stable copies of the final per-cell Markdown readouts.

The summary files include `rawReportPath` for local regeneration/auditing, but
the raw JSON reports themselves are not committed.

Matrices represented:

- `baseline`: `tool`, `just-bash`, and `sandbox` over sizes `10`, `100`, and `1000` with Haiku, Sonnet, and Opus.
- `tool-compaction-only`: `tool-compaction` over the same sizes and models.
- `native-tool-rerun-1000`: refreshed native `tool` and `tool-compaction` `1000`-expense rows for Haiku, Sonnet, and Opus.

Notes:

- Quality metrics are diagnostic generated-reference precision/recall/F1, not the LLM-judge score.
- P70/P95 values are computed from successful runs only; completion counts are shown separately.
- Memory is a diagnostic runtime working-set metric in MiB. For sandbox rows,
  it combines host RSS delta with Docker container peak memory.
