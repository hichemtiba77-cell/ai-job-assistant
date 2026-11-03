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

  async function extractPdfText(file) {
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

    let pdf = null;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      pdf = await window.pdfjsLib.getDocument({
        data,
        cMapUrl: new URL("cmaps/", baseUrl).href,
        cMapPacked: true,
        standardFontDataUrl: new URL("standard_fonts/", baseUrl).href,
        disableWorker: window.location.protocol === "file:",
        useWorkerFetch: false,
        isEvalSupported: false,
      }).promise;

      if (pdf.numPages > MAX_PAGES) {
        throw createExtractionError(
          `PDF 共 ${pdf.numPages} 页，请上传 30 页以内的简历。`,
          "too_many_pages",
        );
      }

      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        let pageText = "";
        let previousY = null;

        content.items.forEach((item) => {
          if (typeof item.str !== "string") {
            return;
          }
          const currentY = Number.isFinite(item.transform?.[5])
            ? item.transform[5]
            : null;
          const geometryBreak =
            currentY !== null &&
            previousY !== null &&
            Math.abs(currentY - previousY) > 3;
          pageText = appendTextItem(
            pageText,
            item.str,
            Boolean(item.hasEOL) || geometryBreak,
          );
          if (currentY !== null) {
            previousY = currentY;
          }
        });

        page.cleanup();
        if (pageText.trim()) {
          pages.push(pageText.trim());
        }
      }

      const text = normalizeText(pages.join("\n\n"));
      if (text.length < MIN_TEXT_LENGTH) {
        throw createExtractionError(
          "这份 PDF 暂未读取到可用文字，请上传可复制文字的 PDF，或改用粘贴简历。",
          "no_text",
        );
      }

      return {
        text,
        pageCount: pdf.numPages,
      };
    } catch (error) {
      if (error.code) {
        throw error;
      }
      if (error?.name === "PasswordException") {
        throw createExtractionError("这份 PDF 已加密，请取消密码后重试。", "encrypted");
      }
      if (error?.name === "InvalidPDFException") {
        throw createExtractionError("PDF 文件无法打开，请确认文件完整。", "invalid_pdf");
      }
      throw createExtractionError("PDF 暂时无法读取，请重试或改用粘贴简历。", "read_failed");
    } finally {
      if (pdf) {
        await pdf.destroy();
      }
    }
  }

  window.AIJobAssistantPdf = {
    extractPdfText,
  };
})();
