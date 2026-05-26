#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const assetDir = path.join(deckRoot, "assets/illustrations");
const manifestPath = path.join(assetDir, "manifest.json");
const readmePath = path.join(assetDir, "README.md");
const reportPath = path.join(deckRoot, ".deck-quality/asset-acquisition-report.json");

const REQUIRED_FIELDS = [
  "file",
  "sourceUrl",
  "publisher",
  "author",
  "license",
  "licenseUrl",
  "checkedDate",
  "edits",
  "role",
  "slideIds"
];

function parseArgs(argv) {
  const options = { input: null, dryRun: false, download: false };
  argv.forEach((arg) => {
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--download") options.download = true;
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) options[match[1]] = match[2];
  });
  return options;
}

function assertSafeFileName(file) {
  if (!/^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp|gif)$/i.test(file)) {
    throw new Error(`Invalid asset file name: ${file}`);
  }
  if (file.includes("..") || file.includes("/") || file.includes("\\")) {
    throw new Error(`Asset file must be a basename: ${file}`);
  }
}

function loadInput(inputPath) {
  if (!inputPath) throw new Error("Missing --input=asset-candidates.json");
  const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
  const raw = Array.isArray(payload.candidates)
    ? payload.candidates
    : Array.isArray(payload.assets)
      ? payload.assets
      : payload;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Input must be a non-empty array, { assets: [...] }, or { candidates: [...] }");
  }
  const checkedDate = payload.checkedDate;
  const accepted = [];
  const rejected = [];
  raw.forEach((candidate, index) => {
    const status = candidate.status || "accepted";
    if (status === "rejected") {
      if (!candidate.rejectionReason) throw new Error(`candidate-${index}: rejected assets require rejectionReason`);
      rejected.push(candidate);
      return;
    }
    if (status !== "accepted") throw new Error(`candidate-${index}: invalid status ${status}`);
    accepted.push({
      ...candidate,
      file: candidate.file || `${candidate.id || `asset-${index + 1}`}.png`,
      sourceUrl: candidate.sourceUrl,
      licenseUrl: candidate.licenseUrl,
      checkedDate: candidate.checkedDate || checkedDate,
      slideIds: candidate.slideIds || candidate.intendedSlideIds
    });
  });
  if (!accepted.length) throw new Error("Input must include at least one accepted asset");
  return { accepted, rejected };
}

function validateAsset(asset, index) {
  const missing = REQUIRED_FIELDS.filter((field) => {
    if (field === "slideIds") return !Array.isArray(asset.slideIds) || asset.slideIds.length === 0;
    return typeof asset[field] !== "string" || asset[field].trim().length === 0;
  });
  if (missing.length) throw new Error(`asset-${index}: missing ${missing.join(", ")}`);
  assertSafeFileName(asset.file);
  if (!asset.localPath && !asset.dataUri && !asset.sourceUrl) {
    throw new Error(`asset-${index}: requires localPath, dataUri, or sourceUrl`);
  }
  if (!/^https?:\/\//.test(asset.sourceUrl)) throw new Error(`asset-${index}: sourceUrl must be http(s)`);
  if (!/^https?:\/\//.test(asset.licenseUrl)) throw new Error(`asset-${index}: licenseUrl must be http(s)`);
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), assets: [] };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.assets)) manifest.assets = [];
  return manifest;
}

function writeManifest(manifest) {
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    ...manifest,
    schemaVersion: manifest.schemaVersion || 1,
    generatedAt: new Date().toISOString()
  }, null, 2)}\n`);
}

function writeReport({ acquired, rejected, manifestAssets, dryRun }) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "pass",
    dryRun: Boolean(dryRun),
    acquired,
    rejected: rejected.map((item) => ({
      id: item.id || item.title || item.sourceUrl,
      title: item.title || "",
      sourceUrl: item.sourceUrl || "",
      rejectionReason: item.rejectionReason
    })),
    manifestAssetCount: manifestAssets.length
  }, null, 2)}\n`);
}

function decodeDataUri(dataUri) {
  const match = String(dataUri).match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("dataUri must be base64 encoded");
  return Buffer.from(match[2], "base64");
}

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    client.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`download failed ${response.statusCode}: ${url}`));
        response.resume();
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function getAssetBytes(asset, options) {
  if (asset.dataUri) return decodeDataUri(asset.dataUri);
  if (asset.localPath) return fs.readFileSync(path.resolve(asset.localPath));
  if (!options.download) {
    throw new Error(`${asset.file}: sourceUrl download requires --download or a localPath/dataUri`);
  }
  return download(asset.sourceUrl);
}

function updateReadme(assets) {
  const lines = [
    "# Illustrations",
    "",
    "Local raster assets acquired through `scripts/asset-acquisition.js`.",
    "",
    ...assets.flatMap((asset) => [
      `## ${asset.file}`,
      "",
      `- Source: ${asset.sourceUrl}`,
      `- Publisher: ${asset.publisher}`,
      `- Author: ${asset.author}`,
      `- License/source check: ${asset.license} (${asset.licenseUrl})`,
      `- Checked date: ${asset.checkedDate}`,
      `- Edits: ${asset.edits}`,
      `- Role: ${asset.role}`,
      `- Slide IDs: ${asset.slideIds.join(", ")}`,
      ""
    ])
  ];
  fs.writeFileSync(readmePath, `${lines.join("\n").trim()}\n`);
}

async function acquireAssets(assets, options = {}) {
  assets.forEach(validateAsset);
  const manifest = readManifest();
  const byFile = new Map(manifest.assets.map((asset) => [asset.file, asset]));
  const acquired = [];

  for (const asset of assets) {
    const target = path.join(assetDir, asset.file);
    if (!options.dryRun) {
      fs.mkdirSync(assetDir, { recursive: true });
      const bytes = await getAssetBytes(asset, options);
      fs.writeFileSync(target, bytes);
    }
    byFile.set(asset.file, {
      file: asset.file,
      sourceUrl: asset.sourceUrl,
      publisher: asset.publisher,
      author: asset.author,
      license: asset.license,
      licenseUrl: asset.licenseUrl,
      checkedDate: asset.checkedDate,
      edits: asset.edits,
      role: asset.role,
      slideIds: asset.slideIds
    });
    acquired.push(asset.file);
  }

  const nextAssets = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
  if (!options.dryRun) {
    writeManifest({ ...manifest, assets: nextAssets });
    updateReadme(nextAssets);
  }
  return { acquired, manifestAssets: nextAssets };
}

async function run(options = parseArgs(process.argv.slice(2))) {
  const { accepted, rejected } = loadInput(options.input);
  const result = await acquireAssets(accepted, options);
  if (!options.dryRun) writeReport({ ...result, rejected, dryRun: options.dryRun });
  return { ...result, rejected };
}

if (require.main === module) {
  run().then((result) => {
    console.log(`PASS asset acquisition - ${result.acquired.length} asset(s)`);
  }).catch((error) => {
    console.error(`FAIL asset acquisition - ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  acquireAssets,
  parseArgs,
  validateAsset
};
