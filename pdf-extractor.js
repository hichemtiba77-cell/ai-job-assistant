(function () {
  "use strict";

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const MAX_PAGES = 30;
  const MIN_TEXT_LENGTH = 20;

  function createExtractionError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizeText(text) {
    return text
      .replace(/\u0000/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function appendTextItem(current, value, needsLineBreak) {
    if (!value) {
      return current;
    }

    if (needsLineBreak && current && !current.endsWith("\n")) {
      current += "\n";
    }

    const previous = current.at(-1) || "";
    const first = value.at(0) || "";
    if (
      current &&
      !current.endsWith("\n") &&
      /[A-Za-z0-9]$/.test(previous) &&
      /^[A-Za-z0-9]/.test(first)
    ) {
      current += " ";
    }

    return current + value;
  }

  async function withPdf(file, signal, read) {
    if (!(file instanceof File)) {
      throw createExtractionError("请选择一份 PDF 简历。", "invalid_file");
    }
    if (file.size > MAX_FILE_SIZE) {
      throw createExtractionError("PDF 文件超过 15 MB，请压缩后重试。", "file_too_large");
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      throw createExtractionError("目前只支持 PDF 格式的简历。", "invalid_type");
    }
    if (!window.pdfjsLib) {
      throw createExtractionError("PDF 组件未加载，请重新打开页面。", "library_missing");
    }

    const baseUrl = new URL("./vendor/pdfjs/", window.location.href);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdf.worker.min.js",
      baseUrl,
    ).href;

    let loadingTask;
    let cleanup;
    const destroy = () => {
      if (loadingTask && !cleanup) cleanup = loadingTask.destroy().catch(() => {});
      return cleanup;
    };
    try {
      signal?.throwIfAborted();
      const data = new Uint8Array(await file.arrayBuffer());
      signal?.throwIfAborted();
      loadingTask = window.pdfjsLib.getDocument({
        data,
        cMapUrl: new URL("cmaps/", baseUrl).href,
        cMapPacked: true,
        standardFontDataUrl: new URL("standard_fonts/", baseUrl).href,
        disableWorker: window.location.protocol === "file:",
        useWorkerFetch: false,
        isEvalSupported: false,
      });
      signal?.addEventListener("abort", destroy, { once: true });
      const pdf = await loadingTask.promise;

      if (pdf.numPages > MAX_PAGES) {
        throw createExtractionError(
          `PDF 共 ${pdf.numPages} 页，请上传 30 页以内的简历。`,
          "too_many_pages",
        );
      }

      return await read(pdf);
    } catch (error) {
      signal?.throwIfAborted();
      if (error?.name === "PasswordException") {
        throw createExtractionError("这份 PDF 已加密，请取消密码后重试。", "encrypted");
      }
      if (error?.name === "InvalidPDFException") {
        throw createExtractionError("PDF 文件无法打开，请确认文件完整。", "invalid_pdf");
      }
      if (typeof error?.code === "string") throw error;
      throw createExtractionError("PDF 暂时无法读取，请重试或改用粘贴简历。", "read_failed");
    } finally {
      signal?.removeEventListener("abort", destroy);
      await destroy();
    }
  }

  async function readTextLayer(page) {
    const content = await page.getTextContent();
    let text = "";
    let previousY = null;
    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      const y = item.transform?.[5];
      const newLine = Number.isFinite(y) && previousY !== null && Math.abs(y - previousY) > 3;
      text = appendTextItem(text, item.str, Boolean(item.hasEOL) || newLine);
      if (Number.isFinite(y)) previousY = y;
    }
    return normalizeText(text);
  }

  function needsOcr(text) {
    const readable = text.match(/[\p{L}\p{N}]/gu)?.length || 0;
    const broken = text.match(/[\uFFFD\p{Co}]/gu)?.length || 0;
    return readable < MIN_TEXT_LENGTH || broken > (readable + broken) * 0.1;
  }

  function normalizeOcrText(text) {
    return normalizeText(text).replace(/(?<=\p{Script=Han}) +(?=\p{Script=Han})/gu, "");
  }

  async function extractPdfText(file, { signal, onProgress = () => {} } = {}) {
    return withPdf(file, signal, async (pdf) => {
      const pages = [];
      const ocr = window.AIJobAssistantOcr.createSession(signal);
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          signal?.throwIfAborted();
          const page = await pdf.getPage(pageNumber);
          const progress = (stage) => onProgress({ stage, pageNumber, pageCount: pdf.numPages });
          const result = { pageNumber, textLayer: "", text: "", source: "text", error: "" };
          try {
            progress("text");
            try {
              result.textLayer = await readTextLayer(page);
            } catch {
              signal?.throwIfAborted();
            }
            result.text = result.textLayer;
            if (needsOcr(result.textLayer)) {
              try {
                progress("ocr");
                const recognized = await ocr.recognize(page);
                const text = normalizeOcrText(recognized.text);
                result.confidence = recognized.confidence;
                if (text) {
                  result.source = "ocr";
                  result.text = text;
                } else {
                  result.error = "没有识别到文字，请核对该页是否为空白。";
                }
              } catch (error) {
                signal?.throwIfAborted();
                result.error = error.message;
              }
            }
            pages.push(result);
          } finally {
            page.cleanup();
          }
        }
      } finally {
        await ocr.close();
      }
      return { pages, pageCount: pdf.numPages, text: normalizeText(pages.map((page) => page.text).join("\n\n")) };
    });
  }

  async function recognizePdfPage(file, pageNumber, { signal, rotation = 0 } = {}) {
    return withPdf(file, signal, async (pdf) => {
      const page = await pdf.getPage(pageNumber);
      const ocr = window.AIJobAssistantOcr.createSession(signal);
      try {
        const result = await ocr.recognize(page, rotation);
        return { ...result, text: normalizeOcrText(result.text) };
      } finally {
        page.cleanup();
        await ocr.close();
      }
    });
  }

  window.AIJobAssistantPdf = {
    extractPdfText,
    recognizePdfPage,
  };
})();
