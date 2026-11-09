import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../pdf-extractor.js", import.meta.url), "utf8");

test("mixed PDF keeps native and OCR pages in order and reports an unreadable page", async () => {
  const textLayer = "Experience: Built data dashboards and worked with REST APIs.";
  const attempted = [];
  let closed = false;
  let destroyed = false;
  const window = {
    location: { href: "http://localhost/index.html", protocol: "http:" },
    pdfjsLib: {
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 3,
          getPage: async (pageNumber) => ({
            pageNumber,
            getTextContent: async () => ({ items: [{ str: pageNumber === 1 ? textLayer : "" }] }),
            cleanup() {},
          }),
        }),
        async destroy() { destroyed = true; },
      }),
    },
    AIJobAssistantOcr: {
      createSession: () => ({
        async recognize(page) {
          attempted.push(page.pageNumber);
          return { text: page.pageNumber === 2 ? "软 件 工 程 Python SQL" : "", confidence: 90 };
        },
        async close() { closed = true; },
      }),
    },
  };
  runInNewContext(source, { window, File, URL });

  const file = new File(["test fixture"], "resume.pdf", { type: "application/pdf" });
  const result = await window.AIJobAssistantPdf.extractPdfText(file);
  assert.deepEqual(attempted, [2, 3]);
  assert.equal(result.text, `${textLayer}\n\n软件工程 Python SQL`);
  assert.equal(result.pages[0].source, "text");
  assert.equal(result.pages[1].source, "ocr");
  assert.match(result.pages[2].error, /没有识别到文字/);
  assert.equal(closed, true);
  assert.equal(destroyed, true);
});
