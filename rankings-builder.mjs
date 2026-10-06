import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

/**
 * Builds rankings.json from the Artificial Analysis language-model API.
 *
 * GET /api/v2/data/llms/models is retired on 2026-11-04 (responses become
 * 410 Gone). The supported replacements are:
 *   Pro:  GET /api/v2/language/models
 *   Free: GET /api/v2/language/models/free
 * Existing API keys still authenticate with the x-api-key header.
 */

export const API_ORIGIN = "https://artificialanalysis.ai";
export const PRO_ENDPOINT = "/api/v2/language/models";
export const FREE_ENDPOINT = "/api/v2/language/models/free";

/** Prompt presets from the Data API. `medium` matches the old 1,000-token default. */
export const PROMPT_PRESETS = {
  medium: { prompt_length: 1000, parallel_queries: 1 },
  long: { prompt_length: 10000, parallel_queries: 1 },
  "100k": { prompt_length: 100000, parallel_queries: 1 },
  vision_single_image: { prompt_length: 1000, parallel_queries: 1 },
  medium_coding: { prompt_length: 1000, parallel_queries: 1 },
  medium_parallel: { prompt_length: 1000, parallel_queries: 10 },
};

const MAX_PAGES = 100;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Historical model_creator.slug values. The language-model API no longer
 * returns a creator slug (free: id + name, pro: id + name + country).
 */
export const KNOWN_CREATOR_SLUGS = {
  "ai21 labs": "ai21-labs",
  ai9stars: "ai9star",
  alibaba: "alibaba",
  "allen institute for ai": "ai2",
  amazon: "aws",
  anthropic: "anthropic",
  apodex: "apodex",
  "arcee ai": "arcee",
  baidu: "baidu",
  "bytedance seed": "bytedance_seed",
  celeris: "celeris",
  "china mobile": "china-mobile",
  cohere: "cohere",
  databricks: "databricks",
  deepseek: "deepseek",
  google: "google",
  ibm: "ibm",
  inception: "inception",
  inclusionai: "inclusionai",
  "institute of foundation models": "ifm",
  kimi: "kimi",
  "korea telecom": "korea-telecom",
  kwaikat: "kwaikat",
  "lg ai research": "lg",
  "liquid ai": "liquidai",
  longcat: "longcat",
  meta: "meta",
  microsoft: "azure",
  minimax: "minimax",
  mistral: "mistral",
  "motif technologies": "motif-technologies",
  "multiverse computing": "multiversecomputing",
  nanbeige: "nanbeige",
  naver: "naver",
  "nex agi": "nex",
  "nous research": "nous-research",
  nvidia: "nvidia",
  openai: "openai",
  openbmb: "openbmb",
  openchat: "openchat",
  perplexity: "perplexity",
  "prime intellect": "prime-intellect",
  "reka ai": "reka-ai",
  sarvam: "sarvam",
  servicenow: "servicenow",
  "sk telecom": "sk-telecom",
  snowflake: "snowflake",
  spacexai: "xai",
  stepfun: "stepfun",
  "swiss ai initiative": "swiss-ai-initiative",
  tencent: "tencent",
  "thinking machines": "thinking-machines",
  "tii uae": "tii-uae",
  "trillion labs": "trillionlabs",
  upstage: "upstage",
  xiaomi: "xiaomi",
  "z ai": "zai",
};

const SUFFIXES = ["-preview", "-beta", "-exp", "-experimental", "-latest"];

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function slugifyCreator(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveCreatorSlug(model) {
  const creator = model?.model_creator;
  if (!creator) return null;
  if (typeof creator.slug === "string" && creator.slug.trim()) {
    return creator.slug.trim().toLowerCase();
  }
  const name = typeof creator.name === "string" ? creator.name.trim().toLowerCase() : "";
  if (name && KNOWN_CREATOR_SLUGS[name]) return KNOWN_CREATOR_SLUGS[name];
  const openRouterId = model.openrouter_api_id;
  if (typeof openRouterId === "string" && openRouterId.includes("/")) {
    const prefix = openRouterId.split("/")[0].trim().toLowerCase();
    if (prefix) return prefix;
  }
  if (name) return slugifyCreator(creator.name);
  return null;
}

export function compactScores(evaluations) {
  const entry = {};
  const int = evaluations?.artificial_analysis_intelligence_index;
  const code = evaluations?.artificial_analysis_coding_index;
  const agent = evaluations?.artificial_analysis_agentic_index;
  if (int != null && Number.isFinite(int)) entry.int = Math.round(int);
  if (code != null && Number.isFinite(code)) entry.code = Math.round(code);
  if (agent != null && Number.isFinite(agent)) entry.agent = Math.round(agent);
  return Object.keys(entry).length > 0 ? entry : null;
}

export function toFullRecord(model, creatorSlug) {
  const performance =
    model.performance && typeof model.performance === "object" ? model.performance : {};
  const creator = model.model_creator
    ? {
        id: model.model_creator.id,
        name: model.model_creator.name,
        ...(creatorSlug ? { slug: creatorSlug } : {}),
        ...(model.model_creator.country !== undefined
          ? { country: model.model_creator.country }
          : {}),
      }
    : model.model_creator ?? null;

  const record = {
    ...model,
    model_creator: creator,
  };

  if (performance.median_output_tokens_per_second !== undefined) {
    record.median_output_tokens_per_second = performance.median_output_tokens_per_second;
  }
  if (performance.median_time_to_first_token_seconds !== undefined) {
    record.median_time_to_first_token_seconds = performance.median_time_to_first_token_seconds;
  }
  const answer =
    performance.median_time_to_first_answer_token_seconds ??
    model.median_time_to_first_answer_token;
  if (answer !== undefined) {
    record.median_time_to_first_answer_token = answer;
  }
  if (performance.median_end_to_end_response_time_seconds !== undefined) {
    record.median_end_to_end_response_time_seconds =
      performance.median_end_to_end_response_time_seconds;
  }
  return record;
}

export function addCompactAliases(models, entry, { slug, creator, name, openrouterId }) {
  const orStyleSlug = slug.replace(/(\d)-(\d)/g, "$1.$2");

  if (creator) models[`${creator}/${slug}`] = entry;
  models[slug] = entry;
  if (name) models[name.toLowerCase()] = entry;

  if (creator === "zai") {
    models[`z-ai/${slug}`] = entry;
    const dotSlug = slug.replace(/(\d)-(\d)/g, "$1.$2");
    if (dotSlug !== slug) models[`z-ai/${dotSlug}`] = entry;
  }

  if (orStyleSlug !== slug) {
    if (creator) models[`${creator}/${orStyleSlug}`] = entry;
    models[orStyleSlug] = entry;
  }

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

  if (slug.includes("llama")) {
    const llamaDotSlug = slug.replace(/llama-(\d+)-(\d+)/g, "llama-$1.$2");
    if (llamaDotSlug !== slug) {
      if (creator) models[`${creator}/${llamaDotSlug}`] = entry;
      models[llamaDotSlug] = entry;
    }
  }

  const allSlugsForModel = new Set();
  if (creator) allSlugsForModel.add(`${creator}/${slug}`);
  allSlugsForModel.add(slug);
  if (orStyleSlug !== slug) {
    if (creator) allSlugsForModel.add(`${creator}/${orStyleSlug}`);
    allSlugsForModel.add(orStyleSlug);
  }

  for (const baseSlug of allSlugsForModel) {
    for (const suffix of SUFFIXES) {
      models[`${baseSlug}${suffix}`] = entry;
    }
  }

  if (typeof openrouterId === "string" && openrouterId.trim()) {
    const orId = openrouterId.trim().toLowerCase();
    models[orId] = entry;
    if (!allSlugsForModel.has(orId)) {
      for (const suffix of SUFFIXES) models[`${orId}${suffix}`] = entry;
    }
  }
}

export function buildRankings(apiModels, meta) {
  const models = {};
  const fullData = {};
  let count = 0;

  for (const model of apiModels || []) {
    const slug = model.slug?.toLowerCase();
    if (!slug) continue;

    const entry = compactScores(model.evaluations);
    if (!entry) continue;

    const creator = resolveCreatorSlug(model);
    if (creator) count += 1;

    addCompactAliases(models, entry, {
      slug,
      creator,
      name: model.name,
      openrouterId: model.openrouter_api_id,
    });

    const fullKey = creator ? `${creator}/${slug}` : slug;
    fullData[fullKey] = toFullRecord(model, creator);
  }

  return {
    models,
    fullData,
    updated: meta.updated,
    source: "Artificial Analysis API",
    attribution:
      "Rankings provided by Artificial Analysis (https://artificialanalysis.ai/). Please attribute per their terms.",
    count,
    metadata: {
      total_models: apiModels?.length || 0,
      compact_entries: Object.keys(models).length,
      full_data_entries: Object.keys(fullData).length,
      endpoint: meta.endpoint,
      tier: meta.tier ?? null,
      intelligence_index_version: meta.intelligenceIndexVersion ?? null,
      prompt_options: meta.promptOptions,
    },
  };
}

async function readBody(res) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function request(url, apiKey, fetchImpl, sleep) {
  let delay = 1000;
  let last = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchImpl(url, {
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
      },
    });
    last = res;
    if (!RETRY_STATUSES.has(res.status) || attempt === 3) break;
    await res.text().catch(() => {});
    await sleep(delay);
    delay *= 2;
  }
  const { text, json } = await readBody(last);
  return {
    status: last.status,
    statusText: last.statusText || "",
    text,
    json,
  };
}

function pageUrl(endpoint, page, promptType) {
  const url = new URL(endpoint, API_ORIGIN);
  url.searchParams.set("page", String(page));
  if (endpoint === PRO_ENDPOINT) url.searchParams.set("prompt_type", promptType);
  return url;
}

async function fetchPage({ endpoint, page, apiKey, promptType, fetchImpl, sleep }) {
  const url = pageUrl(endpoint, page, promptType);
  return request(url, apiKey, fetchImpl, sleep);
}

export async function fetchAllModels({
  apiKey,
  promptType,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
}) {
  if (!PROMPT_PRESETS[promptType]) {
    throw new Error(
      `Unsupported AA_PROMPT_TYPE "${promptType}". Expected one of: ${Object.keys(PROMPT_PRESETS).join(", ")}`,
    );
  }

  let endpoint = PRO_ENDPOINT;
  let first = await fetchPage({ endpoint, page: 1, apiKey, promptType, fetchImpl, sleep });
  if (first.status === 403) {
    endpoint = FREE_ENDPOINT;
    first = await fetchPage({ endpoint, page: 1, apiKey, promptType, fetchImpl, sleep });
  }
  if (first.status !== 200 || !first.json || !Array.isArray(first.json.data)) {
    const error = new Error(`AA fetch failed: ${first.status} ${first.statusText}`.trim());
    error.status = first.status;
    error.body = first.text?.slice(0, 2000);
    throw error;
  }

  const models = [...first.json.data];
  let page = 1;
  let hasMore = first.json.pagination?.has_more === true;
  while (hasMore) {
    page += 1;
    if (page > MAX_PAGES) {
      throw new Error(`AA pagination exceeded ${MAX_PAGES} pages`);
    }
    const next = await fetchPage({ endpoint, page, apiKey, promptType, fetchImpl, sleep });
    if (next.status !== 200 || !next.json || !Array.isArray(next.json.data)) {
      const error = new Error(
        `AA fetch failed on page ${page}: ${next.status} ${next.statusText}`.trim(),
      );
      error.status = next.status;
      error.body = next.text?.slice(0, 2000);
      throw error;
    }
    models.push(...next.json.data);
    hasMore = next.json.pagination?.has_more === true;
  }

  const promptOptions =
    endpoint === FREE_ENDPOINT
      ? { prompt_type: null, prompt_length: null, parallel_queries: null }
      : { prompt_type: promptType, ...PROMPT_PRESETS[promptType] };

  return {
    models,
    endpoint,
    tier: first.json.tier ?? null,
    intelligenceIndexVersion: first.json.intelligence_index_version ?? null,
    promptOptions,
    fellBackToFree: endpoint === FREE_ENDPOINT,
  };
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

async function main() {
  const apiKey = process.env.ARTIFICIAL_ANALYSIS_KEY;
  if (!apiKey) {
    console.error("ARTIFICIAL_ANALYSIS_KEY env var required");
    process.exit(1);
  }

  const promptType = process.env.AA_PROMPT_TYPE || "medium";
  if (!PROMPT_PRESETS[promptType]) {
    console.error(
      `Unsupported AA_PROMPT_TYPE "${promptType}". Expected one of: ${Object.keys(PROMPT_PRESETS).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(`Fetching Artificial Analysis language models (prompt_type=${promptType})...`);
  let result;
  try {
    result = await fetchAllModels({ apiKey, promptType });
  } catch (error) {
    console.error(error.message);
    if (error.body) console.error("Response:", error.body);
    process.exit(1);
  }

  if (result.fellBackToFree) {
    console.warn(
      "Pro endpoint /api/v2/language/models returned 403. Fell back to /api/v2/language/models/free. Per-benchmark scores, blended pricing, percentiles, and OpenRouter ids are omitted on the free tier.",
    );
  }

  console.log(
    `Received ${result.models.length} models from AA (tier=${result.tier ?? "unknown"}, intelligence_index_version=${result.intelligenceIndexVersion ?? "unknown"})`,
  );

  const output = buildRankings(result.models, {
    updated: new Date().toISOString().split("T")[0],
    endpoint: result.endpoint,
    tier: result.tier,
    intelligenceIndexVersion: result.intelligenceIndexVersion,
    promptOptions: result.promptOptions,
  });

  const outPath = "./rankings.json";
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`✓ Wrote ${output.count} model entries to ${outPath}`);
  console.log(`✓ Compact entries: ${output.metadata.compact_entries}`);
  console.log(`✓ Full data entries: ${output.metadata.full_data_entries}`);
  console.log(`✓ Endpoint: ${output.metadata.endpoint}`);
  console.log(`Updated: ${output.updated}`);
}

if (isMainModule()) {
  await main();
}
