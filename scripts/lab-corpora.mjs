// The lab capture corpora under captures/, one manifest each. Scenario directories share the
// captures/ root, so ids must be unique across corpora (see captures/README.md).
export const LAB_CORPORA = [
  {
    id: "v2",
    manifest: "manifest.json",
    repository: "nf/playground",
    runner: "run-scenario.mjs",
    probe: "scripts/lab-capture-dump-v1.js",
    collector: { kind: "chrome-devtools-mcp", interface: "generic-devtools", webMcpUsed: false },
    live: true,
    scenarios: [
      "clean-skip",
      "strict-split",
      "scope-isolation",
      "strict-scope",
      "scoped",
      "non-dense",
      "dynamic-init-native",
      "dynamic-init-shim",
      "dynamic-override",
      "self-fill",
      "co-declared-share",
      "pooling-anchor"
    ]
  },
  {
    id: "nf-lab",
    manifest: "manifest-nf-lab.json",
    repository: "native-federation/playground",
    runner: "lab/run-scenario.mjs",
    probe: "scripts/lab-capture-dump.js",
    collector: { kind: "playwright-cdp", interface: "headless-chromium", webMcpUsed: false },
    live: false,
    scenarios: [
      "dense-both",
      "dense-chunking-only",
      "dense-externals-only",
      "pool-portfolio",
      "pool-showcase",
      "pool-tag-anchored",
      "pool-tag-coherent",
      "pool-tag-islanded",
      "pool-tag-orphan"
    ]
  }
];

export const corpusById = (id) => {
  const corpus = LAB_CORPORA.find((entry) => entry.id === id);
  if (!corpus) throw new Error(`unknown corpus '${id}' (known: ${LAB_CORPORA.map((c) => c.id).join(", ")})`);
  return corpus;
};
