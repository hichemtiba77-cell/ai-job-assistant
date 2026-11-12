import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const modules = fileURLToPath(new URL("../node_modules/", import.meta.url));
const output = join(modules, ".aijob-ocr");
const langs = ["chi_sim", "eng"];
const [core, worker, ...data] = await Promise.all([
  readFile(join(modules, "tesseract.js-core", "tesseract-core-lstm.wasm.js"), "utf8"),
  readFile(join(modules, "tesseract.js", "dist", "worker.min.js"), "utf8"),
  ...langs.map((lang) => readFile(join(modules, "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`))),
]);

// Classic scripts can load beside file:// pages. Give the worker all its
// dependencies in memory so it never has to fetch from the local filesystem.
const langPath = "https://aijob-ocr.invalid";
const embedded = langs.map((lang, index) => [
  `${langPath}/${lang}.traineddata.gz`, data[index].toString("base64"),
]);
const loadLanguages = `
  const embeddedLanguages = new Map(${JSON.stringify(embedded)});
  const originalFetch = self.fetch.bind(self);
  self.fetch = async (url, options) => {
    const data = embeddedLanguages.get(String(url));
    if (!data) return originalFetch(url, options);
    return new Response(Uint8Array.from(atob(data), (character) => character.charCodeAt(0)));
  };
`;
const runtime = { workerSource: [loadLanguages, core, worker].join("\n"), langPath };
await mkdir(output, { recursive: true });
const temporary = join(output, `runtime-${process.pid}.tmp`);
await writeFile(temporary, `window.AIJobAssistantFileOcr = ${JSON.stringify(runtime)};\n`);
await rename(temporary, join(output, "runtime.js"));
console.log("本地 OCR 资源已准备好，可以直接打开 index.html。");
