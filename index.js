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

// Processes a single cross-origin iframe to capture its snapshot
async function processFrame(b, iframe, options, percyDOMScript, log) {
  try {
    log.debug(`Processing cross-origin iframe: ${iframe.src}`);

    // Switch to the iframe by its DOM index
    await b.switchTo().frame(iframe.index);

    // Inject PercyDOM into the frame
    await b.executeScript(percyDOMScript);
    log.debug(`Injected PercyDOM into frame: ${iframe.src}`);

    // Serialize the frame's DOM with enableJavaScript: true
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
    // Always restore context to the top-level page
    try {
      await b.switchTo().defaultContent();
    } catch (e) {
      log.debug(`Failed to switch back to default content: ${e.message}`);
    }
  }
}

// Captures the main page DOM and cross-origin iframe snapshots
async function captureSerializedDOM(b, options, percyDOMScript, log) {
  // Serialize the main page DOM
  /* istanbul ignore next: no instrumenting injected code */
  let { domSnapshot, url } = await b.executeScript(function(options) {
    /* eslint-disable-next-line no-undef */
    return { domSnapshot: PercyDOM.serialize(options), url: document.URL };
  }, options);

  // Process cross-origin iframes
  try {
    /* istanbul ignore next: no instrumenting injected code */
    let iframeInfo = await b.executeScript(function() {
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
    });

    if (iframeInfo && iframeInfo.length) {
      log.debug(`Found ${iframeInfo.length} total iframe(s) on page`);

      let pageOrigin = getOrigin(url);
      let corsIframes = [];

      for (let iframe of iframeInfo) {
        if (!iframe.src || isUnsupportedIframeSrc(iframe.src)) {
          if (iframe.src) log.debug(`Skipping unsupported iframe src: ${iframe.src}`);
          continue;
        }
        if (iframe.srcdoc) {
          log.debug(`Skipping srcdoc iframe at index ${iframe.index}`);
          continue;
        }

        let frameOrigin = getOrigin(iframe.src);
        if (!frameOrigin) {
          log.debug(`Skipping iframe with invalid URL: ${iframe.src}`);
          continue;
        }
        if (frameOrigin === pageOrigin) {
          log.debug(`Skipping same-origin iframe: ${iframe.src}`);
          continue;
        }

        if (!iframe.percyElementId) {
          log.debug(`Skipping cross-origin iframe without data-percy-element-id: ${iframe.src}`);
          continue;
        }

        let result = await processFrame(b, iframe, options, percyDOMScript, log);
        if (result) corsIframes.push(result);
      }

      if (corsIframes.length > 0) {
        domSnapshot.corsIframes = corsIframes;
        log.debug(`Captured ${corsIframes.length} cross-origin iframe(s)`);
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
