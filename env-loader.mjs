import { existsSync, readFileSync } from "node:fs";

export function loadLocalEnvironment(filePath, { override = true } = {}) {
  if (!existsSync(filePath)) {
    return { loaded: false, keys: [] };
  }

  const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const loadedKeys = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
      loadedKeys.push(key);
    }
  }

  return { loaded: true, keys: loadedKeys };
}
