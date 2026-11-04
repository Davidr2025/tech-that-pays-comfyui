// Merges manually-maintained claim/correction data onto a Google-Places-sourced
// business record. Both data files are hand-edited (or edited by the claim-
// processing routine) and keyed by Google place id, so they survive the
// monthly Places refresh in fetch-places.mjs untouched.
export function applyListingOverrides(business, corrections) {
  const fix = corrections[business.id];
  return fix ? { ...business, ...fix } : business;
}

export function withClaimed(business, claimedPlaces) {
  const claim = claimedPlaces.find((c) => c.id === business.id);
  return { ...business, claimed: Boolean(claim), claimedEmail: claim?.email || null };
}

// fetch-places.mjs stores photo as a path relative to public/ (e.g.
// "images/places/<id>.jpg") so it needs the site's base prefix at render
// time; older cached entries from before the local-photo-cache change may
// still hold a full Google-hosted URL, which must be used as-is.
export function photoSrc(photo, base) {
  if (!photo) return null;
  return /^https?:\/\//.test(photo) ? photo : `${base}${photo}`;
}
