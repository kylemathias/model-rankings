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
let count = 0;

for (const m of aa.data || []) {
  const slug = m.slug?.toLowerCase();
  const creator = m.model_creator?.slug?.toLowerCase();
  const int = m.evaluations?.artificial_analysis_intelligence_index ?? null;
  const code = m.evaluations?.artificial_analysis_coding_index ?? null;
  
  if (!slug) continue;
  
  const entry = {};
  if (int != null && Number.isFinite(int)) entry.int = Math.round(int);
  if (code != null && Number.isFinite(code)) entry.code = Math.round(code);
  
  if (Object.keys(entry).length === 0) continue;
  
  // Store under multiple keys for flexible matching
  if (creator) {
    models[`${creator}/${slug}`] = entry;
    count++;
  }
  models[slug] = entry;
  if (m.name) models[m.name.toLowerCase()] = entry;
  count++;
}

const output = {
  models,
  updated: new Date().toISOString().split("T")[0],
  source: "Artificial Analysis API",
  attribution: "Rankings provided by Artificial Analysis (https://artificialanalysis.ai/). Please attribute per their terms.",
  count: count
};

await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
console.log(`✓ Wrote ${count} model entries to ${outPath}`);
console.log(`Updated: ${output.updated}`);
