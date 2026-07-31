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
