# Company Spend Audit Benchmark Methodology

## Context

This benchmark is designed to compare three ways of giving an agent operational
capability:

- `tool`: a native tool interface with separate model-facing tools.
- `just-bash`: one bash interface backed by `just-bash` and an in-memory
  filesystem.
- `sandbox`: one bash interface backed by a Docker/Moby container.

The benchmark task is a simplified company-spend audit inspired by the Brex
audit-agent workflow. The agent receives a weekly batch of company spend, a
company policy, receipt text, user context, prior cases, calendar context, and
optional public web context. The agent must review the full batch and submit
case and no-case decisions through `submit_review`.

The benchmark contains two related experiments, not one blended claim:

1. Interface experiment: compare a realistic native product-tool API with a
   composable bash interface.
2. Runtime-substrate experiment: compare `just-bash` and Docker when both are
   presented to the model as the same bash interface.

The experiment is not trying to prove that a bash interface provides operating
system isolation. It is testing whether many product-agent workloads that are
usually implemented as many tools or sandboxed sessions can be represented more
simply as one bash-shaped interface with local files, CLIs, pipes, `jq`, search,
and `python3`.

## Scope

This document covers the benchmark methodology: the task, runtime variants,
controls, metrics, quality evaluation, invalidation rules, and reproduction
commands.

In scope:

- interface comparison between `tool` and `just-bash`
- runtime-substrate comparison between `just-bash` and `sandbox`
- token usage, wall time, cold-start time, warm-start time, memory, and trace
  shape
- LLM-judged output quality with deterministic harness checks as diagnostics
- local raw data that lets readers recompute percentiles and compare runs
- local trace samples in the JSON and Markdown reports

Out of scope:

- security claims about bash versus container isolation
- vendor pricing claims
- claims about production Brex data or production reviewer outcomes
- benchmarking every sandbox implementation
- claiming that the native `tool` baseline is capability-equivalent to bash
- proving that web search, calendar lookup, receipt analysis, or prior-case
  lookup is the best possible implementation

## Experiment Families

The results must be read as two experiment families.

### Interface Experiment: `tool` vs `just-bash`

This asks whether a product-agent workload is better served by many explicit
typed tools or by one bash-shaped interface that lets the model compose local
work itself.

Held constant:

- same model
- same dataset, policy, receipts, users, prior cases, calendar context, and web
  backend
- same task prompt intent
- same final `submit_review` schema and validation rules
- same LLM-judge rubric

Varied deliberately:

- `tool` exposes separate native model tools for evidence access and final
  submission
- `just-bash` exposes files, narrow CLIs, shell pipelines, `jq`, and `python3`
  through one bash tool

This is not a pure capability-equivalence test. It is a realistic interface
test: native tools model the kind of product APIs an agent framework would
usually expose, while bash models a composable local work surface. If the native
tool baseline later adds arbitrary Python or shell execution, that should be
reported as a separate `tool+code` ablation because it changes the interface
being tested.

### Runtime-Substrate Experiment: `just-bash` vs `sandbox`

This asks whether a full container is worth the cost when the model-facing
interface is already a bash surface.

Held constant:

- same model
- same dataset, policy, receipts, users, prior cases, calendar context, and web
  backend
- same bash tool description
- same visible files
- same command names and command schemas
- same `python3` availability
- same `submit_review` CLI and repair loop
- same instruction to call `web_search` and `submit_review` as standalone
  commands
- same step cap and final validation rules

Varied deliberately:

- `just-bash` executes through `Bash` on `InMemoryFs` inside the benchmark
  Node.js process
- `sandbox` executes through Docker/Moby with a real Linux container, helper
  scripts, disabled container network, and host-mediated `web_search` /
  `submit_review`

This is the causal comparison for runtime overhead, cold-start time, warm-start
time, container memory, and operational complexity.

## Benchmark Task

The task is a weekly company-spend audit. The live comparison is stratified
across `10`, `100`, and `1000` spend items so the results show both
small-task overhead and larger-batch behavior. Each item is either a
company-paid expense or a reimbursement request.

An expense is spend already paid by the company, usually through a company card.
The audit question is whether the purchase belonged in the card workflow, had
the right approval path, was supported by the receipt, and followed policy.

A reimbursement is an employee repayment request. The audit question is whether
the employee should be repaid, whether the receipt is credible, whether the same
purchase was already paid by the company, and whether the category is
reimbursable.

The policy intentionally treats those two paths differently. A reimbursement
that duplicates a company-paid card expense is more serious than two ordinary
card expenses at the same merchant.

The agent must:

- audit the full batch
- distinguish expenses from reimbursements
- use policy-grounded evidence
- inspect receipt text for material findings
- use prior cases, user context, calendar context, or web context only when it
  materially improves the decision
- submit final decisions through `submit_review`
- include a `companySpendSummary` with total reviewed, amount reviewed, amount
  at issue, reviewed categories, notable clusters, and limitations

The final answer is not free-form prose and is not structured output from the
model API. The final answer must go through `submit_review`: a top-level tool
in the native `tool` variant and a CLI command inside the bash surface for
`just-bash` and `sandbox`. This matters because every runtime shape must finish
through the same submission contract and receive the same validation feedback.

## Dataset

The dataset is generated inside the benchmark repo so the benchmark remains
shareable. The default source is a committed, sanitized CSV seed fixture. It is
expanded into a synthetic weekly workload with real merchant names, anonymized
users, synthetic expense ids, synthetic prior cases, synthetic calendar events,
and text-only receipts. A local `--source-dir` override is allowed for
experiments, but it is not required to reproduce the default workload.

The dataset includes both ordinary spend and company-spend patterns that matter
in audit workflows:

- meals and entertainment
- software and procurement
- travel and lodging
- rideshare
- duplicate or shared receipt evidence
- memo and justification issues
- receipt and documentation issues
- cash-equivalent spend

Receipts are simplified into text. That keeps the benchmark reproducible while
still forcing the agent to use receipt evidence instead of relying only on
expense metadata.

The company policy is more than `1000` words. It explains the evidence
hierarchy, spend patterns, direct policy rules, no-case discipline, use of prior
cases and context, and priority/action rules.

The raw benchmark report may include hidden generated review labels for
diagnostic scoring. Judge packets must not include those labels.

## Runtime Variants

### `tool`

The native tool variant gives the model separate tools:

- `get_policy`
- `get_expenses`
- `analyze_receipt`
- `get_users`
- `get_cases`
- `analyze_calendar_events`
- `web_search`
- `submit_review`

`web_search` uses the same harness shape as the Brex audit-agent web tool:
Gemini through Vertex with `enterprise_web_search` and URL context behind the
LLM gateway. The benchmark treats web capability as an optional capability in
every variant rather than as a separate variant or required quality gate.

The `tool` variant is the largest model-facing interface. It measures the cost
and behavior of giving the model many explicit tools. It is intentionally a
realistic native audit-agent API baseline, not a generic code-execution
baseline: the model gets product-shaped tools, but it does not get `python3`,
`jq`, or arbitrary shell pipelines. That means `tool` versus `just-bash`
measures interface design and local-compute ergonomics, while `just-bash`
versus `sandbox` measures runtime substrate.

For full-batch work, the native tool agent pages through `get_expenses` with
two levels of detail:

- `detailLevel: "overview"` is the default full-batch scan mode. It returns
  compact per-expense rows plus aggregate counts and amounts, so the model can
  cover all 1000 expenses without pushing every field into the transcript.
- `detailLevel: "detailed"` returns the detailed list with all expense fields
  for selected ids, receipt fingerprints, users, merchants, or other narrow
  filters that need full record inspection.

There is no `triage_expenses` tool: grouping, ranking, and case/no-case
decisions are model work done from the fetched expense data and supporting
evidence.

For `just-bash` and `sandbox`, the model-facing setup is intentionally
normalized. The agent sees the same `bash` tool description, the same available
files, the same command names, and the same instruction to write
`/tmp/submission.json` and call `submit_review` as a standalone bash command.
The same standalone-command constraint applies to optional `web_search`, which
prevents one runtime from gaining extra control-flow affordances over the other.
The harness still records the
implementation details needed for measurement, but the agent is not told that
one run is backed by `InMemoryFs` and the other by Docker.

### `just-bash`

The `just-bash` variant gives the model one `bash` tool. The runtime is
`Bash` on `InMemoryFs`.

Available files and commands include:

- `/workspace/expenses.json`
- `/workspace/policy.md`
- `/workspace/users.json`
- `/workspace/prior-cases.json`
- `/workspace/calendar-events.json`
- `/tmp`, backed by the same in-memory filesystem
- `get_expenses`
- `analyze_receipt`
- `get_users`
- `get_cases`
- `analyze_calendar_events`
- `web_search`
- `submit_review`
- `python3`

The `just-bash` runtime does not mount the host filesystem and does not control
the user's local shell. Its memory is inside the Node.js benchmark process.
`/tmp/submission.json` is a virtual file in `InMemoryFs`, not a host file.
The `web_search` command is a CLI inside the bash runtime and is wired to the
same Gemini web-search backend used by the native tool variant. It is available
for public context, but the benchmark does not require it for every run.

The model writes the final JSON submission to `/tmp/submission.json`, then runs:

```bash
submit_review /tmp/submission.json
```

The CLI reads the virtual file, validates it through the same schema and
coverage checks used by the other variants, and prints `accepted`, validation
details, and repair guidance. The model can edit the JSON and rerun
`submit_review` until the submission is accepted.

For full-batch work, `just-bash` must read or fetch the expense dataset through
the bash surface and perform grouping/ranking itself. The agent can use
`python3`, shell commands, or the narrow CLIs, but the benchmark does not provide
a prebuilt shortlist or triage script.

### `sandbox`

The `sandbox` variant gives the model one `bash` tool backed by Docker/Moby.
The container has no network access. The benchmark writes the same workload
files and helper CLIs into the container, then lets the model use bash, CLIs,
optional `web_search`, and `python3`.

Because the container network is disabled, `web_search` is host-mediated at the
bash-tool boundary: when the model calls it as a standalone CLI command, the
benchmark harness wires that command to the same Gemini web-search backend.
This keeps optional web capability equalized without granting the container
general network access.

For full-batch work, `sandbox` must also read or fetch the expense dataset from
inside the container and perform grouping/ranking itself. The recommended shape
mirrors `just-bash`: use `python3`, shell commands, or CLIs over
`/workspace/expenses.json`, then inspect targeted receipt and context evidence.

`submit_review` is handled the same way in the sandbox variant: the model calls
it as a standalone CLI command, and the harness validates the referenced JSON
without exposing a second model-facing tool.

The `sandbox` variant measures both:

- cold start: container creation through `docker run`
- warm start: a no-op `docker exec` into an already-running container

Container memory is recorded separately from benchmark-process RSS because the
container's working set is outside the Node.js process.

## Controls

The benchmark uses these controls to make the comparison attributable to the
runtime/interface shape rather than incidental harness differences:

- The same model is used for all variants within a matrix cell. The live
  comparison is stratified across Haiku, Sonnet, and Opus through the LLM
  gateway so model choice is not confused with runtime choice.
- Live runs use the model/provider default sampling configuration.
- The same generated dataset, policy, receipt text, users, prior cases, and
  calendar context are used across variants.
- Live runs let the LLM call the tools. The harness does not pre-call evidence
  tools before the LLM in live mode.
- Every variant must finish through `submit_review`.
- `submit_review` rejects submissions that do not cover every in-scope expense
  exactly once across `case` and `no_case` decisions.
- Shell variants use the `submit_review` CLI behind the bash surface. The CLI
  can read `/tmp/submission.json` or stdin, returns repairable validation
  feedback, and avoids copying a very large JSON object through a top-level
  model tool call.
- Mock mode is only for harness tests and smoke checks. It is not used for
  headline quality or performance claims.
- Provider preflight is enabled by default for live LLM runs.
- Provider failures abort the benchmark after writing a partial checkpoint
  unless `--allow-provider-errors` is explicitly set.
- Quality, token, and latency comparisons should use `--schedule round-robin`
  so variants are interleaved across the same wall-clock period.
- Homogeneous batches are preferred for memory claims. In a batch of five
  simultaneous `just-bash` runs, the batch should contain only `just-bash`
  runs, not a mixture of variants.
- Every variant has web-search capability. The native `tool` variant exposes it
  as a top-level tool. The `just-bash` and `sandbox` variants expose it as a
  CLI behind the single bash surface.
- Evidence-call batch size is uncapped across native tools and shell CLIs. The
  model decides whether to make one large call or several smaller calls, and the
  benchmark records the resulting token, latency, memory, and quality tradeoff.
- Shell stdout is not truncated by the harness. If an agent dumps a large file
  into the transcript, that strategy is reflected in token use, time, or
  provider-context failure.
- The shell variants share the same model-facing `bash` tool description,
  system instructions, user task prompt, command names, file paths, step cap,
  and `submit_review` repair loop.
- Helper CLI behavior must stay in parity. In particular, `get_expenses`
  defaults, sorting, detail levels, pagination, and summary fields must match
  between `just-bash` and `sandbox`.
- Mixed-variant concurrent runs are useful for latency and interaction-shape
  smoke checks, but not for memory claims. Memory claims should use homogeneous
  batches and `batchMetrics.totalPeakWorkingSetPerRunBytes`.

## Isolation Audit

The comparison is only scientifically useful if each result is attributed to
the right independent variable.

For `just-bash` versus `sandbox`, the independent variable is runtime substrate.
The model-facing bash surface, command names, command schemas, visible files,
submission schema, validation rules, step cap, and repair feedback are held
constant.

For `tool` versus `just-bash`, the independent variable is interface shape. The
task, model, dataset, policy, final schema, and quality rubric are held
constant, but the model-facing work surface intentionally differs. Product
tools expose typed evidence operations. Bash exposes local composition with
files, CLIs, `jq`, and `python3`.

The native `tool` baseline therefore must not be described as a sandbox
baseline or as a capability-equivalent runtime baseline. It is a realistic
native-tool API baseline.

Single-run live outputs, deterministic reference overlap, and mixed-variant
memory rows are not causal quality evidence. Quality claims require the LLM
judge pass across enough runs; scalability claims require homogeneous batches
and raw metric percentiles.

The default live matrix uses:

- dataset sizes: `10`, `100`, `1000`
- models: `haiku`, `sonnet`, `opus`
- runs per model-size-variant cell: `20`
- quality, token, and latency schedule: `round-robin`

Percentiles should be computed inside each `(model, size, variant)` cell before
any cross-size or cross-model rollup. A `10`-expense task and a `1000`-expense
task do not measure the same workload, so combining them into one headline
number hides the scaling behavior the experiment is meant to reveal.

Residual threats to validity:

- The LLM may choose different command strategies even with the same prompt.
  That is part of interface ergonomics, but it adds variance. The default
  matrix now uses 20 runs per model-size-variant cell for cost control, so the
  resulting P95/P99 values should be treated as directional tails rather than
  publication-grade extreme-tail estimates.
- Docker startup, file-writing setup, and host-mediated commands are real
  sandbox costs, but they also make sandbox setup more complex than a minimal
  prewarmed container pool. Report cold and warm numbers separately.
- Process RSS is not isolated per agent when several runs share the same Node.js
  harness process. Treat `peakDelta` and `retainedDelta` as run-local
  approximations only for `batchSize = 1`.
- `web_search` and `submit_review` are intentionally constrained to standalone
  shell commands for both shell variants. If the prompt allows embedding them
  inside larger scripts, `just-bash` can support shapes that the current sandbox
  interception layer cannot.

## Submission Schema

Every accepted submission has this shape:

```json
{
  "decisions": [
    {
      "outcome": "case",
      "expenseIds": ["exp_0001"],
      "title": "short case title",
      "priority": "low | medium | high | critical",
      "tags": ["PROHIBITED_SPEND"],
      "reasoning": "policy-grounded reasoning",
      "evidence": [
        {
          "type": "expense",
          "reference": "exp_0001",
          "summary": "why this evidence matters"
        }
      ],
      "recommendedAction": "reviewer action"
    }
  ],
  "companySpendSummary": {
    "totalReviewed": 1000,
    "amountReviewedUsd": 12345.67,
    "amountAtIssueUsd": 1200,
    "categoriesReviewed": ["meal", "travel"],
    "notableSpendClusters": ["short description"],
    "unresolvedLimitations": ["material limitation"]
  }
}
```

`case` decisions group material, policy-grounded findings that deserve manual
review. `no_case` decisions clear the remaining in-scope spend. A good output
does not maximize case count. It separates material issues from routine spend
and explains both decisions.

## Quality Evaluation

Quality is judged by an LLM judge using a fixed rubric. Deterministic checks
remain as harness health signals, not as the headline quality metric.

The judge score is out of `100`:

| Dimension                              | Max |
| -------------------------------------- | --: |
| Coverage and triage completeness       |  20 |
| Case worthiness and no-case discipline |  20 |
| Evidence grounding                     |  20 |
| Policy application                     |  15 |
| Grouping and spend reasoning           |  10 |
| Reviewer actionability                 |  10 |
| Concision and clarity                  |   5 |

Pass means:

- `totalScore >= 80`
- no critical failure
- the harness accepted the submission

Critical failures:

- fabricated expense, receipt, policy, prior-case, web, or calendar evidence
- failure to audit the full company-spend batch
- cases created from vague suspicion without policy-grounded evidence
- direct policy breaches cleared with unsupported assumptions
- unusable output or missing terminal decisions for material in-scope spend

The judge is independent per run, not pairwise. A packet for one run includes:

- dataset manifest
- policy
- compact expense file reference or compact expense sample
- receipt and context evidence
- submitted output
- compact trace summary
- rubric

Judge packets intentionally exclude hidden generated labels and expected
answers. This prevents the judge from simply comparing to the generator output.

## Harness Health Checks

Harness health checks determine whether a run produced a valid artifact that
can be judged. They do not determine final quality by themselves.

The benchmark records whether:

- the runtime completed
- the provider completed without retry exhaustion
- `submit_review` was called
- the submitted JSON matched the schema
- every submitted expense id exists in the fixture
- every in-scope expense id appears exactly once
- receipt/context evidence tools or commands were used
- the full-batch expense fetch/read path was used

If a submission is rejected, `submit_review` returns a repairable error and the
model can call `submit_review` again. Rejections are recorded as
`submissionRejections`.

## Metrics

The raw report stores one row per run. Percentiles are computed from the raw
rows, so P70, P90, P95, and P99 can be recomputed.

Token metrics:

- prompt tokens
- completion tokens
- total tokens

Time metrics:

- `coldStartMs`: runtime creation time
- `warmStartMs`: no-op command time in an already-created runtime
- `prepMs`: setup time for files and helper commands when applicable
- `webSearchMs`: time spent in the web-search child call
- `llmMs`: model/tool-loop time
- `totalMs`: task wall time excluding the synthetic warm-start probe
- `wallMs`: full run wall time including the synthetic warm-start probe

Memory metrics:

- `runtimeWorkingSetBytes`: per-row diagnostic runtime memory. For `sandbox`,
  this is Docker cgroup peak memory when available. For in-process variants,
  this is peak host-process RSS delta.
- `containerMemoryStats.peakBytes`: Docker cgroup high-water memory when
  applicable.
- `containerMemoryStats.currentBytes`: Docker cgroup current memory when
  applicable.
- `peakDelta.rss`: sampled host-process resident-set-size delta during the run.
- `peakDelta.maxRss`: host-process high-water RSS delta from
  `process.resourceUsage()`.
- `retainedDelta.rss`: host-process RSS delta retained after the run.
- `peakDelta.heapUsed`: V8 heap delta, useful for understanding in-process
  `just-bash` memory but not a full machine-cost metric.
- `batchMetrics.totalPeakWorkingSetBytes`: host-process peak RSS delta plus
  Docker cgroup peak memory for a concurrent batch.
- `batchMetrics.totalPeakWorkingSetPerRunBytes`: primary memory metric for
  homogeneous concurrent batches.

RSS means resident set size: the amount of physical memory the operating system
attributes to a process. RSS is useful raw evidence, but per-run RSS is a weak
primary metric when several sessions share one Node.js process. The headline
memory metric should be peak active working set per session:

```text
batch total peak working set =
  host process peak RSS delta + summed Docker cgroup peak memory

peak active working set per session =
  batch total peak working set / active sessions
```

This metric is harder to dismiss than row-level RSS because it measures the
actual memory envelope required to keep `N` sessions active at once. It also
handles Docker correctly: the sandbox container's memory lives outside the
Node.js process, so it must be counted from Docker cgroups rather than inferred
from host-process RSS.

Use `batchMetrics.totalPeakWorkingSetPerRunBytes` for memory claims about
simultaneous sessions. Use per-row `peakDelta.rss`, `peakDelta.maxRss`,
`peakDelta.heapUsed`, and `containerMemoryStats` as diagnostics.

Trace metrics:

- native tool calls
- bash exec calls
- Docker exec calls
- agent turns
- provider retries
- provider failures
- submission calls
- submission rejections
- local trace samples in the JSON and Markdown reports

## Traces

Each run records local spans for the benchmark harness. The local span tree is
stored in the JSON report and summarized in the Markdown readout.

Trace samples are also written into the local report. They show the tools or
commands each agent used, including parameters, receipt ids, bash commands,
Docker commands, and submission behavior. This makes the benchmark auditable
from the repository artifact alone.

## Invalidation Rules

A run should not be used as strategy evidence when:

- provider preflight fails
- the run has provider connectivity errors
- the run times out before producing a submission
- `submit_review` is never called
- the submission fails schema validation
- the submission does not cover every in-scope expense exactly once
- the run does not fetch or read the full expense batch through the evaluated
  runtime surface
- hidden expected labels leak into judge packets
- batches mix variants while being used for memory comparison
- memory claims use per-row host RSS instead of homogeneous-batch peak working
  set

Provider failures, timeouts, and harness failures are still useful. They should
be analyzed as reliability or harness-quality findings, not as evidence that
one strategy produced a better audit decision.

## Reproduction Commands

Install dependencies:

```bash
pnpm install
```

Run the spend-audit unit tests:

```bash
pnpm test:spend-audit
```

Run a mock smoke test without LLM spend:

```bash
pnpm benchmark:spend-audit -- --runs 1 \
  --variants tool,just-bash,sandbox \
  --max-expenses 1000 \
  --mock-llm \
  --export-judge-packets
```

Run a live one-sample matrix gate. This checks every selected model alias and
all three runtime shapes before spending on the full matrix:

```bash
pnpm benchmark:spend-audit:matrix -- --sample \
  --models haiku,sonnet,opus \
  --sizes 10 \
  --batch-size 3 \
  --schedule round-robin \
  --env-file /path/to/llm-gateway.env \
  --require-llm \
  --export-judge-packets \
  --output-dir results/spend-audit-matrix-live-sample
```

Run the full live quality, token, and time comparison as a stratified matrix.
The matrix runner invokes the base benchmark once per size/model cell and keeps
raw reports separate:

```bash
pnpm benchmark:spend-audit:matrix -- \
  --sizes 10,100,1000 \
  --models haiku,sonnet,opus \
  --runs 20 \
  --batch-size 3 \
  --schedule round-robin \
  --variants tool,just-bash,sandbox \
  --env-file /path/to/llm-gateway.env \
  --require-llm \
  --export-judge-packets \
  --output-dir results/spend-audit-matrix-live-r20
```

Run memory claims separately with grouped scheduling and homogeneous variant
batches. This is the run shape to use for
`batchMetrics.totalPeakWorkingSetPerRunBytes`. Run one variant at a time so
each batch contains only one runtime shape:

```bash
pnpm benchmark:spend-audit -- --runs 20 \
  --batch-size 5 \
  --schedule grouped \
  --variants just-bash \
  --max-expenses 1000 \
  --model haiku \
  --env-file /path/to/llm-gateway.env \
  --require-llm \
  --export-judge-packets \
  --output-dir results/spend-audit-live-r20-memory-just-bash-haiku-1000
```

Analyze a completed report:

```bash
pnpm analyze:spend-audit -- \
  ./results/spend-audit-live-100/company-spend-audit-benchmark-....json
```

Attach judge results without rerunning agents:

```bash
pnpm analyze:spend-audit -- \
  ./results/spend-audit-live-100/company-spend-audit-benchmark-....json \
  --judge-results ./results/spend-audit-live-100/run.judge-results.jsonl
```

## Interpreting Results

Read the results in layers:

1. Runtime completion: did the runtime and provider finish?
2. Harness health: did the run produce a valid, full-coverage submission?
3. Judge quality: how good was the submitted audit output?
4. Diagnostic exactness: how close was the output to generated hidden labels?
5. Cost and scalability: how many tokens, how much time, and how much memory did
   the run use?
6. Trace shape: how many model turns, tool calls, bash commands, or Docker execs
   were needed?

The article can still argue that compute cost and system complexity matter even
when wall-clock time is close. If `sandbox` and `just-bash` have similar
latency, the decision still depends on memory cost, startup cost, operational
complexity, isolation needs, and the capabilities actually required by the
agent task.

The benchmark should not claim that bash replaces sandboxes for adversarial
code execution. The intended claim is narrower: many company-product agent
tasks need file operations, CLI composition, filtering, search, `jq`, and
`python3` more than they need a full container boundary per agent session.

## Documentation Gaps

- Add a public sample showing optional `web_search` usage as a top-level tool
  call, a `just-bash` CLI call, and a host-mediated `sandbox` CLI call side by
  side.
- Add a public sample judge packet and a public sample judge result.
- Add a small diagram of the benchmark data flow: fixture generation, agent run,
  submission, judge packet, judge result, analysis.
- Pin the exact model, gateway configuration, Docker image digest, and
  `just-bash` version in a release artifact before publishing final numbers.
- Add an independent rerun on a clean machine before making public scalability
  claims.
- Add redacted trace exports for the article examples.
