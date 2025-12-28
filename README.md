# LLM Model Rankings

Automated daily rankings for LLM models, fetched from [Artificial Analysis](https://artificialanalysis.ai/).

## Overview

This repository provides a `rankings.json` file that contains intelligence and coding scores for various LLM models. It's updated daily via GitHub Actions.

## Data Format

```json
{
  "models": {
    "openai/gpt-4o": { "int": 71, "code": 68 },
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
    "prompt_options": {}
  }
}
```

### Data Structure

- **`models`**: Compact lookup map for quick matching (int/code scores only)
  - Keys: Multiple formats for flexible matching (slug, creator/slug, name)
  - Values: `{ int: number, code: number }`
  
- **`fullData`**: Complete Artificial Analysis data for each model
  - Keys: Primary identifier (creator/slug or slug)
  - Values: Full AA response including:
    - All evaluation benchmarks (MMLU, GPQA, HumanEval, etc.)
    - Pricing (input/output tokens, blended)
    - Performance metrics (tokens/sec, TTFT)
    - Model metadata (name, creator, parameters, etc.)

- `int`: Intelligence score (0-100)
- `code`: Coding score (0-100)

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
