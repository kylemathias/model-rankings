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
  "updated": "2025-12-28",
  "source": "Artificial Analysis API",
  "attribution": "Rankings provided by Artificial Analysis...",
  "count": 123
}
```

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
