import fs from "node:fs/promises";

const AA_KEY = process.env.ARTIFICIAL_ANALYSIS_KEY;
if (!AA_KEY) {
  console.error("ARTIFICIAL_ANALYSIS_KEY env var required");
  process.exit(1);
}

const outPath = "./rankings.json";

console.log("Fetching Artificial Analysis data...");
const res = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
  headers: { "x-api-key": AA_KEY },
});

if (!res.ok) {
  console.error(`AA fetch failed: ${res.status} ${res.statusText}`);
  const body = await res.text().catch(() => "<unreadable>");
  console.error("Response:", body);
  process.exit(1);
}

const aa = await res.json();
console.log(`Received ${aa.data?.length || 0} models from AA`);

const models = {};
const fullData = {};
let count = 0;

for (const m of aa.data || []) {
  const slug = m.slug?.toLowerCase();
  const creator = m.model_creator?.slug?.toLowerCase();
  const int = m.evaluations?.artificial_analysis_intelligence_index ?? null;
  const code = m.evaluations?.artificial_analysis_coding_index ?? null;
  
  if (!slug) continue;
  
  // Compact entry for matching (just scores)
  const entry = {};
  if (int != null && Number.isFinite(int)) entry.int = Math.round(int);
  if (code != null && Number.isFinite(code)) entry.code = Math.round(code);
  
  if (Object.keys(entry).length === 0) continue;
  
  // Store compact entry under multiple keys for flexible matching
  if (creator) {
    models[`${creator}/${slug}`] = entry;
    count++;
  }
  models[slug] = entry;
  if (m.name) models[m.name.toLowerCase()] = entry;
  
  // Handle Z.AI naming: AA uses "zai" but OpenRouter uses "z-ai"
  // Create aliases with hyphenated creator
  if (creator === 'zai') {
    models[`z-ai/${slug}`] = entry;
    // Also create versions with dots for version numbers
    const dotSlug = slug.replace(/(\d)-(\d)/g, "$1.$2");
    if (dotSlug !== slug) {
      models[`z-ai/${dotSlug}`] = entry;
    }
  }
  
  // Also store with OpenRouter-style IDs (hyphens → dots between digits)
  // e.g., "gpt-5-2" → "gpt-5.2" so OpenRouter lookups work directly
  const orStyleSlug = slug.replace(/(\d)-(\d)/g, "$1.$2");
  if (orStyleSlug !== slug) {
    if (creator) models[`${creator}/${orStyleSlug}`] = entry;
    models[orStyleSlug] = entry;
  }
  
  // Handle NVIDIA naming: AA uses "nvidia-nemotron-*" but OpenRouter uses "nemotron-*"
  // Create aliases without the redundant "nvidia-" prefix
  if (creator === 'nvidia' && slug.startsWith('nvidia-')) {
    const orNvidiaSlug = slug.replace(/^nvidia-/, '');
    models[`${creator}/${orNvidiaSlug}`] = entry;
    models[orNvidiaSlug] = entry;
    // Also with dots for version numbers
    const orNvidiaSlugDots = orNvidiaSlug.replace(/(\d)-(\d)/g, "$1.$2");
    if (orNvidiaSlugDots !== orNvidiaSlug) {
      models[`${creator}/${orNvidiaSlugDots}`] = entry;
      models[orNvidiaSlugDots] = entry;
    }
  }
  
  // Handle Llama naming differences: AA uses "llama-3-1-*" but OpenRouter uses "llama-3.1-*"
  // and sometimes different word order (e.g., "nemotron-instruct-70b" vs "nemotron-70b-instruct")
  if (slug.includes('llama')) {
    // Create dot-style version: llama-3-1 → llama-3.1
    const llamaDotSlug = slug.replace(/llama-(\d+)-(\d+)/g, 'llama-$1.$2');
    if (llamaDotSlug !== slug) {
      if (creator) models[`${creator}/${llamaDotSlug}`] = entry;
      models[llamaDotSlug] = entry;
    }
  }
  
  // Generate common suffix variants (-preview, -beta, -exp, -experimental, -latest)
  // OpenRouter often appends these suffixes to model IDs that AA doesn't have
  const suffixes = ['-preview', '-beta', '-exp', '-experimental', '-latest'];
  const allSlugsForModel = new Set();
  
  // Collect all slug variants we've created so far for this model
  if (creator) allSlugsForModel.add(`${creator}/${slug}`);
  allSlugsForModel.add(slug);
  if (orStyleSlug !== slug) {
    if (creator) allSlugsForModel.add(`${creator}/${orStyleSlug}`);
    allSlugsForModel.add(orStyleSlug);
  }
  
  // Add suffix variants for each base slug
  for (const baseSlug of [...allSlugsForModel]) {
    for (const suffix of suffixes) {
      models[`${baseSlug}${suffix}`] = entry;
    }
  }
  
  // Store complete AA data for reference
  const fullKey = creator ? `${creator}/${slug}` : slug;
  fullData[fullKey] = {
    name: m.name,
    slug: m.slug,
    model_creator: m.model_creator,
    evaluations: m.evaluations,
    pricing: m.pricing,
    median_output_tokens_per_second: m.median_output_tokens_per_second,
    median_time_to_first_token_seconds: m.median_time_to_first_token_seconds,
    median_time_to_first_answer_token: m.median_time_to_first_answer_token,
    // Include any other fields AA provides
    ...Object.fromEntries(
      Object.entries(m).filter(([key]) => 
        !['name', 'slug', 'model_creator', 'evaluations', 'pricing', 
          'median_output_tokens_per_second', 'median_time_to_first_token_seconds', 
          'median_time_to_first_answer_token'].includes(key)
      )
    )
  };
}

const output = {
  models,
  fullData,
  updated: new Date().toISOString().split("T")[0],
  source: "Artificial Analysis API",
  attribution: "Rankings provided by Artificial Analysis (https://artificialanalysis.ai/). Please attribute per their terms.",
  count: count,
  metadata: {
    total_models: aa.data?.length || 0,
    compact_entries: Object.keys(models).length,
    full_data_entries: Object.keys(fullData).length,
    prompt_options: aa.prompt_options || {}
  }
};

await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
console.log(`✓ Wrote ${count} model entries to ${outPath}`);
console.log(`✓ Compact entries: ${Object.keys(output.models).length}`);
console.log(`✓ Full data entries: ${Object.keys(output.fullData).length}`);
console.log(`Updated: ${output.updated}`);
