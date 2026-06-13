// Shared guard: a patch is "annotation-only" when its newText is the oldText
// with nothing changed except added/edited comments — applying it changes no
// executable code, so it must never be offered as a one-click autofix or
// editor quick-fix (that would claim a fix while doing nothing). Defense in
// depth on top of correct rule `safety` classification.
export function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
}

export function isAnnotationOnlyPatch(patch: { oldText?: string; newText?: string } | null | undefined): boolean {
  if (!patch?.oldText || !patch?.newText) return true;
  return stripComments(patch.oldText) === stripComments(patch.newText);
}

/** A patch is auto-applicable only if it's catalog-safe AND materially changes code. */
export function isAutoApplicable(opt: { safety?: string; patch?: { oldText?: string; newText?: string } | null }): boolean {
  return opt.safety === "safe" && !isAnnotationOnlyPatch(opt.patch);
}
