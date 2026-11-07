export const ANALYSIS_STAGES = Object.freeze(["rubric", "evidence", "scoring"]);

export function encodeSseEvent(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
