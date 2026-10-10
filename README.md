# LLM Model Rankings

Automated daily rankings for LLM models, fetched from [Artificial Analysis](https://artificialanalysis.ai/).

## Overview

This repository provides a `rankings.json` file that contains intelligence and coding scores for various LLM models. It's updated daily via GitHub Actions.

## Data Format

```json
{
  "models": {
    "openai/gpt-4o": { "int": 71, "code": 68, "agent": 64 },
    "anthropic/claude-3.5-sonnet": { "int": 70, "code": 65, "agent": 60 }
  },
  "fullData": {
    "openai/gpt-4o": {
      "name": "GPT-4o",
      "slug": "gpt-4o",
      "release_date": "2024-05-13",
      "model_creator": { "name": "OpenAI", "slug": "openai", "country": "us" },
      "reasoning_model": false,
      "evaluations": {
        "artificial_analysis_intelligence_index": 71.2,
        "artificial_analysis_coding_index": 68.5,
        "artificial_analysis_agentic_index": 64.1,
        "artificial_analysis_engineering_index": 40.2,
        "gpqa_diamond": 0.65,
        "...": "headline indexes, six capability indexes, and per-benchmark scores"
      },
      "pricing": {
        "price_1m_input_tokens": 2.5,
        "price_1m_output_tokens": 10.0,
        "price_1m_blended_3_to_1": 5.0,
        "price_1m_blended_7_to_2_to_1": 3.1,
        "price_1m_cache_hit_tokens": 1.25,
        "price_1m_cache_write_tokens": 3.75
      },
      "performance": {
        "median_output_tokens_per_second": 85.3,
        "median_time_to_first_token_seconds": 0.45,
        "median_time_to_first_answer_token_seconds": 0.45,
        "median_end_to_end_response_time_seconds": 1.2
      },
      "median_output_tokens_per_second": 85.3,
      "median_time_to_first_token_seconds": 0.45,
      "median_time_to_first_answer_token": 0.45,
      "context_window_tokens": 128000,
      "openrouter_api_id": "openai/gpt-4o",
      "...": "cost to run the index, parameters, modalities, licensing, Hugging Face URL"
    }
  },
  "updated": "2026-10-06",
  "source": "Artificial Analysis API",
  "attribution": "Rankings provided by Artificial Analysis...",
  "count": 123,
  "metadata": {
    "total_models": 150,
    "compact_entries": 400,
    "full_data_entries": 150,
    "endpoint": "/api/v2/language/models",
    "tier": "pro",
    "intelligence_index_version": 4.3,
    "prompt_options": { "prompt_type": "medium", "prompt_length": 1000, "parallel_queries": 1 }
  }
}
```

### Data Structure

- **`models`**: Compact lookup map for quick matching
  - Keys: Multiple formats for flexible matching (slug, creator/slug, name, OpenRouter id)
  - Values: `{ int: number, code: number, agent: number }`
  - A score field is left out when that headline index is missing

- **`fullData`**: Artificial Analysis list payload for each ranked model
  - Keys: Primary identifier (creator/slug or slug)
  - Values include:
    - Headline indexes (Intelligence, Coding, Agentic) and the six Capability Indexes
    - Per-benchmark scores on the Pro endpoint (GPQA Diamond, Terminal-Bench, SciCode, AA-LCR, HLE, and the rest of the current set)
    - Pricing (input, output, cache hit, cache write, and blended ratios on Pro)
    - Performance medians, plus percentiles on Pro. Medians are also copied to the previous top-level names so existing readers keep working
    - Intelligence Index run cost, context window, parameter counts, modalities, licensing, Hugging Face URL, and `openrouter_api_id` when the tier includes them
    - `model_creator.slug` is restored from the slug this file used before. The language-model API returns creator id, name, and on Pro a country code

- `int`: Intelligence Index, rounded
- `code`: Coding Index, rounded
- `agent`: Agentic Index, rounded

### API migration

`GET /api/v2/data/llms/models` is retired on 4 November 2026. After that, calls return `410 Gone`. The builder now calls [`GET /api/v2/language/models`](https://artificialanalysis.ai/data-api/docs) and follows `pagination.has_more`. The same `ARTIFICIAL_ANALYSIS_KEY` is sent as `x-api-key`.

If that route returns `403` (the key is free-tier), the builder uses [`GET /api/v2/language/models/free`](https://artificialanalysis.ai/data-api/migrate-v2-data). The free payload has the headline and capability indexes, median speed, and input/output/cache prices. It does not include per-benchmark scores, blended prices, percentiles, context window, or OpenRouter ids.

Speed and latency stay on the previous 1,000-token preset (`prompt_type=medium`). The new API's own default is `long` (10,000 tokens). Set `AA_PROMPT_TYPE` to `long`, `100k`, `vision_single_image`, `medium_coding`, or `medium_parallel` to change it. `metadata.intelligence_index_version` is the index vintage for the scores in the file (major.minor only).

These evaluation names changed with the new schema, and the old names are not copied forward:

| Previous field | Current field |
| --- | --- |
| `gpqa` | `gpqa_diamond` |
| `lcr` | `aa_lcr` |
| `tau2` | `tau2_telecom` |
| `median_time_to_first_answer_token` | `performance.median_time_to_first_answer_token_seconds` (the old name is still filled on each `fullData` record) |

`mmlu_pro`, `livecodebench`, `math_500`, `aime`, and `artificial_analysis_math_index` are not in the current list schema. Detail-only fields (per-evaluation token counts, Omniscience breakdown, Openness breakdown, and per-provider rows) stay off the daily pull. Loading them would be one request per model, past the free (100/day) and Pro (500/day) quotas for this catalog.

## Setup

### 1. Create GitHub Repository

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/kylemathias/model-rankings.git
git push -u origin main
```

### 2. Add Artificial Analysis API Key

1. Go to your repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `ARTIFICIAL_ANALYSIS_KEY`
4. Value: Your Artificial Analysis API key
5. Click "Add secret"

Optional repository variable: `AA_PROMPT_TYPE` (Settings → Secrets and variables → Actions → Variables). Leave it unset to keep `medium`.

### 3. Enable GitHub Actions

1. Go to Actions tab
2. If needed, click "I understand my workflows, go ahead and enable them"
3. Click "Update Rankings" workflow
4. Click "Run workflow" to test

## Usage

Fetch the latest rankings in your application:

```javascript
const res = await fetch("https://raw.githubusercontent.com/kylemathias/model-rankings/main/rankings.json");
const data = await res.json();
console.log(data.models);
```

## Attribution

Rankings data is provided by [Artificial Analysis](https://artificialanalysis.ai/). Please include attribution per their API terms when using this data.

## License

The code in this repository is MIT licensed. The rankings data is subject to Artificial Analysis's terms of use.
