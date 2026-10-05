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

// The date we actually published this item on our own site (set by the
// rewrite pass at the moment it rewrites an item), not the source
// article's original publish date. Falls back to `publishedAt` for any
// item that predates this field. Using this — instead of the source's
// date — for display and sort order means "Top News" reflects how
// recently *we* added a story, which is always true, rather than how
// recently the original outlet wrote it, which can be days or weeks
// stale even for a story we just rewrote today.
export function effectiveDate(item) {
  return item.rewrittenAt || item.publishedAt;
}

export function byRecency(a, b) {
  return new Date(effectiveDate(b)) - new Date(effectiveDate(a));
}
