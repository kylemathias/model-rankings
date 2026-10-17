import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_ENDPOINT,
  PRO_ENDPOINT,
  addCompactAliases,
  buildRankings,
  compactScores,
  fetchAllModels,
  resolveCreatorSlug,
  toFullRecord,
} from "./rankings-builder.mjs";

function jsonResponse(status, body) {
  const text = JSON.stringify(body);
  return {
    status,
    statusText: status === 200 ? "OK" : "ERR",
    async text() {
      return text;
    },
  };
}

function textResponse(status, text) {
  return {
    status,
    statusText: "ERR",
    async text() {
      return text;
    },
  };
}

const proModel = {
  id: "36f73aaf-d38a-4b56-a2b3-d04d17186910",
  name: "gpt-oss-20B (high)",
  slug: "gpt-oss-20b",
  release_date: "2025-08-05",
  model_creator: {
    id: "e67e56e3-15cd-43db-b679-da4660a69f41",
    name: "OpenAI",
    country: "us",
  },
  reasoning_model: true,
  evaluations: {
    artificial_analysis_intelligence_index: 24.5,
    artificial_analysis_coding_index: 18.5,
    artificial_analysis_agentic_index: 27.6,
    artificial_analysis_engineering_index: 11.7,
    gpqa_diamond: 0.69,
  },
  artificial_analysis_intelligence_index_cost: {
    total_cost: 20.69,
    cost_per_task: { total_cost: 0.1678 },
  },
  pricing: {
    price_1m_blended_3_to_1: 0.09,
    price_1m_blended_7_to_2_to_1: 0.04,
    price_1m_input_tokens: 0.06,
    price_1m_output_tokens: 0.2,
    price_1m_cache_hit_tokens: 0.015,
    price_1m_cache_write_tokens: 0.075,
  },
  performance: {
    median_output_tokens_per_second: 296.47,
    median_time_to_first_token_seconds: 0.65,
    median_time_to_first_answer_token_seconds: 7.4,
    median_end_to_end_response_time_seconds: 9.09,
    percentile_95_output_tokens_per_second: 858.3,
  },
  context_window_tokens: 131072,
  parameters: { total: 21, active: 4 },
  licensing: { is_open_weights: true },
  huggingface_url: "https://huggingface.co/openai/gpt-oss-20b",
  openrouter_api_id: "openai/gpt-oss-20b",
};

test("compact scores round headline indexes and keep agent", () => {
  assert.deepEqual(compactScores(proModel.evaluations), { int: 25, code: 19, agent: 28 });
  assert.equal(compactScores({ artificial_analysis_intelligence_index: null }), null);
  assert.deepEqual(compactScores({ artificial_analysis_agentic_index: 0 }), { agent: 0 });
});

test("creator slugs stay compatible with the previous file", () => {
  assert.equal(resolveCreatorSlug({ model_creator: { name: "Z AI" } }), "zai");
  assert.equal(resolveCreatorSlug({ model_creator: { name: "Microsoft" } }), "azure");
  assert.equal(resolveCreatorSlug({ model_creator: { name: "SpaceXAI" } }), "xai");
  assert.equal(resolveCreatorSlug({ model_creator: { name: "Amazon" } }), "aws");
  assert.equal(
    resolveCreatorSlug({ model_creator: { slug: "Custom-Lab", name: "Microsoft" } }),
    "custom-lab",
  );
  assert.equal(
    resolveCreatorSlug({
      model_creator: { name: "New Lab" },
      openrouter_api_id: "newlab/model-1",
    }),
    "newlab",
  );
  assert.equal(resolveCreatorSlug({ model_creator: { name: "Example Labs" } }), "example-labs");
});

test("full records flatten nested performance and restore creator slug", () => {
  const record = toFullRecord(proModel, "openai");
  assert.equal(record.model_creator.slug, "openai");
  assert.equal(record.model_creator.country, "us");
  assert.equal(record.median_output_tokens_per_second, 296.47);
  assert.equal(record.median_time_to_first_token_seconds, 0.65);
  assert.equal(record.median_time_to_first_answer_token, 7.4);
  assert.equal(record.median_end_to_end_response_time_seconds, 9.09);
  assert.equal(record.performance.percentile_95_output_tokens_per_second, 858.3);
  assert.equal(record.openrouter_api_id, "openai/gpt-oss-20b");
  assert.equal(record.context_window_tokens, 131072);
  assert.equal(record.pricing.price_1m_cache_hit_tokens, 0.015);
  assert.equal(record.evaluations.gpqa_diamond, 0.69);
});

test("aliases cover creator keys, digit dots, z.ai, nvidia, and OpenRouter ids", () => {
  const models = {};
  const entry = { int: 10, code: 9, agent: 8 };
  addCompactAliases(models, entry, {
    slug: "glm-4-6",
    creator: "zai",
    name: "GLM 4.6",
    openrouterId: "z-ai/glm-4.6",
  });
  assert.equal(models["zai/glm-4-6"], entry);
  assert.equal(models["z-ai/glm-4-6"], entry);
  assert.equal(models["zai/glm-4.6"], entry);
  assert.equal(models["glm-4.6-preview"], entry);

  const nvidia = {};
  addCompactAliases(nvidia, entry, {
    slug: "nvidia-nemotron-70b",
    creator: "nvidia",
    name: "Nemotron 70B",
    openrouterId: null,
  });
  assert.equal(nvidia["nvidia/nemotron-70b"], entry);
  assert.equal(nvidia["nemotron-70b"], entry);

  const llama = {};
  addCompactAliases(llama, entry, {
    slug: "llama-3-1-70b",
    creator: "meta",
    name: "Llama 3.1 70B",
    openrouterId: "meta-llama/llama-3.1-70b",
  });
  assert.equal(llama["meta/llama-3.1-70b"], entry);
  assert.equal(llama["meta-llama/llama-3.1-70b"], entry);
});

test("buildRankings keeps lookup shape and records new metadata", () => {
  const output = buildRankings(
    [
      proModel,
      {
        name: "Unscored",
        slug: "unscored",
        model_creator: { name: "OpenAI" },
        evaluations: {
          artificial_analysis_intelligence_index: null,
          artificial_analysis_coding_index: null,
          artificial_analysis_agentic_index: null,
        },
      },
    ],
    {
      updated: "2026-10-06",
      endpoint: PRO_ENDPOINT,
      tier: "pro",
      intelligenceIndexVersion: 4.3,
      promptOptions: { prompt_type: "medium", prompt_length: 1000, parallel_queries: 1 },
    },
  );

  assert.equal(output.count, 1);
  assert.deepEqual(output.models["openai/gpt-oss-20b"], { int: 25, code: 19, agent: 28 });
  assert.equal(output.models["unscored"], undefined);
  assert.equal(output.fullData["openai/gpt-oss-20b"].reasoning_model, true);
  assert.equal(output.fullData.unscored, undefined);
  assert.equal(output.metadata.endpoint, PRO_ENDPOINT);
  assert.equal(output.metadata.tier, "pro");
  assert.equal(output.metadata.intelligence_index_version, 4.3);
  assert.equal(output.metadata.total_models, 2);
  assert.equal(output.metadata.full_data_entries, 1);
  assert.equal(output.metadata.prompt_options.prompt_length, 1000);
});

test("pro list is paginated and sends prompt_type", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const page = new URL(url).searchParams.get("page");
    if (page === "1") {
      return jsonResponse(200, {
        tier: "pro",
        intelligence_index_version: 4.3,
        pagination: { page: 1, page_size: 1, total_pages: 2, has_more: true },
        data: [proModel],
      });
    }
    return jsonResponse(200, {
      tier: "pro",
      intelligence_index_version: 4.3,
      pagination: { page: 2, page_size: 1, total_pages: 2, has_more: false },
      data: [
        {
          ...proModel,
          slug: "gpt-oss-120b",
          name: "gpt-oss-120B",
          openrouter_api_id: "openai/gpt-oss-120b",
        },
      ],
    });
  };

  const result = await fetchAllModels({
    apiKey: "test-key",
    promptType: "medium",
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.models.length, 2);
  assert.equal(result.endpoint, PRO_ENDPOINT);
  assert.equal(result.fellBackToFree, false);
  assert.equal(result.promptOptions.prompt_type, "medium");
  assert.equal(result.promptOptions.prompt_length, 1000);
  assert.deepEqual(
    calls,
    [
      "https://artificialanalysis.ai/api/v2/language/models?page=1&prompt_type=medium",
      "https://artificialanalysis.ai/api/v2/language/models?page=2&prompt_type=medium",
    ],
  );
});

test("403 on the pro endpoint falls back to the free list without prompt_type", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), key: init.headers["x-api-key"] });
    if (String(url).includes("/language/models/free")) {
      return jsonResponse(200, {
        tier: "free",
        intelligence_index_version: 4.3,
        pagination: { page: 1, page_size: 200, total_pages: 1, has_more: false },
        data: [
          {
            id: "1",
            name: "Claude",
            slug: "claude",
            model_creator: { id: "c", name: "Anthropic" },
            evaluations: {
              artificial_analysis_intelligence_index: 50,
              artificial_analysis_coding_index: 40,
              artificial_analysis_agentic_index: 45,
            },
            pricing: { price_1m_input_tokens: 3, price_1m_output_tokens: 15 },
            performance: { median_output_tokens_per_second: 80 },
          },
        ],
      });
    }
    return jsonResponse(403, { error: "subscription" });
  };

  const result = await fetchAllModels({
    apiKey: "free-key",
    promptType: "long",
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.fellBackToFree, true);
  assert.equal(result.endpoint, FREE_ENDPOINT);
  assert.equal(result.tier, "free");
  assert.equal(result.promptOptions.prompt_type, null);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, "free-key");
  assert.match(calls[1].url, /\/api\/v2\/language\/models\/free\?page=1$/);
  assert.doesNotMatch(calls[1].url, /prompt_type/);
});

test("retries a 500 once and does not fall back on 401", async () => {
  let proCalls = 0;
  const fetchImpl = async () => {
    proCalls += 1;
    if (proCalls === 1) return textResponse(500, "temporary");
    return jsonResponse(200, {
      tier: "pro",
      intelligence_index_version: 4.1,
      pagination: { has_more: false },
      data: [],
    });
  };

  const slept = [];
  const result = await fetchAllModels({
    apiKey: "k",
    promptType: "medium",
    fetchImpl,
    sleep: async (ms) => slept.push(ms),
  });
  assert.equal(result.models.length, 0);
  assert.deepEqual(slept, [1000]);
  assert.equal(proCalls, 2);

  const unauthorized = [];
  await assert.rejects(
    () =>
      fetchAllModels({
        apiKey: "k",
        promptType: "medium",
        fetchImpl: async (url) => {
          unauthorized.push(String(url));
          return textResponse(401, "bad key");
        },
        sleep: async () => {},
      }),
    /401/,
  );
  assert.deepEqual(unauthorized, [
    "https://artificialanalysis.ai/api/v2/language/models?page=1&prompt_type=medium",
  ]);
});
