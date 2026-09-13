import fs from "node:fs/promises";

const AA_KEY = process.env.ARTIFICIAL_ANALYSIS_KEY;
if (!AA_KEY) {
  console.error("ARTIFICIAL_ANALYSIS_KEY env var required");
  process.exit(1);
}

const AA_BASE = "https://artificialanalysis.ai";
const outPath = "./rankings.json";

function finiteNumber(value) {
  return value != null && Number.isFinite(value) ? value : null;
}

function modelKey(m) {
  const slug = m.slug?.toLowerCase();
  if (!slug) return null;
  const creator = m.model_creator?.slug?.toLowerCase();
  return creator ? `${creator}/${slug}` : slug;
}

async function aaGet(path) {
  const url = path.startsWith("http") ? path : `${AA_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "x-api-key": AA_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`AA fetch failed ${res.status} ${res.statusText} for ${url}\n${body}`);
  }
  return res.json();
}

async function fetchLegacyCatalog() {
  console.log("Fetching Artificial Analysis legacy catalog (/api/v2/data/llms/models)...");
  const aa = await aaGet("/api/v2/data/llms/models");
  console.log(`Received ${aa.data?.length || 0} models from legacy catalog`);
  return aa;
}

async function fetchFreeLanguageModels() {
  console.log("Fetching Artificial Analysis free language models (/api/v2/language/models/free)...");
  const models = [];
  let intelligenceIndexVersion = null;
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const body = await aaGet(`/api/v2/language/models/free?page=${page}`);
    if (intelligenceIndexVersion == null && body.intelligence_index_version != null) {
      intelligenceIndexVersion = body.intelligence_index_version;
    }
    const pageData = body.data || [];
    models.push(...pageData);
    console.log(`  page ${page}: ${pageData.length} models (total ${models.length})`);
    if (!body.pagination?.has_more) break;
    page += 1;
  }

  if (page > maxPages) {
    console.warn(`Stopped after ${maxPages} pages; more data may remain`);
  }

  return { models, intelligenceIndexVersion };
}

function mergeEvaluations(catalogEval, freeEval) {
  const out = { ...(catalogEval || {}) };
  if (!freeEval) return out;

  const agent = finiteNumber(freeEval.artificial_analysis_agentic_index);
  if (agent != null) out.artificial_analysis_agentic_index = agent;

  if (finiteNumber(out.artificial_analysis_intelligence_index) == null) {
    const int = finiteNumber(freeEval.artificial_analysis_intelligence_index);
    if (int != null) out.artificial_analysis_intelligence_index = int;
  }

  if (finiteNumber(out.artificial_analysis_coding_index) == null) {
    const code = finiteNumber(freeEval.artificial_analysis_coding_index);
    if (code != null) out.artificial_analysis_coding_index = code;
  }

  return out;
}

function mergeModel(catalog, free) {
  const base = catalog ? { ...catalog } : { ...free };
  const evaluations = mergeEvaluations(catalog?.evaluations, free?.evaluations);

  if (!catalog && free) {
    return {
      ...free,
      evaluations,
      pricing: free.pricing,
      median_output_tokens_per_second:
        free.median_output_tokens_per_second ??
        free.performance?.median_output_tokens_per_second,
      median_time_to_first_token_seconds:
        free.median_time_to_first_token_seconds ??
        free.performance?.median_time_to_first_token_seconds,
      median_time_to_first_answer_token:
        free.median_time_to_first_answer_token ??
        free.performance?.median_time_to_first_answer_token_seconds,
    };
  }

  return { ...base, evaluations };
}

function compactScores(evaluations) {
  const entry = {};
  const int = finiteNumber(evaluations?.artificial_analysis_intelligence_index);
  const code = finiteNumber(evaluations?.artificial_analysis_coding_index);
  const agent = finiteNumber(evaluations?.artificial_analysis_agentic_index);
  if (int != null) entry.int = Math.round(int);
  if (code != null) entry.code = Math.round(code);
  if (agent != null) entry.agent = Math.round(agent);
  return entry;
}

function addAliases(models, m, entry) {
  const slug = m.slug?.toLowerCase();
  const creator = m.model_creator?.slug?.toLowerCase();
  if (!slug) return 0;

  let count = 0;
  if (creator) {
    models[`${creator}/${slug}`] = entry;
    count++;
  }
  models[slug] = entry;
  if (m.name) models[m.name.toLowerCase()] = entry;

  // Handle Z.AI naming: AA uses "zai" but OpenRouter uses "z-ai"
  if (creator === "zai") {
    models[`z-ai/${slug}`] = entry;
    const dotSlug = slug.replace(/(\d)-(\d)/g, "$1.$2");
    if (dotSlug !== slug) {
      models[`z-ai/${dotSlug}`] = entry;
    }
  }

  // OpenRouter-style IDs (hyphens → dots between digits)
  const orStyleSlug = slug.replace(/(\d)-(\d)/g, "$1.$2");
  if (orStyleSlug !== slug) {
    if (creator) models[`${creator}/${orStyleSlug}`] = entry;
    models[orStyleSlug] = entry;
  }

  // NVIDIA: AA uses "nvidia-nemotron-*" but OpenRouter uses "nemotron-*"
  if (creator === "nvidia" && slug.startsWith("nvidia-")) {
    const orNvidiaSlug = slug.replace(/^nvidia-/, "");
    models[`${creator}/${orNvidiaSlug}`] = entry;
    models[orNvidiaSlug] = entry;
    const orNvidiaSlugDots = orNvidiaSlug.replace(/(\d)-(\d)/g, "$1.$2");
    if (orNvidiaSlugDots !== orNvidiaSlug) {
      models[`${creator}/${orNvidiaSlugDots}`] = entry;
      models[orNvidiaSlugDots] = entry;
    }
  }

  // Llama: AA uses "llama-3-1-*" but OpenRouter uses "llama-3.1-*"
  if (slug.includes("llama")) {
    const llamaDotSlug = slug.replace(/llama-(\d+)-(\d+)/g, "llama-$1.$2");
    if (llamaDotSlug !== slug) {
      if (creator) models[`${creator}/${llamaDotSlug}`] = entry;
      models[llamaDotSlug] = entry;
    }
  }

  const suffixes = ["-preview", "-beta", "-exp", "-experimental", "-latest"];
  const allSlugsForModel = new Set();
  if (creator) allSlugsForModel.add(`${creator}/${slug}`);
  allSlugsForModel.add(slug);
  if (orStyleSlug !== slug) {
    if (creator) allSlugsForModel.add(`${creator}/${orStyleSlug}`);
    allSlugsForModel.add(orStyleSlug);
  }

  for (const baseSlug of allSlugsForModel) {
    for (const suffix of suffixes) {
      models[`${baseSlug}${suffix}`] = entry;
    }
  }

  return count;
}

const reservedFullKeys = [
  "name",
  "slug",
  "model_creator",
  "evaluations",
  "pricing",
  "median_output_tokens_per_second",
  "median_time_to_first_token_seconds",
  "median_time_to_first_answer_token",
];

try {
  const [legacy, free] = await Promise.all([
    fetchLegacyCatalog(),
    fetchFreeLanguageModels(),
  ]);

  const byId = new Map();
  const byKey = new Map();

  for (const m of legacy.data || []) {
    if (m.id) byId.set(m.id, m);
    const key = modelKey(m);
    if (key) byKey.set(key, m);
  }

  const merged = [];
  const seen = new Set();

  for (const freeModel of free.models) {
    const key = modelKey(freeModel);
    const catalog =
      (freeModel.id && byId.get(freeModel.id)) ||
      (key && byKey.get(key)) ||
      null;
    const combined = mergeModel(catalog, freeModel);
    merged.push(combined);
    if (catalog?.id) seen.add(catalog.id);
    else if (freeModel.id) seen.add(freeModel.id);
    if (key) seen.add(`key:${key}`);
  }

  for (const catalog of legacy.data || []) {
    const key = modelKey(catalog);
    if (catalog.id && seen.has(catalog.id)) continue;
    if (key && seen.has(`key:${key}`)) continue;
    merged.push(mergeModel(catalog, null));
  }

  console.log(`Merged ${merged.length} unique models`);

  const models = {};
  const fullData = {};
  let count = 0;
  const coverage = { int: 0, code: 0, agent: 0 };

  for (const m of merged) {
    const slug = m.slug?.toLowerCase();
    if (!slug) continue;

    const entry = compactScores(m.evaluations);
    if (Object.keys(entry).length === 0) continue;

    if (entry.int != null) coverage.int++;
    if (entry.code != null) coverage.code++;
    if (entry.agent != null) coverage.agent++;

    count += addAliases(models, m, entry);

    const fullKey = modelKey(m) || slug;
    fullData[fullKey] = {
      name: m.name,
      slug: m.slug,
      model_creator: m.model_creator,
      evaluations: m.evaluations,
      pricing: m.pricing,
      median_output_tokens_per_second: m.median_output_tokens_per_second,
      median_time_to_first_token_seconds: m.median_time_to_first_token_seconds,
      median_time_to_first_answer_token: m.median_time_to_first_answer_token,
      ...Object.fromEntries(
        Object.entries(m).filter(([key]) => !reservedFullKeys.includes(key))
      ),
    };
  }

  const output = {
    models,
    fullData,
    updated: new Date().toISOString().split("T")[0],
    source: "Artificial Analysis API",
    attribution:
      "Rankings provided by Artificial Analysis (https://artificialanalysis.ai/). Please attribute per their terms.",
    count,
    metadata: {
      total_models: merged.length,
      compact_entries: Object.keys(models).length,
      full_data_entries: Object.keys(fullData).length,
      intelligence_index_version: free.intelligenceIndexVersion ?? null,
      endpoints: [
        "/api/v2/data/llms/models",
        "/api/v2/language/models/free",
      ],
      compact_field_coverage: coverage,
      prompt_options: legacy.prompt_options || {},
    },
  };

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`✓ Wrote ${count} model entries to ${outPath}`);
  console.log(`✓ Compact entries: ${Object.keys(output.models).length}`);
  console.log(`✓ Full data entries: ${Object.keys(output.fullData).length}`);
  console.log(`✓ Coverage: int=${coverage.int} code=${coverage.code} agent=${coverage.agent}`);
  console.log(`✓ Intelligence index version: ${output.metadata.intelligence_index_version}`);
  console.log(`Updated: ${output.updated}`);
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
