# Fine-Tuning Plan for PlanckOff (Extraction + Matching Pipeline)

## 1) Executive Decision

For this use case (construction PDF extraction + material/labor code matching), the best practical strategy is:

1. First: stabilize pipeline + evaluation (must do)
2. Then: fine-tune a cost-efficient model for repetitive mapping tasks
3. Keep a stronger base model as fallback for hard/novel cases

Fine-tuning is useful, but it is not a replacement for architecture quality (page batching, schema validation, reconciliation, rule engine).

---

## 2) Which model is best for this use case?

### 2.1 Key reality about the current stack

- The app currently routes through OpenRouter for inference.
- OpenRouter is an inference gateway, not a custom-training platform.
- If you fine-tune, do it on the underlying provider platform (for example OpenAI or Google Vertex AI), then call that tuned endpoint.

### 2.2 Recommended options

#### Option A (best fit if staying Gemini-heavy): Gemini 2.5 Flash supervised tuning on Vertex AI
- Good tradeoff of quality/speed/cost for structured extraction/matching
- Works well if existing prompts/models are Gemini-oriented
- Good for domain adaptation with corrected datasets

#### Option B (strong ecosystem + mature workflows): OpenAI fine-tuning on mini-tier model
- Strong fine-tuning tooling and job APIs
- Good for structured JSON output consistency
- Useful if lower inference cost on tuned smaller model is a goal

#### Option C (budget + more MLOps effort): Open-source fine-tune (Llama/Mistral)
- Lowest raw model cost
- Highest engineering burden (hosting, eval infra, safety, uptime)
- Better if there is an ML infra team; not ideal for a beginner-first execution

### Recommendation

Start with Gemini 2.5 Flash tuning on Vertex AI (or OpenAI mini fine-tuning if OpenAI-native operations are preferred), because this is a production app workflow where reliability matters more than research flexibility.

---

## 3) Can a beginner (basic Python) do this?

Yes, with guidance and phased scope.

A beginner can handle:
- dataset formatting
- simple scripts
- training job submission via API/console
- basic evaluation scripts

A beginner usually struggles without help on:
- data curation quality
- leakage prevention (train/val/test split discipline)
- hyperparameter decisions
- regression analysis and rollout strategy

### Minimum knowledge required

- Python basics (files, loops, JSON, API calls)
- Prompt/data quality basics
- Git and environment management
- Basic statistics for evaluation (precision/recall/F1)

### Recommended learning runway

- 1 week focused learning + 1 week guided implementation is a workable start

---

## 4) Cost and time (realistic ranges)

Prices change by provider and date. Verify on official pricing pages before budgeting.

### 4.1 Provider-side training cost model (high level)

- Fine-tuning is usually billed per training token (or job compute time for RL methods)
- Inference on tuned models may be same or premium versus base model, depending on provider

### 4.2 Typical pilot budget

Assume pilot data:
- 5k to 20k high-quality examples
- 1 to 3 epochs
- repeated evaluation runs

Expected spend:
- Small pilot: about $100 to $800 total
- Serious pilot: about $800 to $4k total
- Aggressive iterations + broad eval: $4k+

Training may be cheaper than evaluation/inference at volume.

### 4.3 Time estimate

- Data collection/cleaning: 1 to 3 weeks
- First tuned model run: 1 to 3 days
- Evaluation + refinement cycles: 1 to 3 weeks
- Safe production rollout: 1 week
- Total realistic: 3 to 8 weeks to production-grade confidence

---

## 5) Compute requirements: local machine vs cloud

### 5.1 Managed fine-tuning (recommended)

- Training compute runs in provider cloud
- Local machine is only for preparation/scripts
- No powerful local GPU required

### 5.2 Open-source local/own-cloud training

- Requires strong GPU resources (often 24GB+ VRAM minimum for practical workflows, usually more for larger models)
- Also requires serving infra, monitoring, scaling, and security
- Not recommended as the first path for current team maturity

---

## 6) What data is needed before fine-tuning

Fine-tuning quality equals data quality.

Required:
- Input examples from exact pipeline tasks
- Expected output in strict target format
- Error-tagged corrections from real runs
- Representative edge cases (ceilings, mixed units, ambiguous assemblies, OCR noise)

### Dataset quality rules

- Remove duplicates and contradictory labels
- Keep strict schema consistency
- Include hard negatives (cases where model should abstain/flag review)
- Split by project, not random rows (to avoid leakage)

---

## 7) Fine-tuning process (step-by-step)

### Step 0 - Gate check (must pass before tuning)

- Run-level metrics and failure taxonomy are in place
- Stable baseline exists on a gold test set
- Top recurring failure classes are known

### Step 1 - Build dataset

- Gather corrected examples from production-like runs
- Convert into provider-required training format
- Add validation and test sets (project-wise split)

### Step 2 - Define objective

Pick one primary objective per run:
- JSON structure reliability
- material code precision
- lower REVIEW_REQUIRED rate

### Step 3 - Launch first tuning job

- Start with conservative settings (auto/default hyperparameters)
- Keep one base model unchanged for A/B comparison

### Step 4 - Evaluate objectively

Measure:
- extraction recall
- match precision
- reconciliation success
- anomaly rates
- latency and token cost

### Step 5 - Error review

Inspect mispredictions and classify whether each issue is:
- data issue
- architecture issue
- model capacity issue
- rule gap

### Step 6 - Iterate

- Update dataset/rules/prompt structure
- Re-run tuning only when data quality materially improves

### Step 7 - Rollout safely

- Canary release (small traffic slice)
- Auto rollback if key KPIs regress
- Keep fallback model path active

---

## 8) Where fine-tuning helps vs where it will not

### Helps most

- consistent structured output
- domain vocabulary adaptation
- repetitive mapping behavior
- reduced prompt-length dependence

### Helps less

- missing PDF pages due to input pipeline issues
- reconciliation bugs between takeoff and extraction IDs
- quantity/cost logic bugs in downstream code
- data source inconsistency

So architecture + rules + eval remain essential.

---

## 9) Team/resource investment checklist

### People

- 1 full-stack engineer for instrumentation + integration
- 1 data curator/QA reviewer (part-time)
- optional ML advisor for first one to two cycles

### Tooling

- dataset versioning (DVC or simple versioned bucket strategy)
- experiment tracking sheet/dashboard
- automated eval runner
- locked regression test set

### Process

- weekly model review meeting
- strict promotion criteria
- rollback policy documented

---

## 10) Practical recommendation for PlanckOff right now

Phase order for maximum ROI:

1. Implement failure logging + taxonomy + KPI dashboard
2. Stabilize deterministic behavior and schema validation
3. Add correction capture workflow
4. Build first high-quality tuning dataset from real corrections
5. Run one pilot fine-tune (Gemini 2.5 Flash on Vertex AI or OpenAI mini fine-tune)
6. Compare against baseline on fixed gold set
7. Ship only if global metrics improve without regressions

---

## 11) Beginner-friendly verdict

- Is it possible for a beginner? Yes.
- Can a beginner do it alone end-to-end production-grade? Usually not immediately.
- Best path: beginner + clear framework + templates + review process.

With this direction, fine-tuning is achievable if treated as part of a measured quality system, not as a one-shot fix.

