import test from "node:test";
import assert from "node:assert/strict";
import { encodeSseEvent, ANALYSIS_STAGES } from "../progress-events.mjs";

test("分析阶段按固定顺序输出", () => {
  assert.deepEqual(ANALYSIS_STAGES, ["rubric", "evidence", "scoring"]);
});

test("进度事件按SSE格式编码，便于浏览器逐条解析", () => {
  assert.equal(
    encodeSseEvent("stage", { stage: "rubric" }),
    'event: stage\ndata: {"stage":"rubric"}\n\n',
  );
});

test("进度事件中的换行不会破坏SSE分帧", () => {
  const encoded = encodeSseEvent("error", {
    error: "第一行\n第二行",
  });
  assert.equal(encoded.split("\n\n").length, 2);
  assert.doesNotMatch(encoded.split("\n")[1], /\n/);
});
