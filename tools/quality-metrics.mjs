import "../scoring-core.js";
import "../anchored-scoring.js";

const protocol = globalThis.AIJobAssistantAnchoredScoring;
const normalize = (value) => typeof value === "string"
  ? value.normalize("NFKC").replace(/[\s。；;]+/gu, "").trim()
  : "";

function supports(quote, accepted) {
  const text = normalize(quote);
  return accepted.some((reference) => text.includes(reference));
}

export function qualityMetrics(analysis, resume, labels) {
  const evidence = analysis.evidenceItems || [];
  const gateById = new Map((analysis.resumeTable?.evidence || []).map((row) => [row.requirement_id, row.hard_status]));
  const anchors = new Map(protocol.resumeAnchors(protocol.redact(resume, { resume: true }))
    .map((span) => [span.id, span.quote]));
  const metrics = {
    labels: labels.length, unaligned: 0,
    evidenceExpected: 0, evidencePublished: 0, evidenceCorrect: 0,
    retrievalExpected: 0, retrievalFound: 0, abstained: 0, coreLabels: 0,
    gateExpected: 0, gateDecided: 0, gateCorrect: 0, falseBlocks: 0,
    statusExpected: 0, statusCorrect: 0,
  };
  for (const label of labels) {
    const matches = evidence.filter((row) => normalize(row.jobEvidence) === normalize(label.jd_quote));
    const item = matches.length === 1 ? matches[0] : null;
    if (!item) metrics.unaligned += 1;
    if (label.hard_status) {
      metrics.gateExpected += 1;
      const actual = item && gateById.get(item.requirementId);
      if (actual === "met" || actual === "unmet") metrics.gateDecided += 1;
      if (actual === label.hard_status) metrics.gateCorrect += 1;
      if (actual === "unmet" && label.hard_status !== "unmet") metrics.falseBlocks += 1;
      continue;
    }
    metrics.coreLabels += 1;
    const accepted = label.evidence_quotes.map(normalize).filter(Boolean);
    if (label.evidence_status) {
      metrics.statusExpected += 1;
      const actual = item?.assessment === "none" || (!item?.assessment && item?.status === "unknown")
        ? "none" : item?.status;
      if (actual === label.evidence_status) metrics.statusCorrect += 1;
    }
    if (accepted.length) metrics.evidenceExpected += 1;
    if (Array.isArray(item?.candidateSpanIds) && accepted.length) {
      metrics.retrievalExpected += 1;
      if (item.candidateSpanIds.some((id) => supports(anchors.get(id), accepted))) {
        metrics.retrievalFound += 1;
      }
    }
    if (!item || ["uncertain", "conflict", "unassessed"].includes(item.assessment)) metrics.abstained += 1;
    if (!item || !["direct", "partial"].includes(item.status)) continue;
    metrics.evidencePublished += 1;
    if (supports(item.resumeEvidence, accepted)) metrics.evidenceCorrect += 1;
  }
  const ratio = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
  return {
    ...metrics,
    precision: ratio(metrics.evidenceCorrect, metrics.evidencePublished),
    recall: ratio(metrics.evidenceCorrect, metrics.evidenceExpected),
    retrievalRecall: ratio(metrics.retrievalFound, metrics.retrievalExpected),
    gateAccuracy: ratio(metrics.gateCorrect, metrics.gateExpected),
    abstentionRate: ratio(metrics.abstained, metrics.coreLabels),
    evidenceStatusAccuracy: ratio(metrics.statusCorrect, metrics.statusExpected),
  };
}

export function validateLabels(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("人工标注应按案例编号组织");
  for (const [caseId, rows] of Object.entries(input)) {
    if (!Array.isArray(rows) || rows.some((row) =>
      !normalize(row?.jd_quote) ||
      (row.hard_status !== undefined
        ? !["met", "unmet", "unknown"].includes(row.hard_status)
        : !Array.isArray(row.evidence_quotes) || row.evidence_quotes.some((quote) => !normalize(quote)) ||
          (row.evidence_status !== undefined && !["direct", "partial", "none"].includes(row.evidence_status))),
    )) throw new Error("人工标注格式错误：" + caseId);
  }
  return input;
}
