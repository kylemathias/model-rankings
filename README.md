# LLM Model Rankings

Automated daily rankings for LLM models, fetched from [Artificial Analysis](https://artificialanalysis.ai/).

## Overview

This repository provides a `rankings.json` file with intelligence, coding, and agentic scores for LLM models. It's updated daily via GitHub Actions.

Compact scores come from two Artificial Analysis endpoints:

- Legacy catalog `GET /api/v2/data/llms/models` — per-benchmark evaluations used in `fullData`
- Free language models `GET /api/v2/language/models/free` — headline Intelligence, Coding, and **Agentic** indices, plus `intelligence_index_version`

## Data Format

```json
{
  "models": {
    "openai/gpt-4o": { "int": 71, "code": 68, "agent": 64 },
    "anthropic/claude-3.5-sonnet": { "int": 70, "code": 65 }
  },
  "fullData": {
    "openai/gpt-4o": {
      "name": "GPT-4o",
      "slug": "gpt-4o",
      "model_creator": { "name": "OpenAI", "slug": "openai" },
      "evaluations": {
        "artificial_analysis_intelligence_index": 71.2,
        "artificial_analysis_coding_index": 68.5,
        "artificial_analysis_agentic_index": 64.1,
        "mmlu_pro": 0.82,
        "gpqa": 0.65,
        "...": "..."
      },
      "pricing": {
        "price_1m_input_tokens": 2.5,
        "price_1m_output_tokens": 10.0,
        "price_1m_blended_3_to_1": 5.0
      },
      "median_output_tokens_per_second": 85.3,
      "median_time_to_first_token_seconds": 0.45,
      "...": "all other AA fields"
    }
  },
  "updated": "2025-12-28",
  "source": "Artificial Analysis API",
  "attribution": "Rankings provided by Artificial Analysis...",
  "count": 123,
  "metadata": {
    "total_models": 150,
    "compact_entries": 400,
    "full_data_entries": 150,
    "intelligence_index_version": 4.1,
    "endpoints": [
      "/api/v2/data/llms/models",
      "/api/v2/language/models/free"
    ],
    "compact_field_coverage": { "int": 150, "code": 90, "agent": 80 },
    "prompt_options": {}
  }
}
```

### Data Structure

- **`models`**: Compact lookup map for quick matching
  - Keys: Multiple formats for flexible matching (slug, creator/slug, name)
  - Values: `{ int?: number, code?: number, agent?: number }` — each field is omitted when AA has no measurement
  
- **`fullData`**: Complete Artificial Analysis data for each model
  - Keys: Primary identifier (creator/slug or slug)
  - Values: Merged AA response including:
    - Headline indices (intelligence, coding, agentic when available)
    - Other evaluation benchmarks from the legacy catalog (MMLU, GPQA, etc.)
    - Pricing (input/output tokens, blended)
    - Performance metrics (tokens/sec, TTFT)
    - Model metadata (name, creator, parameters, etc.)

- `int`: Intelligence Index (0–100), overall quality
- `code`: Coding Index (0–100), optional
- `agent`: Agentic Index (0–100), optional — tool use, planning, and multi-step tasks. New; lookups should treat it as optional
- `metadata.intelligence_index_version`: Artificial Analysis Intelligence Index methodology version (major.minor) for the scores in this file

Math, openness, and individual benchmarks are not promoted to the compact map. They remain in `fullData.evaluations` when the catalog provides them.

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

A free-tier key is enough. The builder uses the free language-models endpoint plus the public catalog.

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
console.log(data.models["openai/gpt-4o"]);
// { int: 71, code: 68, agent: 64 }  — `code` and `agent` may be absent
```

## Attribution

Rankings data is provided by [Artificial Analysis](https://artificialanalysis.ai/). Please include attribution per their API terms when using this data.

## License

The code in this repository is MIT licensed. The rankings data is subject to Artificial Analysis's terms of use.
