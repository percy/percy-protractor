// Collect client and environment information
const sdkPkg = require('./package.json');
const protractorPkg = require('protractor/package.json');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${protractorPkg.name}/${protractorPkg.version}`;

const UNSUPPORTED_IFRAME_SRCS = [
  'about:blank',
  'about:srcdoc',
  'javascript:',
  'data:',
  'blob:',
  'vbscript:',
  'chrome:',
  'chrome-extension:'
];

const MAX_FRAME_DEPTH = 10;

function isUnsupportedIframeSrc(src) {
  if (!src) return true;
  return UNSUPPORTED_IFRAME_SRCS.some(prefix => src === prefix || src.startsWith(prefix));
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function shouldSkipIframe(iframe, currentOrigin, log) {
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
function enumerateIframesScript() {
  let iframes = document.querySelectorAll('iframe');
  let result = [];
  for (let i = 0; i < iframes.length; i++) {
    result.push({
      src: iframes[i].src || '',
      srcdoc: iframes[i].getAttribute('srcdoc'),
      percyElementId: iframes[i].getAttribute('data-percy-element-id'),
      index: i
    });
  }
  return result;
}

// Switches into the iframe described by `iframe`, captures its DOM, and
// recurses into any cross-origin iframes nested inside it. Returns a flat
// array of corsIframes entries (one per cross-origin frame at any depth).
// Bounded by MAX_FRAME_DEPTH to prevent runaway recursion.
async function processFrameTree(b, iframe, depth, options, percyDOMScript, log) {
  if (depth > MAX_FRAME_DEPTH) {
    log.debug(`Reached max iframe nesting depth (${MAX_FRAME_DEPTH}); stopping at ${iframe.src}`);
    return [];
  }

  const collected = [];
  let switchedIn = false;
  try {
    log.debug(`Processing cross-origin iframe (depth ${depth}): ${iframe.src}`);

    await b.switchTo().frame(iframe.index);
    switchedIn = true;

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
      frameUrl: iframe.src,
      iframeData: { percyElementId: iframe.percyElementId },
      iframeSnapshot
    });

    log.debug(`Captured cross-origin iframe (depth ${depth}): ${iframe.src}`);

    if (depth < MAX_FRAME_DEPTH) {
      let currentOrigin = getOrigin(iframe.src);
      let childIframes = await b.executeScript(enumerateIframesScript);
      if (Array.isArray(childIframes)) {
        for (let child of childIframes) {
          if (shouldSkipIframe(child, currentOrigin, log)) continue;
          let nested = await processFrameTree(b, child, depth + 1, options, percyDOMScript, log);
          if (nested.length) collected.push(...nested);
        }
      }
    }

    return collected;
  } catch (error) {
    log.debug(`Failed to process cross-origin iframe ${iframe.src}: ${error.message}`);
    return collected;
  } finally {
    if (switchedIn) {
      // Step up exactly one level so an outer recursion can keep enumerating.
      // Selenium's parentFrame() is "the parent of the current browsing context"
      // which is the right granularity for this loop.
      try {
        await b.switchTo().parentFrame();
      } catch (e) {
        log.debug(`Failed to switch back to parent frame: ${e.message}; falling back to defaultContent()`);
        try { await b.switchTo().defaultContent(); } catch (_) {}
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
    let iframeInfo = await b.executeScript(enumerateIframesScript);

    if (iframeInfo && iframeInfo.length) {
      log.debug(`Found ${iframeInfo.length} top-level iframe(s)`);

      let pageOrigin = getOrigin(url);
      let corsIframes = [];

      for (let iframe of iframeInfo) {
        if (shouldSkipIframe(iframe, pageOrigin, log)) continue;
        let entries = await processFrameTree(b, iframe, 1, options, percyDOMScript, log);
        if (entries.length) corsIframes.push(...entries);
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
