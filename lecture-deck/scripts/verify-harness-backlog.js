#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(deckRoot, relativePath), "utf8");
}

function readSchema() {
  return JSON.parse(readText("harness-improvement.schema.json"));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/`[^`]+`/g, "")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bodyHasListItem(item, field) {
  const lines = item.body;
  const fieldIndex = lines.findIndex((line) => line === `- ${field}:`);
  if (fieldIndex === -1) return false;
  for (let index = fieldIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^-\s+[^:]+:/.test(line)) return false;
    if (/^\s+-\s+\S/.test(line) && !/\b(TBD|TODO|placeholder)\b/i.test(line)) return true;
  }
  return false;
}

function parseItems(markdown) {
  const lines = markdown.split(/\r?\n/);
  let section = null;
  let current = null;
  const items = [];

  function finishCurrent() {
    if (current) items.push(current);
    current = null;
  }

  lines.forEach((line) => {
    if (/^## Open Items\s*$/.test(line)) {
      finishCurrent();
      section = "open";
      return;
    }
    if (/^## Completed Items\s*$/.test(line)) {
      finishCurrent();
      section = "completed";
      return;
    }
    const heading = line.match(/^###\s+(HIB-\d{3})\s+(.+)$/);
    if (heading) {
      finishCurrent();
      current = {
        id: heading[1],
        title: heading[2].trim(),
        section,
        fields: {},
        listFields: new Set(),
        body: []
      };
      return;
    }
    if (!current) return;
    current.body.push(line);
    const field = line.match(/^-\s+([^:]+):\s*(.*)$/);
    if (field) {
      current.fields[field[1].trim()] = field[2].trim();
      return;
    }
    const listField = line.match(/^\s+-\s+`?([^`]+?)`?\s*$/);
    if (listField && current.body.length >= 2) {
      const previous = current.body[current.body.length - 2].match(/^-\s+([^:]+):\s*$/);
      if (previous) current.listFields.add(previous[1].trim());
    }
  });
  finishCurrent();
  return items;
}

function validateBacklog(markdown = readText("HARNESS-IMPROVEMENT-BACKLOG.md"), schema = readSchema()) {
  const issues = [];
  schema.requiredSections.forEach((section) => {
    if (!markdown.includes(section)) issues.push(`missing-section:${section}`);
  });

  const items = parseItems(markdown);
  if (items.length === 0) issues.push("no-hib-items");

  const ids = new Map();
  items.forEach((item) => {
    ids.set(item.id, (ids.get(item.id) || 0) + 1);
    if (!item.section) issues.push(`${item.id}:outside-open-or-completed`);
    const requiredFields = item.section === "completed"
      ? schema.requiredCompletedFields
      : schema.requiredOpenFields;
    requiredFields.forEach((field) => {
      if (["Suggested files", "Changed files", "Validation"].includes(field)) {
        if (!item.listFields.has(field) || !bodyHasListItem(item, field)) issues.push(`${item.id}:missing-${field}`);
      } else if (!item.fields[field]) {
        issues.push(`${item.id}:missing-${field}`);
      } else if (/\b(TBD|TODO|placeholder)\b/i.test(item.fields[field])) {
        issues.push(`${item.id}:placeholder-${field}`);
      }
    });

    const status = item.fields.Status;
    if (status && !schema.allowedStatus.includes(status)) issues.push(`${item.id}:invalid-status:${status}`);
    if (item.section === "open" && status === "done") issues.push(`${item.id}:done-in-open-items`);
    if (item.section === "completed" && status !== "done") issues.push(`${item.id}:completed-not-done`);

    const priority = item.fields.Priority;
    if (priority && !schema.allowedPriority.includes(priority)) issues.push(`${item.id}:invalid-priority:${priority}`);
  });

  [...ids.entries()].filter(([, count]) => count > 1).forEach(([id]) => {
    issues.push(`${id}:duplicate-id`);
  });

  const openItems = items.filter((item) => item.section === "open");
  const signatures = new Map();
  const titles = new Map();
  openItems.forEach((item) => {
    const normalizedTitle = normalize(item.title);
    if (titles.has(normalizedTitle)) {
      issues.push(`${item.id}:duplicate-open-title:${titles.get(normalizedTitle)}`);
    } else {
      titles.set(normalizedTitle, item.id);
    }
    const signature = [
      normalize(item.fields.Problem),
      normalize(item.fields["Harness layer"])
    ].join("|");
    if (!signature.trim()) return;
    if (signatures.has(signature)) {
      issues.push(`${item.id}:duplicate-open-similar-to:${signatures.get(signature)}`);
    } else {
      signatures.set(signature, item.id);
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    items
  };
}

if (require.main === module) {
  try {
    const result = validateBacklog();
    if (result.ok) {
      console.log(`PASS harness backlog - ${result.items.length} item(s)`);
    } else {
      console.log(`FAIL harness backlog - ${result.issues.join("; ")}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`FAIL harness backlog - ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseItems,
  validateBacklog
};
