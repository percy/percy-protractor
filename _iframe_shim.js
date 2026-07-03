// Local shim: extends @percy/sdk-utils with helpers the published 1.31.14
// does not yet export. SDK code expects these names; we delegate to the
// canonical sdk-utils exports (the single source of truth) when the linked
// version provides them, and fall back to contract-identical local copies
// otherwise.
const utils = require('@percy/sdk-utils');

// MIRROR: must match UNSUPPORTED_IFRAME_SRCS in @percy/sdk-utils. Only used
// when the linked sdk-utils predates the canonical export.
const BROWSER_INTERNAL_PREFIXES = [
  'about:', 'chrome:', 'chrome-extension:', 'devtools:',
  'edge:', 'opera:', 'view-source:', 'data:', 'javascript:', 'blob:',
  // legacy IE-era schemes that still appear on adversarial pages
  'vbscript:', 'file:', 'ws:', 'wss:', 'ftp:'
];

// Canonical contract: per-snapshot `maxIframeDepth` wins over the global
// `percy.config.snapshot.maxIframeDepth`, then the value is clamped to
// [1, HARD_MAX_IFRAME_DEPTH] (invalid/<1 -> default). The published 1.31.14
// already exports `clampIframeDepth`, so clamping semantics are shared.
function resolveMaxFrameDepth(options = {}) {
  let raw = options.maxIframeDepth;
  if (raw == null) raw = utils.percy.config && utils.percy.config.snapshot && utils.percy.config.snapshot.maxIframeDepth;
  return utils.clampIframeDepth(raw);
}

// Canonical contract: takes a raw value (array | string | unset), NOT an
// options object, and normalizes it into a clean string[].
function normalizeIgnoreSelectors(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(s => typeof s === 'string' && s.length);
  if (typeof value === 'string') return [value];
  return [];
}

// Canonical contract: per-snapshot `ignoreIframeSelectors` (legacy alias
// `ignoreSelectors`) wins; when absent, fall back to the global
// `percy.config.snapshot.ignoreIframeSelectors`. Always returns a string[].
function resolveIgnoreSelectors(options = {}) {
  const perSnapshot = normalizeIgnoreSelectors(options.ignoreIframeSelectors ?? options.ignoreSelectors);
  if (perSnapshot.length) return perSnapshot;
  return normalizeIgnoreSelectors(utils.percy.config && utils.percy.config.snapshot && utils.percy.config.snapshot.ignoreIframeSelectors);
}

function isUnsupportedIframeSrc(src) {
  if (!src) return true;
  const s = String(src).toLowerCase();
  return BROWSER_INTERNAL_PREFIXES.some(p => s.startsWith(p));
}

// Prefer the canonical sdk-utils implementation when the linked version
// exports it; otherwise use the local fallback above. Which arm runs depends
// solely on the linked @percy/sdk-utils version, so coverage of the arms is
// mode-dependent — the fallbacks themselves are covered directly through
// `_localFallbacks` below.
/* istanbul ignore next: arm taken depends on the linked @percy/sdk-utils version */
function preferCanonical(name, fallback) {
  return utils[name] || fallback;
}

module.exports = Object.assign({}, utils, {
  resolveMaxFrameDepth: preferCanonical('resolveMaxFrameDepth', resolveMaxFrameDepth),
  resolveIgnoreSelectors: preferCanonical('resolveIgnoreSelectors', resolveIgnoreSelectors),
  normalizeIgnoreSelectors: preferCanonical('normalizeIgnoreSelectors', normalizeIgnoreSelectors),
  isUnsupportedIframeSrc: preferCanonical('isUnsupportedIframeSrc', isUnsupportedIframeSrc)
});

// Exposed for tests only: the local fallbacks must stay contract-identical to
// the canonical sdk-utils exports no matter which arm preferCanonical picked.
module.exports._localFallbacks = {
  resolveMaxFrameDepth,
  resolveIgnoreSelectors,
  normalizeIgnoreSelectors,
  isUnsupportedIframeSrc
};
