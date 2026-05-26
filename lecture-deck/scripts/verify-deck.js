#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const outputDir = path.join(root, ".deck-quality");
const validationResultPath = path.join(outputDir, "validation-result.json");
const results = [];
const KEYFRAME_ALLOWED_PROPERTIES = new Set(["opacity", "transform"]);
const MOTION_SPEC_REQUIRED_FIELDS = ["type", "mood", "sequence", "loop", "reducedMotion"];
const MOTION_TOKEN_NAMES = [
  "--motion-fast",
  "--motion-medium",
  "--motion-slow",
  "--motion-rise",
  "--motion-scale-start",
  "--delay-step",
  "--delay-nudge",
  "--ease-calm"
];
const MOTION_RECIPE_NAMES = [
  "card-place",
  "rail-grow",
  "ink-settle",
  "passkey-step-in",
  "passkey-rail-in"
];
const MIN_RESEARCH_SOURCE_COUNT = 8;
const MIN_DOC_SOURCE_COUNT = 5;
const MIN_VISUAL_ARCHETYPE_UNIQUE_COUNT = 5;
const MIN_VISUAL_FORM_UNIQUE_COUNT = 5;
const MAX_VISUAL_ARCHETYPE_SHARE = 0.35;
const MAX_VISUAL_FORM_SHARE = 0.35;
const MAX_ANIMATED_SLIDE_SHARE = 0.5;
const ASSET_DECISION_MODES = new Set([
  "official-image",
  "local-raster",
  "lucide-html-css",
  "css-module",
  "none"
]);
const SINGLE_OBJECT_VISUAL_FORMS = new Set(["evidence-image"]);
const DEFAULT_TRUSTED_RESEARCH_HOSTS = [];
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.slice("--mode=".length) : "all";
const validModes = new Set(["all", "harness", "render"]);

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
}

function writeValidationResult() {
  const failures = results.filter((result) => !result.ok).length;
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    status: failures > 0 ? "fail" : "pass",
    summary: {
      total: results.length,
      passes: results.length - failures,
      failures
    },
    results: results.map((result) => ({
      ok: result.ok,
      name: result.name,
      detail: result.detail || ""
    }))
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(validationResultPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function getSpec() {
  if (!fileExists("slide-spec.json")) {
    throw new Error("slide-spec.json is missing; create source.md first, then propose and approve slide-spec.json");
  }
  const spec = JSON.parse(readText("slide-spec.json"));
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    throw new Error("slide-spec.json must include a non-empty slides array");
  }
  return spec;
}

function getCurrentRun() {
  if (!fileExists("current-run.json")) {
    return {};
  }
  try {
    return JSON.parse(readText("current-run.json"));
  } catch {
    return {};
  }
}

function extractLocalReferences(relativePath, text) {
  const references = [];
  const attrPattern = /\b(?:href|src)=["']([^"']+)["']/g;
  const cssPattern = /url\(["']?([^"')]+)["']?\)/g;

  for (const pattern of [attrPattern, cssPattern]) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = match[1].trim();
      if (!value || value.startsWith("#") || /^(https?:|mailto:|tel:|data:|javascript:)/.test(value)) {
        continue;
      }
      references.push({
        from: relativePath,
        target: value.split("#")[0].split("?")[0]
      });
    }
  }

  return references;
}

function walkFiles(dir) {
  const entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(relativePath);
    }
    return relativePath;
  });
}

function removeCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractKeyframeBlocks(css) {
  const blocks = [];
  const pattern = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{/g;
  let match;

  while ((match = pattern.exec(css))) {
    const name = match[1];
    let index = pattern.lastIndex;
    let depth = 1;

    while (index < css.length && depth > 0) {
      const char = css[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      index += 1;
    }

    if (depth === 0) {
      blocks.push({
        name,
        content: css.slice(pattern.lastIndex, index - 1)
      });
    }

    pattern.lastIndex = index;
  }

  return blocks;
}

function runStaticChecks(spec) {
  const files = [
    "source.md",
    "current-run.json",
    "prompt-layer.md",
    "tool-layer.md",
    "tool-policy.json",
    "screenshot-review.md",
    "agent-handoff.schema.json",
    "harness-improvement.schema.json",
    "design.md",
    "motion.md",
    "slide-spec.json",
    "CLAUDE.md",
    "few-shots.md",
    "HANDOFF.md",
    "skills/deck-builder/SKILL.md",
    "agents/researcher.md",
    "agents/asset-researcher.md",
    "agents/contract-validator.md",
    "agents/slide-reviewer.md",
    "agents/visual-reviewer.md",
    "hooks/agent-contract-check.json",
    "hooks/verify-deck.json",
    "hooks/harness-check.json",
    "hooks/render-check.json",
    "hooks/regression-gate.json",
    "scripts/asset-acquisition.js",
    "scripts/compact-quality-reports.js",
    "scripts/verify-deck.js",
    "scripts/verify-agent-contracts.js",
    "scripts/verify-harness-backlog.js",
    "scripts/export-starter.js",
    "scripts/route-failure.js",
    "scripts/route-failure-policy-check.js",
    "scripts/regression-gate.js",
    "scripts/workflow-trace.js",
    "examples/agent-adapter/mock-agent.js",
    "examples/agent-adapter/README.md",
    "evaluation-template.md",
    "deck.html",
    "presenter-review.html",
    "assets/style.css",
    "assets/visuals.css",
    "assets/slides.js",
    "assets/deck.js",
    "assets/presenter-review.js",
    "assets/illustrations/manifest.schema.json",
    "assets/illustrations/manifest.json",
    ...spec.slides.map((slide) => slide.file)
  ];

  const missing = files.filter((file) => !fileExists(file));
  if (missing.length) {
    fail("missing files", missing.join(", "));
  } else {
    pass("missing files", `${files.length} required files found`);
  }

  pass("slide count", `${spec.slides.length} slides in slide-spec.json`);

  const invalidSlides = spec.slides.filter((slide) => {
    return !slide.id || !slide.file || !slide.title || !slide.message || !slide.visual || !slide.speakerNote || !Array.isArray(slide.evidence);
  });

  if (invalidSlides.length) {
    fail("slide spec shape", invalidSlides.map((slide) => slide.id || slide.file || "unknown").join(", "));
  } else {
    pass("slide spec shape", `${spec.slides.length} slides`);
  }

  const allHtmlAndCss = walkFiles(".").filter((file) => /\.(html|css)$/.test(file));
  const brokenLinks = [];

  allHtmlAndCss.forEach((file) => {
    const text = readText(file);
    extractLocalReferences(file, text).forEach((reference) => {
      const targetPath = path.normalize(path.join(path.dirname(reference.from), reference.target));
      if (!fileExists(targetPath)) {
        brokenLinks.push(`${reference.from} -> ${reference.target}`);
      }
    });
  });

  if (brokenLinks.length) {
    fail("broken links", brokenLinks.join("; "));
  } else {
    pass("broken links", "0 broken local references");
  }
}

function hasAllSections(text, sections) {
  return sections.filter((section) => !text.includes(section));
}

function runLayerContractChecks() {
  const contracts = [
    {
      file: "prompt-layer.md",
      name: "prompt layer contract",
      sections: [
        "## Purpose",
        "## Required Run Brief",
        "## Promotion Rules",
        "## Generation Gate"
      ],
      requiredTerms: [
        "Topic",
        "Outcome",
        "Scope",
        "Research Need",
        "Output Reset",
        "Validation Bar",
        "CLAUDE.md",
        ".codex/skills",
        "hooks/*.json"
      ]
    },
    {
      file: "tool-layer.md",
      name: "tool layer contract",
      sections: [
        "## Purpose",
        "## Tool Boundaries",
        "## Required Evidence Of Tool Use",
        "## Failure Rule"
      ],
      requiredTerms: [
        "Web Research",
        "Browser And Screenshot Inspection",
        "Local Scripts",
        "MCP And Agent Tools",
        "source.md",
        "slide-spec.json",
        "visual-quality-report.md",
        "quality-remediation-plan.json"
      ]
    },
    {
      file: "screenshot-review.md",
      name: "screenshot review contract",
      sections: [
        "## Purpose",
        "## Required Screenshot Set",
        "## Pass Bar",
        "## Failure Routing",
        "## Non-Negotiable Rule"
      ],
      requiredTerms: [
        "desktop",
        "mobile",
        "presenter-review",
        "contrast",
        "Korean text",
        "importanceMap",
        "visualForm",
        "motionPlan",
        "harness defect"
      ]
    }
  ];

  contracts.forEach((contract) => {
    if (!fileExists(contract.file)) {
      fail(contract.name, `${contract.file} is missing`);
      return;
    }

    const text = readText(contract.file);
    const missingSections = hasAllSections(text, contract.sections);
    const missingTerms = contract.requiredTerms.filter((term) => !text.includes(term));

    if (missingSections.length || missingTerms.length) {
      fail(contract.name, [
        missingSections.length ? `missing sections: ${missingSections.join(", ")}` : "",
        missingTerms.length ? `missing terms: ${missingTerms.join(", ")}` : ""
      ].filter(Boolean).join("; "));
    } else {
      pass(contract.name, `${contract.file} includes required layer contract`);
    }
  });
}

function getUrls(text) {
  return [...new Set([...text.matchAll(/https?:\/\/[^\s)\]>"']+/g)].map((match) => {
    return match[0].replace(/[.,;:]+$/, "");
  }))];
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isTrustedResearchUrl(url) {
  const currentRun = getCurrentRun();
  const trustedHosts = currentRun.researchNeed?.trustedHosts || DEFAULT_TRUSTED_RESEARCH_HOSTS;
  if (!Array.isArray(trustedHosts) || trustedHosts.length === 0) {
    return true;
  }
  const hostname = getHostname(url);
  return trustedHosts.some((trustedHost) => {
    return hostname === trustedHost || hostname.endsWith(`.${trustedHost}`);
  });
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function runResearchQualityChecks(spec) {
  const source = readText("source.md");
  const currentRun = getCurrentRun();
  const researchNeed = currentRun.researchNeed || {};
  const minimumTrustedUrls = Number.isInteger(researchNeed.minimumTrustedUrls)
    ? researchNeed.minimumTrustedUrls
    : MIN_RESEARCH_SOURCE_COUNT;
  const minimumOfficialDocs = Number.isInteger(researchNeed.minimumOfficialDocs)
    ? researchNeed.minimumOfficialDocs
    : MIN_DOC_SOURCE_COUNT;
  const officialDocHosts = Array.isArray(researchNeed.officialDocHosts)
    ? researchNeed.officialDocHosts
    : [];
  const requiredSections = [
    "## Evidence list",
    "## Research selection notes",
    "## Image candidates",
    "## Image and asset decisions",
    "## Slide-visible claims",
    "## Speaker-note context",
    "## Unresolved risks"
  ];
  const missingSections = requiredSections.filter((section) => !source.includes(section));
  if (missingSections.length) {
    fail("research source sections", missingSections.join(", "));
  } else {
    pass("research source sections", `${requiredSections.length} required sections found`);
  }

  const sourceUrls = getUrls(source);
  const trustedUrls = sourceUrls.filter(isTrustedResearchUrl);
  const docUrls = sourceUrls.filter((url) => {
    const hostname = getHostname(url);
    return officialDocHosts.some((docHost) => hostname === docHost || hostname.endsWith(`.${docHost}`));
  });

  if (sourceUrls.length < minimumTrustedUrls) {
    fail("research source depth", `${sourceUrls.length} URL(s), expected at least ${minimumTrustedUrls}`);
  } else if (trustedUrls.length !== sourceUrls.length) {
    const untrusted = sourceUrls.filter((url) => !isTrustedResearchUrl(url));
    fail("research source trust", untrusted.join(", "));
  } else if (docUrls.length < minimumOfficialDocs) {
    fail("research doc coverage", `${docUrls.length} official doc URL(s), expected at least ${minimumOfficialDocs}`);
  } else {
    pass("research source depth", `${sourceUrls.length} trusted URL(s), ${docUrls.length} docs URL(s)`);
  }

  const specEvidenceUrls = spec.slides.flatMap((slide) => slide.evidence || []);
  const slidesWithWeakEvidence = spec.slides.filter((slide) => {
    return !Array.isArray(slide.evidence)
      || slide.evidence.length === 0
      || slide.evidence.some((url) => !/^https?:\/\//.test(url) || !isTrustedResearchUrl(url));
  });

  if (slidesWithWeakEvidence.length) {
    fail("slide evidence quality", slidesWithWeakEvidence.map((slide) => slide.id).join(", "));
  } else {
    pass("slide evidence quality", `${specEvidenceUrls.length} trusted slide evidence pointer(s)`);
  }

  const unsupportedEvidence = specEvidenceUrls.filter((url) => !sourceUrls.includes(url));
  if (unsupportedEvidence.length) {
    fail("slide evidence in source", [...new Set(unsupportedEvidence)].join(", "));
  } else {
    pass("slide evidence in source", "all slide evidence URLs appear in source.md");
  }

  const imageReferences = walkFiles("slides")
    .filter((file) => file.endsWith(".html"))
    .flatMap((file) => {
      return extractLocalReferences(file, readText(file))
        .filter((reference) => /assets\/illustrations\/.+\.(png|jpe?g|webp|gif)$/i.test(reference.target))
        .map((reference) => path.basename(reference.target));
    });

  if (imageReferences.length > 0) {
    const readme = fileExists("assets/illustrations/README.md")
      ? readText("assets/illustrations/README.md")
      : "";
    const undocumented = [...new Set(imageReferences)].filter((asset) => {
      return !readme.includes(asset) || !/Source:\s*https?:\/\//.test(readme) || !/License\/source check:/i.test(readme);
    });
    if (undocumented.length) {
      fail("image source documentation", undocumented.join(", "));
    } else {
      pass("image source documentation", `${new Set(imageReferences).size} local image asset(s) documented`);
    }
  } else {
    pass("image source documentation", "no local image assets referenced by slides");
  }
}

function runMotionContractChecks() {
  const missingArtifacts = ["design.md", "motion.md", "assets/style.css", "assets/visuals.css"]
    .filter((file) => !fileExists(file));
  if (missingArtifacts.length) {
    fail("motion contract artifacts", missingArtifacts.join(", "));
    return;
  }
  pass("motion contract artifacts", "design, motion reference, token CSS, and visual CSS found");

  const styleCss = removeCssComments(readText("assets/style.css"));
  const missingTokens = MOTION_TOKEN_NAMES.filter((token) => {
    return !new RegExp(`${token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*:`).test(styleCss);
  });
  if (missingTokens.length) {
    fail("motion tokens", missingTokens.join(", "));
  } else {
    pass("motion tokens", `${MOTION_TOKEN_NAMES.length} required token(s) found`);
  }

  const motionDoc = readText("motion.md");
  const visualsCss = removeCssComments(readText("assets/visuals.css"));
  const keyframes = new Set(extractKeyframeBlocks(visualsCss).map((block) => block.name));
  const missingRecipes = MOTION_RECIPE_NAMES.filter((recipe) => {
    return !motionDoc.includes(`\`${recipe}\``) || !keyframes.has(recipe);
  });
  if (missingRecipes.length) {
    fail("motion recipes", missingRecipes.join(", "));
  } else {
    pass("motion recipes", `${MOTION_RECIPE_NAMES.length} documented keyframe recipe(s) found`);
  }

  const tokenUsageIssues = [];
  const motionCss = removeCssComments(readText("assets/visuals.css"));
  const timingDeclarations = [...motionCss.matchAll(/(^|[;{\s])(animation(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g)];
  timingDeclarations.forEach((declaration) => {
    const property = declaration[2];
    const value = declaration[3].trim();
    if (/\d+(?:\.\d+)?m?s\b|cubic-bezier\s*\(/.test(value)) {
      tokenUsageIssues.push(`${property}: ${value}`);
    }
  });
  if (tokenUsageIssues.length) {
    fail("motion token usage", tokenUsageIssues.join("; "));
  } else {
    pass("motion token usage", `${timingDeclarations.length} animation declaration(s) use tokens or keywords`);
  }
}

function runVisualArchetypeChecks(spec) {
  const missingArchetype = spec.slides.filter((slide) => {
    return typeof slide.visualArchetype !== "string" || slide.visualArchetype.trim().length === 0;
  });

  if (missingArchetype.length) {
    fail("visual archetype coverage", missingArchetype.map((slide) => slide.id).join(", "));
    return;
  }

  const archetypes = spec.slides.map((slide) => slide.visualArchetype.trim());
  const uniqueArchetypes = new Set(archetypes);
  const counts = new Map();
  archetypes.forEach((archetype) => {
    counts.set(archetype, (counts.get(archetype) || 0) + 1);
  });
  const maxAllowed = Math.max(1, Math.ceil(spec.slides.length * MAX_VISUAL_ARCHETYPE_SHARE));
  const overused = [...counts.entries()].filter(([, count]) => count > maxAllowed);

  if (uniqueArchetypes.size < Math.min(MIN_VISUAL_ARCHETYPE_UNIQUE_COUNT, spec.slides.length)) {
    fail("visual archetype diversity", `${uniqueArchetypes.size} unique archetype(s), expected at least ${MIN_VISUAL_ARCHETYPE_UNIQUE_COUNT}`);
  } else if (overused.length) {
    fail("visual archetype diversity", overused.map(([name, count]) => `${name}:${count}`).join(", "));
  } else {
    pass("visual archetype diversity", `${uniqueArchetypes.size} archetype(s), max reuse ${Math.max(...counts.values())}`);
  }

  const missingForm = spec.slides.filter((slide) => {
    return typeof slide.visualForm !== "string" || slide.visualForm.trim().length === 0;
  });

  if (missingForm.length) {
    fail("visual form coverage", missingForm.map((slide) => slide.id).join(", "));
    return;
  }

  const forms = spec.slides.map((slide) => slide.visualForm.trim());
  const uniqueForms = new Set(forms);
  const formCounts = new Map();
  forms.forEach((form) => {
    formCounts.set(form, (formCounts.get(form) || 0) + 1);
  });
  const maxFormAllowed = Math.max(1, Math.ceil(spec.slides.length * MAX_VISUAL_FORM_SHARE));
  const overusedForms = [...formCounts.entries()].filter(([, count]) => count > maxFormAllowed);

  if (uniqueForms.size < Math.min(MIN_VISUAL_FORM_UNIQUE_COUNT, spec.slides.length)) {
    fail("visual form diversity", `${uniqueForms.size} unique form(s), expected at least ${MIN_VISUAL_FORM_UNIQUE_COUNT}`);
  } else if (overusedForms.length) {
    fail("visual form diversity", overusedForms.map(([name, count]) => `${name}:${count}`).join(", "));
  } else {
    pass("visual form diversity", `${uniqueForms.size} form(s), max reuse ${Math.max(...formCounts.values())}`);
  }
}

function runMotionDecisionChecks(spec) {
  const invalid = [];
  const animatedSlides = [];

  spec.slides.forEach((slide) => {
    const decision = slide.motionDecision;
    if (!decision || typeof decision.mode !== "string" || typeof decision.reason !== "string" || decision.reason.trim().length === 0) {
      invalid.push(`${slide.id}:missing-decision`);
      return;
    }

    if (!["static", "animated"].includes(decision.mode)) {
      invalid.push(`${slide.id}:invalid-mode`);
      return;
    }

    if (decision.mode === "animated") {
      animatedSlides.push(slide);
      if (!slide.motion) {
        invalid.push(`${slide.id}:animated-without-motion`);
      }
    }

    if (decision.mode === "static" && slide.motion) {
      invalid.push(`${slide.id}:static-with-motion`);
    }
  });

  const maxAnimated = Math.max(1, Math.floor(spec.slides.length * MAX_ANIMATED_SLIDE_SHARE));
  if (invalid.length) {
    fail("motion decision coverage", invalid.join(", "));
  } else if (animatedSlides.length > maxAnimated) {
    fail("motion decision coverage", `${animatedSlides.length} animated slide(s), expected at most ${maxAnimated}`);
  } else {
    pass("motion decision coverage", `${animatedSlides.length} animated slide(s), ${spec.slides.length - animatedSlides.length} static slide(s)`);
  }
}

function runImportanceMapChecks(spec) {
  const invalid = [];

  spec.slides.forEach((slide) => {
    const importanceMap = slide.importanceMap;
    if (!importanceMap || typeof importanceMap !== "object" || Array.isArray(importanceMap)) {
      invalid.push(`${slide.id}:missing-map`);
      return;
    }

    if (!nonEmptyString(importanceMap.primaryMessage)) {
      invalid.push(`${slide.id}:missing-primaryMessage`);
    }
    if (!nonEmptyString(importanceMap.primaryEvidenceOrAction)) {
      invalid.push(`${slide.id}:missing-primaryEvidenceOrAction`);
    }
    if (!Array.isArray(importanceMap.secondaryConstraints)) {
      invalid.push(`${slide.id}:missing-secondaryConstraints`);
    }
    if (!Array.isArray(importanceMap.metadata)) {
      invalid.push(`${slide.id}:missing-metadata`);
    }
  });

  if (invalid.length) {
    fail("importance map coverage", invalid.join(", "));
  } else {
    pass("importance map coverage", `${spec.slides.length} slide(s) include hierarchy maps`);
  }
}

function runAssetDecisionChecks(spec) {
  const invalid = [];

  spec.slides.forEach((slide) => {
    const decision = slide.assetDecision;
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      invalid.push(`${slide.id}:missing-decision`);
      return;
    }

    if (!nonEmptyString(decision.mode)) {
      invalid.push(`${slide.id}:missing-mode`);
    } else if (!ASSET_DECISION_MODES.has(decision.mode)) {
      invalid.push(`${slide.id}:invalid-mode`);
    }

    if (!nonEmptyString(decision.reason)) {
      invalid.push(`${slide.id}:missing-reason`);
    }

    if (typeof decision.source !== "string") {
      invalid.push(`${slide.id}:missing-source`);
    } else if (["official-image", "local-raster"].includes(decision.mode) && !nonEmptyString(decision.source)) {
      invalid.push(`${slide.id}:missing-source`);
    }

    ["assetRole", "placement", "cropIntent"].forEach((field) => {
      if (!nonEmptyString(decision[field])) {
        invalid.push(`${slide.id}:missing-${field}`);
      }
    });

    if (decision.mode !== "none" && !nonEmptyString(decision.fallback)) {
      invalid.push(`${slide.id}:missing-fallback`);
    }
  });

  if (invalid.length) {
    fail("asset decision coverage", invalid.join(", "));
  } else {
    pass("asset decision coverage", `${spec.slides.length} slide(s) include asset decisions`);
  }
}

function readJsonFile(relativePath) {
  return JSON.parse(readText(relativePath));
}

function getSlideImageReferences(spec) {
  const bySlide = new Map();
  spec.slides.forEach((slide) => {
    if (!fileExists(slide.file)) {
      bySlide.set(slide.id, []);
      return;
    }
    const references = extractLocalReferences(slide.file, readText(slide.file))
      .filter((reference) => {
        const normalized = reference.target.replace(/\\/g, "/");
        return /assets\/illustrations\/.+\.(png|jpe?g|webp|gif)$/i.test(normalized);
      })
      .map((reference) => ({
        target: reference.target,
        file: path.basename(reference.target)
      }));
    bySlide.set(slide.id, references);
  });
  return bySlide;
}

function runAssetAdequacyChecks(spec) {
  const currentRun = getCurrentRun();
  const requirements = currentRun.assetRequirements || {};
  const rasterModes = new Set(["official-image", "local-raster"]);
  const rasterSlides = spec.slides.filter((slide) => {
    return slide.assetDecision && rasterModes.has(slide.assetDecision.mode);
  });
  const cssModuleSlides = spec.slides.filter((slide) => {
    return slide.assetDecision && slide.assetDecision.mode === "css-module";
  });
  const localReferencesBySlide = getSlideImageReferences(spec);
  const slidesWithLocalImages = spec.slides.filter((slide) => {
    return (localReferencesBySlide.get(slide.id) || []).length > 0;
  });

  const minimumRasterSlides = Number.isInteger(requirements.minimumRasterSlides)
    ? requirements.minimumRasterSlides
    : 0;
  if (slidesWithLocalImages.length < minimumRasterSlides) {
    fail("asset raster requirement", `${slidesWithLocalImages.length} slide(s) reference local raster images, expected at least ${minimumRasterSlides}`);
  } else {
    pass("asset raster requirement", `${slidesWithLocalImages.length} local raster slide(s)`);
  }

  const maximumCssModuleShare = typeof requirements.maximumCssModuleShare === "number"
    ? requirements.maximumCssModuleShare
    : 1;
  const cssShare = spec.slides.length > 0 ? cssModuleSlides.length / spec.slides.length : 0;
  if (cssShare > maximumCssModuleShare) {
    fail("css-module overuse", `${cssModuleSlides.length}/${spec.slides.length} slide(s) use css-module, max share ${maximumCssModuleShare}`);
  } else {
    pass("css-module overuse", `${cssModuleSlides.length}/${spec.slides.length} css-module slide(s)`);
  }

  const rasterWithoutReference = rasterSlides.filter((slide) => {
    return (localReferencesBySlide.get(slide.id) || []).length === 0 && slide.assetDecision.mode === "local-raster";
  });
  if (rasterWithoutReference.length) {
    fail("declared raster usage", rasterWithoutReference.map((slide) => slide.id).join(", "));
  } else {
    pass("declared raster usage", `${rasterSlides.length} raster-mode slide(s) checked`);
  }

  if (requirements.requireManifestForRaster === false && slidesWithLocalImages.length === 0) {
    pass("asset manifest coverage", "manifest not required and no local raster images referenced");
    return;
  }

  if (!fileExists("assets/illustrations/manifest.json")) {
    fail("asset manifest coverage", "assets/illustrations/manifest.json is missing");
    return;
  }

  let manifest;
  try {
    manifest = readJsonFile("assets/illustrations/manifest.json");
  } catch (error) {
    fail("asset manifest coverage", error.message);
    return;
  }

  const entries = Array.isArray(manifest.assets) ? manifest.assets : [];
  const manifestByFile = new Map(entries.map((entry) => [entry.file, entry]));
  const manifestIssues = [];
  const requiredFields = ["file", "sourceUrl", "publisher", "author", "license", "licenseUrl", "checkedDate", "edits", "role"];
  entries.forEach((entry, index) => {
    requiredFields.forEach((field) => {
      if (!nonEmptyString(entry[field])) {
        manifestIssues.push(`asset-${index}:missing-${field}`);
      }
    });
    if (!Array.isArray(entry.slideIds) || entry.slideIds.length === 0) {
      manifestIssues.push(`asset-${index}:missing-slideIds`);
    }
    if (nonEmptyString(entry.file) && !fileExists(path.join("assets/illustrations", entry.file))) {
      manifestIssues.push(`${entry.file}:missing-file`);
    }
  });

  const referencedFiles = [...new Set([...localReferencesBySlide.values()].flat().map((reference) => reference.file))];
  const undocumented = referencedFiles.filter((file) => !manifestByFile.has(file));
  if (undocumented.length) {
    manifestIssues.push(`undocumented:${undocumented.join(",")}`);
  }

  if (manifestIssues.length) {
    fail("asset manifest coverage", manifestIssues.join("; "));
  } else {
    pass("asset manifest coverage", `${entries.length} manifest asset(s), ${referencedFiles.length} referenced file(s)`);
  }
}

function runMotionPlanChecks(spec) {
  const invalid = [];

  spec.slides.forEach((slide) => {
    const mode = slide.motionDecision && slide.motionDecision.mode;
    const plan = slide.motionPlan;

    if (mode === "static") {
      if (plan) {
        invalid.push(`${slide.id}:static-with-plan`);
      }
      return;
    }

    if (mode !== "animated") {
      return;
    }

    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      invalid.push(`${slide.id}:missing-plan`);
      return;
    }

    if (!Array.isArray(plan.targets) || plan.targets.length === 0) {
      invalid.push(`${slide.id}:missing-targets`);
    } else {
      const selectors = [];
      plan.targets.forEach((target, index) => {
        const selector = target && target.selector;
        if (!nonEmptyString(selector)) {
          invalid.push(`${slide.id}:target-${index}-missing-selector`);
        } else {
          selectors.push(selector.trim());
        }
      });

      if (new Set(selectors).size !== selectors.length) {
        invalid.push(`${slide.id}:duplicate-targets`);
      }
      if (!SINGLE_OBJECT_VISUAL_FORMS.has(slide.visualForm) && plan.targets.length < 3) {
        invalid.push(`${slide.id}:too-few-targets`);
      }
    }

    if (!Array.isArray(plan.mustNotAnimate)) {
      invalid.push(`${slide.id}:missing-mustNotAnimate`);
    }
    if (!nonEmptyString(plan.reducedMotion)) {
      invalid.push(`${slide.id}:missing-reducedMotion`);
    }
  });

  if (invalid.length) {
    fail("motion plan coverage", invalid.join(", "));
  } else {
    const animatedSlides = spec.slides.filter((slide) => slide.motionDecision && slide.motionDecision.mode === "animated").length;
    pass("motion plan coverage", `${animatedSlides} animated slide(s) include motion plans`);
  }
}

function runAnimationSafetyChecks(spec) {
  const cssFiles = walkFiles("assets").filter((file) => file.endsWith(".css"));
  const cssBundle = cssFiles.map((file) => {
    return { file, css: removeCssComments(readText(file)) };
  });
  const keyframeIssues = [];
  const infiniteIssues = [];
  let keyframeCount = 0;

  cssBundle.forEach(({ file, css }) => {
    const blocks = extractKeyframeBlocks(css);
    keyframeCount += blocks.length;

    blocks.forEach((block) => {
      const declarations = [...block.content.matchAll(/(^|[;{\s])([a-zA-Z-]+)\s*:/g)]
        .map((declaration) => declaration[2])
        .filter((property) => property && !property.startsWith("--"));
      const invalid = declarations.filter((property) => !KEYFRAME_ALLOWED_PROPERTIES.has(property));
      if (invalid.length) {
        keyframeIssues.push(`${file} @keyframes ${block.name}: ${[...new Set(invalid)].join(", ")}`);
      }
    });

    const animationDeclarations = [...css.matchAll(/(^|[;{\s])(animation(?:-iteration-count)?)\s*:\s*([^;}]+)/g)];
    animationDeclarations.forEach((declaration) => {
      const property = declaration[2];
      const value = declaration[3].trim();
      if (/\binfinite\b/.test(value)) {
        infiniteIssues.push(`${file} ${property}: ${value}`);
      }
    });
  });

  if (keyframeIssues.length) {
    fail("animation keyframe safety", keyframeIssues.join("; "));
  } else {
    pass("animation keyframe safety", `${keyframeCount} keyframe block(s) use transform/opacity only`);
  }

  if (keyframeCount > 0 && !cssBundle.some(({ css }) => /prefers-reduced-motion\s*:\s*reduce/.test(css))) {
    fail("reduced motion fallback", "CSS animations exist but no prefers-reduced-motion: reduce block was found");
  } else {
    pass("reduced motion fallback", keyframeCount > 0 ? "fallback found" : "no keyframes");
  }

  if (infiniteIssues.length) {
    fail("finite animation policy", infiniteIssues.join("; "));
  } else {
    pass("finite animation policy", "no infinite animation declarations");
  }

  const motionSlides = spec.slides.filter((slide) => slide.motion);
  const invalidMotionSpecs = motionSlides.filter((slide) => {
    return MOTION_SPEC_REQUIRED_FIELDS.some((field) => {
      if (field === "sequence") {
        return !Array.isArray(slide.motion.sequence) || slide.motion.sequence.length === 0;
      }
      return typeof slide.motion[field] !== "string" || slide.motion[field].trim().length === 0;
    });
  });

  if (invalidMotionSpecs.length) {
    fail("motion spec shape", invalidMotionSpecs.map((slide) => slide.id).join(", "));
  } else {
    pass("motion spec shape", `${motionSlides.length} slide(s) with structured motion`);
  }
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function serveStatic() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const decodedPath = decodeURIComponent(url.pathname);
    const requested = decodedPath === "/" ? "/deck.html" : decodedPath;
    const filePath = path.normalize(path.join(root, requested));

    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const ext = path.extname(filePath);
      const contentType = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
      }[ext] || "application/octet-stream";

      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function launchChrome(chromePath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-verify-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-features=MediaRouter",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const exitPromise = new Promise((resolve) => chrome.once("exit", resolve));

  const wsPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome did not expose a DevTools endpoint")), 10000);
    chrome.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on("exit", (code) => {
      reject(new Error(`Chrome exited early with code ${code}`));
    });
  });

  return { chrome, userDataDir, wsPromise, exitPromise };
}

async function createPage(browserWs, url) {
  const endpoint = new URL(browserWs);
  const targetUrl = `http://${endpoint.host}/json/new?${encodeURIComponent(url)}`;
  const response = await fetch(targetUrl, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`Unable to create Chrome target: ${response.status}`);
  }
  const target = await response.json();
  return target.webSocketDebuggerUrl;
}

function cdpClient(pageWs) {
  const socket = new WebSocket(pageWs);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((commandResolve, commandReject) => {
            pending.set(id, { resolve: commandResolve, reject: commandReject });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("error", () => reject(new Error("Chrome WebSocket failed")));
  });
}

async function waitForExpression(client, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.result.value) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function navigate(client, url, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile
  });
  await client.send("Page.enable");
  await client.send("Page.navigate", { url });
  await waitForExpression(client, "document.readyState === 'complete'");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return result.result.value;
}

async function runBrowserChecks(spec) {
  const chromePath = findChrome();
  if (!chromePath) {
    fail("browser runtime", "Chrome, Chromium, or Edge was not found");
    return;
  }

  const { server, origin } = await serveStatic();
  const { chrome, userDataDir, wsPromise, exitPromise } = launchChrome(chromePath);

  try {
    const browserWs = await wsPromise;
    const pageWs = await createPage(browserWs, `${origin}/deck.html`);
    const client = await cdpClient(pageWs);

    const viewports = [
      { name: "desktop overflow", width: 1366, height: 768, mobile: false },
      { name: "mobile overflow", width: 390, height: 844, mobile: true }
    ];
    let deckNoteCount = 0;

    for (const viewport of viewports) {
      await navigate(client, `${origin}/deck.html`, viewport);
      await waitForExpression(client, "window.DECK_READY === true");
      const report = await evaluate(client, `
        (async () => {
          const issues = [];
          const tolerance = 3;
          const slides = window.DECK_API.getSlides();
          for (let index = 0; index < slides.length; index += 1) {
            window.DECK_API.goTo(index);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const active = document.querySelector(".deck-frame.is-active .slide");
            const elements = [active, ...active.querySelectorAll("*")];
            elements.forEach((element) => {
              if (element.scrollWidth > element.clientWidth + tolerance || element.scrollHeight > element.clientHeight + tolerance) {
                issues.push({
                  slide: slides[index].id,
                  tag: element.tagName.toLowerCase(),
                  className: element.className || "",
                  scrollWidth: element.scrollWidth,
                  clientWidth: element.clientWidth,
                  scrollHeight: element.scrollHeight,
                  clientHeight: element.clientHeight
                });
              }
            });
          }
          return {
            slideCount: slides.length,
            noteCount: document.querySelectorAll("#deck .note").length,
            activeCount: document.querySelectorAll(".deck-frame.is-active").length,
            issues
          };
        })()
      `);

      if (report.slideCount !== spec.slides.length) {
        fail(`${viewport.name} slide count`, `rendered ${report.slideCount} of ${spec.slides.length} slides`);
      } else {
        pass(`${viewport.name} slide count`, `${report.slideCount} slides rendered`);
      }

      if (report.issues.length) {
        fail(viewport.name, JSON.stringify(report.issues.slice(0, 5)));
      } else {
        pass(viewport.name, `${report.slideCount} slides checked`);
      }

      deckNoteCount = Math.max(deckNoteCount, report.noteCount);
    }

    if (deckNoteCount > 0) {
      fail("deck note exposure", `${deckNoteCount} .note elements visible in deck`);
    } else {
      pass("deck note exposure", "0 .note elements in deck");
    }

    const motionSlides = spec.slides
      .map((slide, index) => ({ id: slide.id, index, hasMotion: Boolean(slide.motion) }))
      .filter((slide) => slide.hasMotion);

    if (motionSlides.length > 0) {
      await client.send("Emulation.setEmulatedMedia", { features: [] });
      await navigate(client, `${origin}/deck.html`, { width: 1366, height: 768, mobile: false });
      await waitForExpression(client, "window.DECK_READY === true");
      const animationReport = await evaluate(client, `
        (async () => {
          const slides = ${JSON.stringify(motionSlides)};
          const issues = [];
          for (const slide of slides) {
            window.DECK_API.goTo(slide.index);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const active = document.querySelector(".deck-frame.is-active .slide");
            if (!active) {
              issues.push(slide.id + ": no active slide");
              continue;
            }
            const animations = active.getAnimations({ subtree: true });
            if (animations.length === 0) {
              issues.push(slide.id);
            }
          }
          return issues;
        })()
      `);

      if (animationReport.length) {
        fail("motion runtime", `no active animation detected: ${animationReport.join(", ")}`);
      } else {
        pass("motion runtime", `${motionSlides.length} motion slide(s) detected`);
      }

      await client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }]
      });
      await navigate(client, `${origin}/deck.html`, { width: 1366, height: 768, mobile: false });
      await waitForExpression(client, "window.DECK_READY === true");
      const reducedReport = await evaluate(client, `
        (async () => {
          const slides = ${JSON.stringify(motionSlides)};
          const issues = [];
          for (const slide of slides) {
            window.DECK_API.goTo(slide.index);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const active = document.querySelector(".deck-frame.is-active .slide");
            if (!active) {
              issues.push({ id: slide.id, count: "no active slide" });
              continue;
            }
            const animations = active.getAnimations({ subtree: true })
              .filter((animation) => animation.playState !== "finished");
            if (animations.length > 0) {
              issues.push({ id: slide.id, count: animations.length });
            }
          }
          return issues;
        })()
      `);

      if (reducedReport.length) {
        fail("reduced motion runtime", JSON.stringify(reducedReport));
      } else {
        pass("reduced motion runtime", `${motionSlides.length} motion slide(s) static`);
      }

      await client.send("Emulation.setEmulatedMedia", { features: [] });
    } else {
      pass("motion runtime", "no motion slides declared");
      pass("reduced motion runtime", "no motion slides declared");
    }

    await navigate(client, `${origin}/presenter-review.html`, { width: 1280, height: 900, mobile: false });
    await waitForExpression(client, "window.PRESENTER_REVIEW_READY === true");
    const presenterReport = await evaluate(client, `
      ({
        cards: document.querySelectorAll(".review-card").length,
        scripts: Array.from(document.querySelectorAll(".presenter-script")).filter((node) => node.textContent.trim().length > 0).length
      })
    `);

    if (presenterReport.cards === spec.slides.length && presenterReport.scripts === spec.slides.length) {
      pass("presenter script", `${presenterReport.scripts} scripts visible`);
    } else {
      fail("presenter script", JSON.stringify(presenterReport));
    }

    client.close();
  } catch (error) {
    fail("browser checks", error.message);
  } finally {
    server.close();
    chrome.kill();
    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(resolve, 1200))
    ]);
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function main() {
  let spec;
  try {
    if (!validModes.has(mode)) {
      throw new Error(`Unknown verify mode: ${mode}`);
    }
    spec = getSpec();
    if (mode === "all" || mode === "harness") {
      runStaticChecks(spec);
      runLayerContractChecks();
      runResearchQualityChecks(spec);
      runMotionContractChecks();
      runVisualArchetypeChecks(spec);
      runMotionDecisionChecks(spec);
      runImportanceMapChecks(spec);
      runAssetDecisionChecks(spec);
      runAssetAdequacyChecks(spec);
      runMotionPlanChecks(spec);
      runAnimationSafetyChecks(spec);
    }
    if (mode === "all" || mode === "render") {
      await runBrowserChecks(spec);
    }
  } catch (error) {
    fail("verify-deck", error.message);
  }

  results.forEach((result) => {
    const prefix = result.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  });

  writeValidationResult();

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main();
