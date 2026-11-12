(function () {
  "use strict";

  const MAX_PIXELS = 4_000_000;
  const MAX_SIDE = 3000;
  const OCR_TIMEOUT = 45_000;
  const fileMode = location.protocol === "file:";
  let library;
  let fileRuntime;

  function loadScript(src, globalName, errorMessage) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      const finish = () => {
        script.remove();
        if (window[globalName]) resolve(window[globalName]);
        else reject(new Error(errorMessage));
      };
      script.onload = finish;
      script.onerror = finish;
      document.head.append(script);
    });
  }

  function loadLibrary() {
    const src = fileMode ? "./node_modules/tesseract.js/dist/tesseract.min.js" : "/ocr-assets/tesseract.min.js";
    library ||= loadScript(src, "Tesseract", "无法加载识别组件，请在项目目录安装 OCR 依赖后重试。")
      .catch((error) => { library = null; throw error; });
    return library;
  }

  function loadFileRuntime() {
    fileRuntime ||= loadScript("./node_modules/.aijob-ocr/runtime.js", "AIJobAssistantFileOcr",
      "本地识别组件尚未准备。请在项目目录运行 npm run prepare:ocr 后刷新页面。")
      .catch((error) => { fileRuntime = null; throw error; });
    return fileRuntime;
  }

  async function waitFor(promise, signal) {
    let timer;
    let abort;
    const interrupt = new Promise((resolve, reject) => {
      abort = () => reject(signal.reason);
      timer = window.setTimeout(() => reject(new Error("识别超时，请重试或手动补录。")), OCR_TIMEOUT);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
    try {
      return await Promise.race([promise, interrupt]);
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  function createSession(signal) {
    let worker;
    let workerUrl;
    let initialization;
    let closed = false;
    let failure;

    async function close() {
      closed = true;
      const current = worker;
      worker = null;
      try {
        await current?.terminate();
      } finally {
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        workerUrl = null;
      }
    }

    async function getWorker() {
      if (!initialization) {
        const Tesseract = await waitFor(loadLibrary(), signal);
        let paths = {
          workerPath: "/ocr-assets/worker.min.js",
          corePath: "/ocr-assets/core",
          langPath: "/ocr-assets/lang",
        };
        if (fileMode) {
          const runtime = await waitFor(loadFileRuntime(), signal);
          signal?.throwIfAborted();
          workerUrl = URL.createObjectURL(new Blob([runtime.workerSource], { type: "text/javascript" }));
          paths = { workerPath: workerUrl, langPath: runtime.langPath, cacheMethod: "none" };
        }
        signal?.throwIfAborted();
        initialization = new Promise((resolve, reject) => {
          Tesseract.createWorker(["chi_sim", "eng"], Tesseract.OEM.LSTM_ONLY, {
            ...paths,
            workerBlobURL: false,
            errorHandler: () => reject(new Error("无法初始化识别引擎，请重试或手动补录。")),
          }).then(async (created) => {
            if (closed) {
              await created.terminate();
              return;
            }
            worker = created;
            resolve(worker);
          }).catch(reject);
        });
      }
      return waitFor(initialization, signal);
    }

    async function recognize(page, rotation = 0) {
      signal?.throwIfAborted();
      if (failure) throw failure;

      const angle = (page.rotate + rotation + 360) % 360;
      const original = page.getViewport({ scale: 1, rotation: angle });
      const scale = Math.min(3, MAX_SIDE / Math.max(original.width, original.height),
        Math.sqrt(MAX_PIXELS / (original.width * original.height)));
      const viewport = page.getViewport({ scale, rotation: angle });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法渲染该页，请重试或手动补录。");

      const render = page.render({ canvasContext: context, viewport, background: "#fff" });
      const cancelRender = () => render.cancel();
      signal?.addEventListener("abort", cancelRender, { once: true });
      try {
        await render.promise;
        const engine = await getWorker();
        signal?.throwIfAborted();
        const { data } = await waitFor(engine.recognize(canvas), signal);
        return { text: data.text, confidence: data.confidence };
      } catch (error) {
        signal?.throwIfAborted();
        failure = error instanceof Error ? error : new Error("该页识别失败，请重试或手动补录。");
        await close();
        throw failure;
      } finally {
        signal?.removeEventListener("abort", cancelRender);
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    return { recognize, close };
  }

  window.AIJobAssistantOcr = { createSession };
})();
