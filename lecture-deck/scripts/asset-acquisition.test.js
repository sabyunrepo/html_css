const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "asset-acquisition.js");
const { validateAsset } = require("./asset-acquisition");

function makeDeckRoot() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asset-acquisition-"));
  fs.mkdirSync(path.join(deckRoot, "assets/illustrations"), { recursive: true });
  fs.writeFileSync(path.join(deckRoot, "assets/illustrations/manifest.json"), JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-05-26T00:00:00.000Z",
    assets: []
  }, null, 2));
  return deckRoot;
}

function makeAsset(tempRoot, overrides = {}) {
  const localPath = path.join(tempRoot, "source.png");
  fs.writeFileSync(localPath, Buffer.from("fake image"));
  return {
    file: "starter-diagram.png",
    sourceUrl: "https://example.com/source-image",
    publisher: "Example Publisher",
    author: "Example Author",
    license: "Example License",
    licenseUrl: "https://example.com/license",
    checkedDate: "2026-05-26",
    edits: "copied without edits for test",
    role: "Shows the tested workflow state",
    slideIds: ["slide-01"],
    localPath,
    ...overrides
  };
}

test("validateAsset rejects unsafe filenames and missing metadata", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asset-input-"));
  assert.throws(() => validateAsset(makeAsset(tempRoot, { file: "../bad.png" }), 0), /Invalid asset file name|basename/);
  assert.throws(() => validateAsset(makeAsset(tempRoot, { license: "" }), 0), /missing license/);
});

test("asset-acquisition copies local assets and updates manifest and README", () => {
  const deckRoot = makeDeckRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asset-input-"));
  const inputPath = path.join(tempRoot, "assets.json");
  fs.writeFileSync(inputPath, JSON.stringify({ assets: [makeAsset(tempRoot)] }, null, 2));

  const result = spawnSync(process.execPath, [scriptPath, `--input=${inputPath}`], {
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(path.join(deckRoot, "assets/illustrations/starter-diagram.png")), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(deckRoot, "assets/illustrations/manifest.json"), "utf8"));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].file, "starter-diagram.png");
  const readme = fs.readFileSync(path.join(deckRoot, "assets/illustrations/README.md"), "utf8");
  assert.match(readme, /Source: https:\/\/example\.com\/source-image/);
  assert.match(readme, /License\/source check:/);
  const report = JSON.parse(fs.readFileSync(path.join(deckRoot, ".deck-quality/asset-acquisition-report.json"), "utf8"));
  assert.equal(report.acquired[0], "starter-diagram.png");
});

test("asset-acquisition requires --download when only sourceUrl is available", () => {
  const deckRoot = makeDeckRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asset-input-"));
  const inputPath = path.join(tempRoot, "assets.json");
  const asset = makeAsset(tempRoot);
  delete asset.localPath;
  fs.writeFileSync(inputPath, JSON.stringify([asset], null, 2));

  const result = spawnSync(process.execPath, [scriptPath, `--input=${inputPath}`], {
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires --download/);
});

test("asset-acquisition records rejected candidates without manifest entries", () => {
  const deckRoot = makeDeckRoot();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asset-input-"));
  const inputPath = path.join(tempRoot, "candidates.json");
  fs.writeFileSync(inputPath, JSON.stringify({
    checkedDate: "2026-05-26",
    candidates: [
      makeAsset(tempRoot, { id: "accepted-asset", file: undefined, status: "accepted" }),
      {
        id: "rejected-asset",
        title: "Weak stock image",
        status: "rejected",
        sourceUrl: "https://example.com/weak",
        rejectionReason: "decorative stock image"
      }
    ]
  }, null, 2));

  const result = spawnSync(process.execPath, [scriptPath, `--input=${inputPath}`], {
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(deckRoot, "assets/illustrations/manifest.json"), "utf8"));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].file, "accepted-asset.png");
  const report = JSON.parse(fs.readFileSync(path.join(deckRoot, ".deck-quality/asset-acquisition-report.json"), "utf8"));
  assert.equal(report.rejected.length, 1);
  assert.equal(report.rejected[0].rejectionReason, "decorative stock image");
});
