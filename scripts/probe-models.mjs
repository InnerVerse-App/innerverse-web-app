// One-off probe: send a tiny call to each model string our app uses
// and print the `model` field returned in the response. That field
// tells us what OpenAI actually routed the request to, regardless of
// what name we asked for. Useful when a model is "retired" — we want
// to see if the old string resolves to a current snapshot.
//
// Usage: node --env-file=.env.local scripts/probe-models.mjs

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STRINGS = ["gpt-5", "gpt-5.2", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"];

async function probe(modelString) {
  try {
    const r = await openai.responses.create({
      model: modelString,
      input: [{ role: "user", content: "ping" }],
      max_output_tokens: 16,
    });
    console.log(
      `requested=${modelString}  actual=${r.model}  status=${r.status}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`requested=${modelString}  ERROR: ${msg.slice(0, 200)}`);
  }
}

for (const s of STRINGS) await probe(s);
