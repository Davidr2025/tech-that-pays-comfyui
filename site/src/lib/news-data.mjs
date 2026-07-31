// Hard backstop for the news-rewrite pass (a Routine that rewrites
// headlines/summaries into original wording — see the news pipeline docs
// in README.md). Prompt instructions can drift over time; this is a
// code-level gate so a regression can only ever hide an item, never
// publish a source-copy, a too-thin summary, or one missing attribution.
const ATTRIBUTION_RE =
  /according to|says|said|say[s]?\b|reports?|reported|confirms?|confirmed|announces?|announced|tells|told|writes|wrote|shows?|found that/i;

export function isPublishable(item) {
  if (!item.rewritten || !item.summary) return false;
  const sentenceCount = (item.summary.match(/[.!?]+(\s|$)/g) || []).length;
  return item.summary.length >= 400 && sentenceCount >= 5 && ATTRIBUTION_RE.test(item.summary);
}
