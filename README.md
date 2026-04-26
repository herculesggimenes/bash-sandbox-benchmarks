# Bash Tool And Sandbox Benchmarks

Benchmarks for the article:

> You don't need tools or sandboxes. All you need is bash, and I can prove it.

The goal is to compare agent runtime and interface shapes. The methodology is
split into two experiment families:

- interface experiment: realistic native product tools versus one composable
  bash surface
- runtime-substrate experiment: `just-bash` versus Docker/Moby behind the same
  model-facing bash surface

- `tool`: the native-tool agent shape, with optional `web_search` capability that mirrors the Brex audit harness and uses Gemini web tools through Vertex.
- `just-bash`: one bash interface, a virtual filesystem, and custom CLIs, including an optional `web_search` CLI wired to the same web backend.
- Docker/Moby: real Linux containers with real `bash`, `jq`, `rg`, `find`, `grep`, and `wc`.

This repo is intentionally small so other people can rerun the numbers.
All `just-bash` benchmarks in this repo use `Bash` on `InMemoryFs` only. They
do not mount or write the local host filesystem.

For the experimental design, controls, metrics, and invalidation rules, see
[docs/methodology.md](docs/methodology.md).

Published aggregate results and final readouts are in
[published-results/](published-results/). The full raw `results/` tree is
ignored because it is large and mostly historical smoke data; rerun the commands
below to regenerate raw reports locally.

## Setup

```bash
pnpm install
```

Docker benchmarks require Docker Engine or Docker Desktop. This repo uses Docker/Moby as the first open-source real-sandbox comparator because it is widely available and easy to verify locally.

## Quick Smoke Test

```bash
pnpm benchmark:smoke
```

## Company Spend Audit Benchmark

This benchmark uses the audit-agent company-spend review shape from
`/Users/hgimenes/src/brex/domains/audit-agents-new`, but keeps this repo
self-contained and shareable. It derives an anonymized weekly expense fixture
from `/Users/hgimenes/Documents/Notes/Automations/audit-case-analysis`, expands
it to a larger weekly workload, and runs the same reviewer through:

- `tool`: native `get_expenses`, `get_policy`, `get_users`, `get_cases`, `analyze_calendar_events`, `analyze_receipt`, `web_search`, and `submit_review` calls. `get_expenses` has two levels of detail: `overview` for compact full-batch scanning and `detailed` for selected records with all fields. The web tool uses the same harness shape as `audit-agents-new`: Gemini via Vertex, `enterprise_web_search`, and `url_context`.
- `tool-compaction`: the same native-tool interface, plus an AI SDK `prepareStep`
  compaction pass that prunes older messages and inserts a deterministic
  checkpoint summary when the conversation grows large. This tests whether
  compaction rescues the native-tool operating model without adding a
  workspace.
- `just-bash`: `Bash` on `InMemoryFs` only, with `get_expenses` as a CLI, policy
  as a file, `analyze_receipt` as a CLI, optional `web_search` as a CLI wired to the
  same Gemini web-search backend, `submit_review` as a CLI that validates and
  returns repair feedback, and opt-in `python3` running inside the `just-bash`
  runtime. `/tmp` is also an in-memory path. No local filesystem mount or
  host-shell control.
- `sandbox`: the same CLI/file workflow inside Docker/Moby, with optional
  `web_search` and required `submit_review` exposed as standalone CLIs that the
  benchmark harness wires to host-side services while keeping the container
  network disabled.

The model-facing prompt and `bash` tool description are intentionally the same
for `just-bash` and `sandbox`. Runtime implementation details such as
`InMemoryFs`, Docker, container networking, and host mediation are recorded as
benchmark metadata, not shown to the agent as task instructions. The shared
prompt tells both shell variants to run `web_search` and `submit_review` as
standalone bash commands so the same command shape is evaluated.

The native `tool` variant is intentionally a realistic product-tool API
baseline, not a generic code-execution baseline. It gets typed audit tools but
not `python3`, `jq`, or arbitrary shell pipelines; the shell variants get those
through the single bash surface. Evidence-call batch size is left uncapped so
the LLM can choose the strategy; the benchmark records the resulting quality,
token, time, and memory tradeoff. Shell stdout is also not truncated by the
harness, so dumping large files is measured as part of the strategy.

Default dataset shape:

- configurable batch sizes; the live matrix uses `10`, `100`, and `1000`
  expenses and reimbursements
- real merchants such as United Airlines, The Smith, Marriott Marquis, Uber, GitHub, OpenAI, and Staples
- text-only receipts so receipt analysis stays simple and reproducible
- a company-spend policy over `1000` words
- a mix of company-paid expenses and reimbursement requests
- production-derived spend patterns: meals/entertainment, software/procurement, travel/lodging, rideshare, duplicate/shared receipts, memo/justification, receipt/documentation, and cash-equivalent spend

Task shape:

- let the model read the weekly expense and reimbursement set and the policy through the available tools
- require the agent to fetch or read the full selected expense batch through its own runtime surface before submitting decisions
- require the agent to perform its own triage; no variant receives a prebuilt `triage_expenses` tool or shortlist script
- let the model decide when to pull receipt text through `analyze_receipt`
- make `web_search` available in every variant when public context materially helps the audit decision
- compare how that same review task behaves across native tools, native tools with compaction, one bash surface, and Docker
- submit audit decisions through `submit_review`: a top-level tool for `tool` and `tool-compaction`, and a CLI inside the bash surface for `just-bash` and `sandbox`
- include `case` and `no_case` decisions plus a `companySpendSummary`
- judge quality with a fixed rubric instead of treating deterministic labels as the headline metric

Smoke test without spending LLM tokens:

```bash
pnpm benchmark:spend-audit -- --runs 1 --variants tool,tool-compaction,just-bash,sandbox \
  --max-expenses 1000 --mock-llm --export-judge-packets
```

Live LLM Gateway run:

```bash
cp .env.example .env.local
# fill in LLM_API_KEY and LLM_BASE_URL
pnpm benchmark:spend-audit -- --runs 1 --max-expenses 1000 \
  --env-file ./.env.local \
  --model haiku
```

Live matrix run:

```bash
pnpm benchmark:spend-audit:matrix -- \
  --sizes 10,100,1000 \
  --models haiku,sonnet,opus \
  --runs 20 \
  --batch-size 4 \
  --schedule round-robin \
  --env-file ./.env.local \
  --require-llm \
  --export-judge-packets \
  --output-dir results/spend-audit-matrix-live-r20
```

Use `--schedule round-robin` for quality, token, and latency comparisons. Use
`--schedule grouped` with homogeneous batches for memory claims based on
`batchMetrics.totalPeakWorkingSetPerRunBytes`.

Judge-packet workflow:

```bash
pnpm benchmark:spend-audit -- --runs 1 --variants tool,tool-compaction,just-bash,sandbox \
  --max-expenses 1000 --export-judge-packets
```

The run writes a `.judge-packets.jsonl` file beside the raw report. Each line is
one independent judge packet with the dataset manifest, policy, compact
expenses, receipt/context evidence, submitted output, trace summary, and rubric.
It does not include hidden expected cases or generated scenario labels.

Codex 5.5 can judge those packets outside the repo dependency graph. The
expected judge result is JSONL, one line per packet:

```json
{
  "runId": "...",
  "variant": "tool",
  "run": 0,
  "dimensions": {
    "coverage": 18,
    "caseWorthiness": 17,
    "evidenceGrounding": 18,
    "policyApplication": 13,
    "groupingSpendReasoning": 8,
    "actionability": 8,
    "conciseness": 5
  },
  "totalScore": 87,
  "pass": true,
  "criticalFailures": [],
  "strengths": [],
  "weaknesses": [],
  "missedOpportunities": []
}
```

Then attach the results without rerunning agents:

```bash
pnpm analyze:spend-audit -- ./results/company-spend-audit-benchmark-....json \
  --judge-results ./results/run.judge-results.jsonl
```

Quality is scored out of `100` with these weights:

- coverage and triage completeness: `20`
- case worthiness and no-case discipline: `20`
- evidence grounding: `20`
- policy application: `15`
- grouping and spend reasoning: `10`
- reviewer actionability: `10`
- concision and clarity: `5`

Pass means `totalScore >= 80` and no critical failure. Deterministic exact/F1
checks remain in the raw report only as diagnostic harness-health signals.

The output reports P70/P90/P95/P99 for total tokens, prompt tokens, completion
tokens, cold-start time, warm-start exec time, tool-execution time, `totalMs`,
LLM time, working-set memory, host RSS, and Docker cgroup memory. `totalMs` is
the task wall time excluding the synthetic warm-start probe; raw rows also
include `wallMs`, which includes that probe. Reports are written under
`results/`. Each run also writes a short Markdown readout beside the raw JSON so
the result can be skimmed first and audited second.

The primary memory metric for simultaneous-session claims is
`batchMetrics.totalPeakWorkingSetPerRunBytes`: host-process peak RSS delta plus
Docker cgroup peak memory, divided by active sessions in a homogeneous batch.
RSS means resident set size: the amount of memory the OS currently attributes to
a process. Per-run RSS remains in the raw report as a diagnostic, but it is not
the headline memory metric for concurrent runs because multiple sessions can
share the same Node process.

Each spend-audit benchmark run also writes `traceSamples` into the JSON report and a
`Sample Trace Slices` section into the Markdown readout. Those slices are taken
from the local span recorder and show the concrete tools, commands, parameters,
receipt ids, and tool-loop behavior each runtime worked on.

For the sandbox variant, `cold-start` is container creation via `docker run`.
`warm-start` is the first no-op `docker exec` into an already-running
container.

Web search and review submission are available in every spend-audit variant.
The `tool` variant exposes them as top-level model tools, while `just-bash` and
`sandbox` expose them as CLIs behind the single bash surface.

## Main `just-bash` Scale Benchmark

```bash
pnpm benchmark:just-bash -- --counts scale --workload ops --samples 1 \
  --warmup 1 --payload-kb 16 --tree-files 24 --concurrency all
```

`scale` expands to:

```text
1,10,50,100,250,1000
```

## Docker/Moby Comparator

```bash
pnpm benchmark:docker -- --counts 1,10,50,100 --workload ops \
  --payload-kb 16 --tree-files 24 --concurrency all
```

The Docker script builds `bash-sandbox-benchmark:local`, starts live containers,
records both cold container creation and warm `docker exec` time, creates a
per-container workspace, runs the same CLI and file-tree search workload, reads
`docker stats`, and cleans up the containers.

For larger runs, increase `--counts` carefully. Docker Desktop may hit CPU, memory, or container-count limits before `just-bash` does.

## Workloads

- `idle`: create live sessions and keep them alive.
- `ops`: register or install a custom `bench-cli`, mount/generate a file tree, then operate every live session with:
  - `bench-cli`
  - `jq`
  - `find`
  - `rg`
  - `grep`
  - `wc`

## What To Compare

Performance:

- cold create/start time
- warm execution time on an already-live runtime
- setup time
- concurrent operation time
- peak memory
- retained memory after operations
- max successful session count
- failure mode when scaling breaks

Capability:

| Capability                                  | just-bash               | Docker/Moby                   |
| ------------------------------------------- | ----------------------- | ----------------------------- |
| Single model-facing interface               | yes, bash               | no, real container runtime    |
| Product capabilities as CLI commands        | yes                     | yes                           |
| Avoid large top-level model tool menus      | yes                     | depends on harness            |
| Shell pipelines                             | yes                     | yes                           |
| `jq`, `grep`, `rg`, `find`, `wc` style work | yes, implemented in JS  | yes, native binaries          |
| Virtual filesystem                          | yes                     | no, real container filesystem |
| Custom product CLI                          | yes, in-process command | yes, installed script/binary  |
| Arbitrary native binaries                   | no                      | yes                           |
| OS package install                          | no                      | yes                           |
| Real Linux behavior                         | partial                 | yes                           |
| Strong process/kernel isolation             | no                      | container isolation           |
| Very high cheap session counts              | expected strength       | expected weakness             |

The thesis is not that native tools or real sandboxes are bad. The thesis is
that many agents do not need a giant model-facing tool menu or a
machine-shaped runtime. If the work is custom CLI orchestration, local file
inspection, pipes, `jq`, and short scripts, a bash-shaped workspace can be
dramatically cheaper while preserving the useful agent interface.

The same logic applies to extra capability. A web-search tool can be useful,
and the native `tool` variant includes it. But for most product agents, the
question is not "can I add more capability?" It is "does this task need that
extra compute often enough to pay for it?".

## Notes

Numbers vary by machine, Node version, Docker runtime, image cache, and Docker Desktop resource limits. Treat the outputs as locally reproducible measurements, not universal constants.
