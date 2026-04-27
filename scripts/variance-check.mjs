// Re-runs every fixture in tests/fixtures/sessions/ N times in
// parallel batches, then prints a per-fixture variance summary so
// we can see how much the v7 rubric jitters across runs.
//
// Usage:
//   node --env-file=.env.local scripts/variance-check.mjs        # default N=3
//   node --env-file=.env.local scripts/variance-check.mjs 5      # N=5
//
// Concurrency is capped at 4 to stay polite to the OpenAI rate
// limits without dragging on too long. Each run still leaves rows
// in dev under fixture_test_user_v5a.

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const N = Number.parseInt(process.argv[2] ?? "3", 10);
const CONCURRENCY = 4;
const FIXTURE_DIR = "tests/fixtures/sessions";

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

console.log(
  `Running ${fixtures.length} fixtures × ${N} = ${fixtures.length * N} total runs at concurrency ${CONCURRENCY}…\n`,
);

const jobs = [];
for (const f of fixtures) {
  for (let i = 1; i <= N; i++) {
    jobs.push({ fixture: f, run: i });
  }
}

const results = [];

function parseSignals(stdout, stderr) {
  const all = stdout + "\n" + stderr;
  const sessionMatch = all.match(/Created session ([0-9a-f-]+)/);
  const scoresMatch = all.match(
    /scores:\s+self_disclosure=(\d+) cognitive_shift=(\d+) emotional_integration=(\d+) novelty=(\d+)/,
  );
  const themesMatch = all.match(/Themes \((\d+)\)/);
  const shiftsMatch = all.match(/Mindset shifts \((\d+)\)/);
  const btsMatch = all.match(/Breakthroughs \((\d+)\)/);
  const traumaMatch = all.match(/trauma_triggered:\s+(true|false)/);

  // Per-theme intensities — capture every "intensity=N" inside the Themes section.
  const themesSection = all
    .split("=== Themes")[1]
    ?.split("=== Mindset")[0] ?? "";
  const intensities = [
    ...themesSection.matchAll(/intensity=(\d+)/g),
  ].map((m) => Number(m[1]));

  // Per-theme directions
  const directions = [
    ...themesSection.matchAll(/direction=(\w+)/g),
  ].map((m) => m[1]);

  return {
    sessionId: sessionMatch?.[1] ?? null,
    scores: scoresMatch
      ? scoresMatch.slice(1, 5).map(Number)
      : null,
    themesCount: themesMatch ? Number(themesMatch[1]) : null,
    shiftsCount: shiftsMatch ? Number(shiftsMatch[1]) : null,
    btsCount: btsMatch ? Number(btsMatch[1]) : null,
    traumaTriggered: traumaMatch ? traumaMatch[1] === "true" : null,
    intensities,
    directions,
    failed: all.includes("!! ") || all.includes("Fatal:"),
  };
}

async function runJob(job) {
  return new Promise((resolve) => {
    const fixturePath = path.join(FIXTURE_DIR, job.fixture);
    const t0 = Date.now();
    const proc = spawn(
      "node",
      ["--env-file=.env.local", "scripts/run-fixture.mjs", fixturePath],
      { stdio: "pipe" },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", () => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const signals = parseSignals(stdout, stderr);
      const result = { ...job, elapsedS: Number(elapsed), ...signals };
      results.push(result);
      const flag = signals.failed ? "❌" : "✓";
      console.log(
        `  ${flag} ${job.fixture} run ${job.run}/${N} (${elapsed}s) — themes=${signals.themesCount} shifts=${signals.shiftsCount} bts=${signals.btsCount} scores=${signals.scores?.join("/") ?? "?"} trauma=${signals.traumaTriggered}`,
      );
      resolve();
    });
    proc.on("error", (err) => {
      console.error(`  ❌ ${job.fixture} run ${job.run} spawn error:`, err.message);
      results.push({ ...job, failed: true, spawnError: err.message });
      resolve();
    });
  });
}

// Worker pool — cooperative pull from a shared queue.
const queue = [...jobs];
const workers = [];
for (let w = 0; w < CONCURRENCY; w++) {
  workers.push(
    (async () => {
      while (queue.length) {
        const job = queue.shift();
        if (job) await runJob(job);
      }
    })(),
  );
}
await Promise.all(workers);

// ---------------------------------------------------------------
// Variance summary
// ---------------------------------------------------------------
console.log("\n=== VARIANCE SUMMARY ===\n");
const byFixture = {};
for (const r of results) {
  if (!byFixture[r.fixture]) byFixture[r.fixture] = [];
  byFixture[r.fixture].push(r);
}

function range(arr) {
  if (!arr.length) return "—";
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  return min === max ? `${min}` : `${min}-${max}`;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

for (const [fixture, runs] of Object.entries(byFixture).sort()) {
  console.log(`▸ ${fixture}`);
  const themes = runs.map((r) => r.themesCount).filter((v) => v != null);
  const shifts = runs.map((r) => r.shiftsCount).filter((v) => v != null);
  const bts = runs.map((r) => r.btsCount).filter((v) => v != null);
  console.log(
    `    themes count:  [${themes.join(", ")}]  range=${range(themes)}  σ=${stdev(themes).toFixed(2)}`,
  );
  console.log(
    `    shifts count:  [${shifts.join(", ")}]  range=${range(shifts)}  σ=${stdev(shifts).toFixed(2)}`,
  );
  console.log(
    `    bts count:     [${bts.join(", ")}]  range=${range(bts)}  σ=${stdev(bts).toFixed(2)}`,
  );

  // Score variance per dimension
  const scores = runs.map((r) => r.scores).filter(Boolean);
  if (scores.length) {
    const labels = ["self_disc", "cog_shift", "emot_int", "novelty"];
    for (let i = 0; i < 4; i++) {
      const col = scores.map((s) => s[i]);
      console.log(
        `    ${labels[i].padEnd(10)}:    [${col.join(", ")}]  range=${range(col)}  σ=${stdev(col).toFixed(2)}`,
      );
    }
  }

  // Per-theme intensities aggregated across runs
  const allIntensities = runs.flatMap((r) => r.intensities ?? []);
  if (allIntensities.length) {
    console.log(
      `    intensities (all themes across all runs): range=${range(allIntensities)}  count=${allIntensities.length}`,
    );
  }
  console.log("");
}

const failed = results.filter((r) => r.failed);
if (failed.length) {
  console.log(`\n!! ${failed.length} runs failed:`);
  for (const f of failed) {
    console.log(`   ${f.fixture} run ${f.run}: ${f.spawnError ?? "see stdout"}`);
  }
}

const totalElapsed = results.reduce((a, r) => a + (r.elapsedS ?? 0), 0);
console.log(
  `\nTotal: ${results.length} runs, ~$${(results.length * 0.05).toFixed(2)} OpenAI cost, ${(totalElapsed / 60).toFixed(1)} min wall-clock equivalent.`,
);
