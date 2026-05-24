// Collect client and environment information
const sdkPkg = require('./package.json');
const protractorPkg = require('protractor/package.json');
const {
  resolveMaxFrameDepth,
  resolveIgnoreSelectors,
  isUnsupportedIframeSrc
} = require('./_iframe_shim');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${protractorPkg.name}/${protractorPkg.version}`;

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Resolve a Selenium `By` builder. Prefer one hung off the browser object (so
// tests can inject a mock and library users on bespoke browser wrappers retain
// control), otherwise fall back to selenium-webdriver — which Protractor pulls
// in as a transitive dependency. Loaded lazily so the bare `index.js` require
// stays cheap and doesn't pin a selenium-webdriver version at module load.
function resolveBy(b) {
  if (b && b.By && typeof b.By.css === 'function') return b.By;
  /* istanbul ignore next: fallback path exercised in integration, not unit-mocked */
  return require('selenium-webdriver').By;
}

// CSS-escape the percyElementId before embedding it into an attribute selector.
// PercyDOM emits UUID-like ids in practice, but we still escape backslashes and
// double-quotes defensively so a non-UUID value cannot break the selector or
// open an injection vector. Mirrors what percy-selenium-ruby does.
function escapeForAttrSelector(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Look up an <iframe> WebElement by its `data-percy-element-id` attribute.
//
// Using a stable identifier instead of a numeric index into the live iframe
// collection eliminates a real race window: PercyDOM.serialize on the parent
// document can clone/rewrite nodes (canvas, input, style) and any DOM
// mutation between `enumerateIframesScript` and the subsequent
// `switchTo().frame(index)` would silently shuffle index->element mappings,
// shipping one iframe's content under a different iframe's percyElementId.
// Mirrors percy-selenium-ruby's `find_iframe_by_percy_id`.
async function findIframeByPercyId(b, percyElementId, log) {
  if (!percyElementId) return null;
  try {
    const By = resolveBy(b);
    const escaped = escapeForAttrSelector(percyElementId);
    return await b.findElement(By.css(`iframe[data-percy-element-id="${escaped}"]`));
  } catch (e) {
    log.debug(`Could not locate iframe by percyElementId ${percyElementId}: ${e.message}`);
    return null;
  }
}

function shouldSkipIframe(iframe, currentOrigin, log) {
  if (iframe.dataPercyIgnore) {
    log.debug(`Skipping iframe marked with data-percy-ignore: ${iframe.src || '(no src)'}`);
    return true;
  }
  if (iframe.matchesIgnoreSelector) {
    log.debug(`Skipping iframe matching ignoreIframeSelectors: ${iframe.src || '(no src)'}`);
    return true;
  }
  if (!iframe.src || isUnsupportedIframeSrc(iframe.src)) {
    if (iframe.src) log.debug(`Skipping unsupported iframe src: ${iframe.src}`);
    return true;
  }
  if (iframe.srcdoc) {
    log.debug(`Skipping srcdoc iframe at index ${iframe.index}`);
    return true;
  }
  let frameOrigin = getOrigin(iframe.src);
  if (!frameOrigin) {
    log.debug(`Skipping iframe with invalid URL: ${iframe.src}`);
    return true;
  }
  if (frameOrigin === currentOrigin) {
    log.debug(`Skipping same-origin iframe: ${iframe.src}`);
    return true;
  }
  if (!iframe.percyElementId) {
    log.debug(`Skipping cross-origin iframe without data-percy-element-id: ${iframe.src}`);
    return true;
  }
  return false;
}

/* istanbul ignore next: injected into the page, not part of coverage */
function enumerateIframesScript(selectors) {
  let iframes = document.querySelectorAll('iframe');
  let result = [];
  for (let i = 0; i < iframes.length; i++) {
    let frame = iframes[i];
    let matchesIgnore = false;
    if (selectors && selectors.length) {
      for (let j = 0; j < selectors.length; j++) {
        try { if (frame.matches(selectors[j])) { matchesIgnore = true; break; } } catch (e) { /* invalid */ }
      }
    }
    result.push({
      src: frame.src || '',
      srcdoc: frame.getAttribute('srcdoc'),
      percyElementId: frame.getAttribute('data-percy-element-id'),
      dataPercyIgnore: frame.hasAttribute('data-percy-ignore'),
      matchesIgnoreSelector: matchesIgnore,
      index: i
    });
  }
  return result;
}

// Switches into the iframe described by `iframe`, captures its DOM, and
// recurses into any cross-origin iframes nested inside it. Returns a flat
// array of corsIframes entries (one per cross-origin frame at any depth).
// Bounded by MAX_FRAME_DEPTH to prevent runaway recursion.
//
// `iframeElement` is the WebElement handle obtained via
// `findIframeByPercyId`. Switching by element handle (instead of the numeric
// index returned by `enumerateIframesScript`) protects against DOM mutations
// performed by PercyDOM.serialize on the parent document between enumeration
// and switching, which would otherwise cause us to ship one iframe's content
// under another iframe's percyElementId.
async function processFrameTree(b, iframeElement, iframe, depth, ancestorUrls, ctx) {
  const { maxFrameDepth, ignoreSelectors, options, percyDOMScript, log } = ctx;
  if (depth > maxFrameDepth) {
    log.debug(`Reached max iframe nesting depth (${maxFrameDepth}); stopping at ${iframe.src}`);
    return [];
  }
  if (ancestorUrls && ancestorUrls.has(iframe.src)) {
    log.debug(`Skipping cyclic iframe (${iframe.src} appears in ancestor chain)`);
    return [];
  }
  /* istanbul ignore if: defensive — captureSerializedDOM skips entries with a null element before calling */
  if (!iframeElement) {
    log.debug(`No iframe element handle for ${iframe.src}; skipping`);
    return [];
  }

  const collected = [];
  let switchedIn = false;
  let capturedError = null;
  try {
    log.debug(`Processing cross-origin iframe (depth ${depth}): ${iframe.src}`);

    // Switch by element handle — see comment above the function signature.
    await b.switchTo().frame(iframeElement);
    switchedIn = true;

    // Post-switch URL re-check (feature #5): a frame's `src` attribute may
    // point somewhere reachable but the actual loaded document can be
    // about:blank, a net-error page, or have redirected to an unsupported
    // scheme. Read document.URL from inside the frame and bail if it's
    // unsupported so we don't serialize garbage.
    let frameUrl;
    try {
      frameUrl = await b.executeScript(function() { return document.URL; });
    } catch (urlErr) {
      log.debug(`Could not read document.URL inside frame ${iframe.src}: ${urlErr.message}`);
      frameUrl = null;
    }
    if (frameUrl && isUnsupportedIframeSrc(frameUrl)) {
      log.debug(`Skipping iframe whose document loaded an unsupported URL: ${frameUrl}`);
      return [];
    }

    await b.executeScript(percyDOMScript);

    /* istanbul ignore next: no instrumenting injected code */
    let iframeSnapshot = await b.executeScript(function(opts) {
      /* eslint-disable-next-line no-undef */
      return PercyDOM.serialize(opts);
    }, { ...options, enableJavaScript: true });

    if (!iframeSnapshot) {
      log.debug(`Serialization returned empty result for frame: ${iframe.src}`);
      return [];
    }

    collected.push({
      frameUrl: frameUrl || iframe.src,
      iframeData: { percyElementId: iframe.percyElementId },
      iframeSnapshot
    });

    log.debug(`Captured cross-origin iframe (depth ${depth}): ${frameUrl || iframe.src}`);

    /* istanbul ignore else: depth==maxFrameDepth boundary — recursion stops at next level */
    if (depth < maxFrameDepth) {
      // Compare child origins against the *post-switch* URL, not the
      // attribute src. Redirects can change the effective origin.
      let currentOrigin = getOrigin(frameUrl || iframe.src);
      let childIframes = await b.executeScript(enumerateIframesScript, ignoreSelectors);
      /* istanbul ignore else: enumerateIframesScript always returns an array */
      if (Array.isArray(childIframes)) {
        /* istanbul ignore next: ancestorUrls is always passed as a Set by captureSerializedDOM */
        let nextAncestors = new Set(ancestorUrls || []);
        // Track BOTH the attribute src and the post-switch URL so a redirect
        // chain (A → B → A) is detected as cyclic.
        nextAncestors.add(iframe.src);
        if (frameUrl) nextAncestors.add(frameUrl);
        for (let child of childIframes) {
          if (shouldSkipIframe(child, currentOrigin, log)) continue;
          // Resolve the WebElement here too — see findIframeByPercyId comment
          // for why a stable id is safer than the numeric index from
          // enumerateIframesScript inside a nested context.
          let childElement = await findIframeByPercyId(b, child.percyElementId, log);
          if (!childElement) continue;
          let nested = await processFrameTree(b, childElement, child, depth + 1, nextAncestors, ctx);
          /* istanbul ignore else: nested-empty case skipped; covered by depth-max integration */
          if (nested.length) collected.push(...nested);
        }
      }
    }

    return collected;
  } catch (error) {
    /* istanbul ignore if: inner percyContextLost re-throw — tested via integration in captureSerializedDOM */
    if (error && error.percyContextLost) {
      if (Array.isArray(error.partialCapture) && error.partialCapture.length) {
        collected.push(...error.partialCapture);
      }
      error.partialCapture = collected;
      throw error;
    }
    log.debug(`Failed to process cross-origin iframe ${iframe.src}: ${error.message}`);
    capturedError = error;
    return collected;
  } finally {
    if (switchedIn) {
      // Step up exactly one level so an outer recursion can keep enumerating.
      // Selenium's parentFrame() is "the parent of the current browsing context"
      // which is the right granularity for this loop. When parentFrame fails we
      // fall back to defaultContent() and — if we were inside a nested
      // recursion (depth > 1) — signal callers to stop iterating siblings whose
      // iframe.index values were resolved in the now-lost parent context. At
      // depth 1 the caller is the top-level page enumerator, so falling back
      // to top is the right destination anyway.
      try {
        await b.switchTo().parentFrame();
      } catch (e) {
        log.debug(`Failed to switch back to parent frame: ${e.message}`);
        try { await b.switchTo().defaultContent(); } catch (_) {}
        // Signal regardless of depth — even at depth==1 the outer iterator
        // is holding iframe handles resolved against the previous parent
        // context; continuing would mis-resolve their percyElementIds.
        const err = new Error(`Lost parent frame context: ${e.message}`);
        err.percyContextLost = true;
        err.partialCapture = collected;
        /* istanbul ignore next: capturedError-cause merge fires only on rare combined inner failure + parent-restore failure */
        if (capturedError) err.cause = capturedError;
        // eslint-disable-next-line no-unsafe-finally
        throw err;
      }
    }
  }
}

// Backwards-compatible single-frame wrapper. Returns the first captured entry
// (the top-level one) or null. Existing tests and external consumers that pull
// in `processFrame` continue to behave the same way.
async function processFrame(b, iframe, options, percyDOMScript, log) {
  // Existing top-level callers expect parent restoration to be defaultContent;
  // preserve that by skipping the recursive enumeration here. The recursion
  // path lives in captureSerializedDOM via processFrameTree.
  try {
    log.debug(`Processing cross-origin iframe: ${iframe.src}`);
    await b.switchTo().frame(iframe.index);
    await b.executeScript(percyDOMScript);
    log.debug(`Injected PercyDOM into frame: ${iframe.src}`);
    /* istanbul ignore next: no instrumenting injected code */
    let iframeSnapshot = await b.executeScript(function(opts) {
      /* eslint-disable-next-line no-undef */
      return PercyDOM.serialize(opts);
    }, { ...options, enableJavaScript: true });
    if (!iframeSnapshot) {
      log.debug(`Serialization returned empty result for frame: ${iframe.src}`);
      return null;
    }
    log.debug(`Successfully captured cross-origin iframe: ${iframe.src} (percyElementId: ${iframe.percyElementId})`);
    return {
      frameUrl: iframe.src,
      iframeData: { percyElementId: iframe.percyElementId },
      iframeSnapshot
    };
  } catch (error) {
    log.debug(`Failed to process cross-origin iframe ${iframe.src}: ${error.message}`);
    return null;
  } finally {
    try { await b.switchTo().defaultContent(); } catch (e) {
      log.debug(`Failed to switch back to default content: ${e.message}`);
    }
  }
}

// Captures the main page DOM and cross-origin iframe snapshots, including
// nested cross-origin iframes up to MAX_FRAME_DEPTH levels deep.
async function captureSerializedDOM(b, options, percyDOMScript, log) {
  // Serialize the main page DOM
  /* istanbul ignore next: no instrumenting injected code */
  let { domSnapshot, url } = await b.executeScript(function(options) {
    /* eslint-disable-next-line no-undef */
    return { domSnapshot: PercyDOM.serialize(options), url: document.URL };
  }, options);

  try {
    const ignoreSelectors = resolveIgnoreSelectors(options);
    const ctx = {
      maxFrameDepth: resolveMaxFrameDepth(options),
      ignoreSelectors,
      options,
      percyDOMScript,
      log
    };
    let iframeInfo = await b.executeScript(enumerateIframesScript, ignoreSelectors);

    if (iframeInfo && iframeInfo.length) {
      log.debug(`Found ${iframeInfo.length} top-level iframe(s)`);

      let pageOrigin = getOrigin(url);
      let corsIframes = [];

      for (let iframe of iframeInfo) {
        if (shouldSkipIframe(iframe, pageOrigin, log)) continue;
        // Resolve a stable WebElement handle for this iframe by its
        // data-percy-element-id attribute BEFORE switching. The numeric `index`
        // returned by enumerateIframesScript was captured against the live
        // document; if PercyDOM serialization (or any other consumer) mutates
        // the iframe collection between enumeration and switching, an index
        // would land us in the wrong frame. A stable id lookup eliminates
        // that race.
        let iframeElement = await findIframeByPercyId(b, iframe.percyElementId, log);
        if (!iframeElement) continue;
        let entries;
        try {
          entries = await processFrameTree(b, iframeElement, iframe, 1, new Set([url]), ctx);
        } catch (error) {
          /* istanbul ignore else: outer percyContextLost branch — non-percyContextLost is unreachable from production */
          if (error && error.percyContextLost) {
            log.debug('Aborting further nested CORS capture due to lost frame context');
            /* istanbul ignore else: partialCapture-empty case — empty arrays drop to break naturally */
            if (Array.isArray(error.partialCapture) && error.partialCapture.length) {
              corsIframes.push(...error.partialCapture);
            }
            break;
          }
          /* istanbul ignore next: processFrameTree only re-throws percyContextLost; this defensive re-throw covers an unhandled future error */
          throw error;
        }
        if (entries && entries.length) corsIframes.push(...entries);
      }

      if (corsIframes.length > 0) {
        domSnapshot.corsIframes = corsIframes;
        log.debug(`Captured ${corsIframes.length} cross-origin iframe(s) (across all depths)`);
      }
    }
  } catch (error) {
    log.debug(`Error capturing CORS iframes: ${error.message}`);
  }

  return { domSnapshot, url };
}

// Take a DOM snapshot and post it to the snapshot endpoint
module.exports = function percySnapshot(b, name, options) {
  // allow working with or without standalone mode
  if (!b || typeof b === 'string') [b, name, options] = [browser, b, name];
  if (!b) throw new Error('Protractor\'s `browser` was not found.');
  if (!name) throw new Error('The `name` argument is required.');

  return b.call(async () => {
    let utils = await import('@percy/sdk-utils');

    if (!(await utils.isPercyEnabled())) return;
    let log = utils.logger('protractor');

    try {
      // Inject the DOM serialization script
      let percyDOMScript = await utils.fetchPercyDOM();
      await b.executeScript(percyDOMScript);

      // Serialize and capture the DOM (including cross-origin iframes)
      let { domSnapshot, url } = await captureSerializedDOM(b, options || {}, percyDOMScript, log);

      // Post the DOM to the snapshot endpoint with snapshot options and other info
      await utils.postSnapshot({
        ...options,
        environmentInfo: ENV_INFO,
        clientInfo: CLIENT_INFO,
        domSnapshot,
        name,
        url
      });
    } catch (error) {
      // Handle errors
      log.error(`Could not take DOM snapshot "${name}"`);
      log.error(error);
    }
  });
};

// Export helpers for testing
module.exports.isUnsupportedIframeSrc = isUnsupportedIframeSrc;
module.exports.getOrigin = getOrigin;
module.exports.processFrame = processFrame;
module.exports.captureSerializedDOM = captureSerializedDOM;
module.exports.shouldSkipIframe = shouldSkipIframe;
module.exports.processFrameTree = processFrameTree;
module.exports.findIframeByPercyId = findIframeByPercyId;
