const percySnapshot = require('..');

describe('percySnapshot', () => {
  let og, helpers;

  beforeAll(async () => {
    ({ default: helpers } = await import('@percy/sdk-utils/test/helpers'));
    browser.ignoreSynchronization = true;
  });

  beforeEach(async function() {
    og = browser;
    await helpers.setupTest();
    await browser.get(helpers.testSnapshotURL);
  });

  afterEach(() => {
    browser = og;
  });

  it('throws an error when the browser object is missing', () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrowError('Protractor\'s `browser` was not found.');
  });

  it('throws an error when a name is not provided', () => {
    expect(() => percySnapshot())
      .toThrowError('The `name` argument is required.');
  });

  it('disables snapshots when the healthcheck fails', async () => {
    await helpers.test('error', '/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(helpers.logger.stdout).toEqual(jasmine.arrayContaining([
      '[percy] Percy is not running, disabling snapshots'
    ]));
  });

  it('posts snapshots to the local percy server', async () => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2',
      `- url: ${helpers.testSnapshotURL}`,
      jasmine.stringMatching(/clientInfo: @percy\/protractor\/.+/),
      jasmine.stringMatching(/environmentInfo: protractor\/.+/)
    ]));
  });

  it('handles snapshot failures', async () => {
    await helpers.test('error', '/percy/snapshot');
    await percySnapshot('Snapshot 1');

    expect(helpers.logger.stderr).toEqual(jasmine.arrayContaining([
      '[percy] Could not take DOM snapshot "Snapshot 1"'
    ]));
  });

  it('works in standalone mode', async () => {
    browser = null;

    await percySnapshot(og, 'Snapshot 1');
    await percySnapshot(og, 'Snapshot 2');

    expect(await helpers.get('logs')).toEqual(jasmine.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2'
    ]));
  });

  it('throws the proper argument error in standalone mode', () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrowError("Protractor's `browser` was not found.");
  });

  it('does not include corsIframes when page has no iframes', async () => {
    await percySnapshot('No Iframes Snapshot');

    let logs = await helpers.get('logs');

    expect(logs).toEqual(jasmine.arrayContaining([
      'Snapshot found: No Iframes Snapshot'
    ]));
  });
});

describe('isUnsupportedIframeSrc', () => {
  const { isUnsupportedIframeSrc } = require('..');

  it('returns true for null/undefined/empty src', () => {
    expect(isUnsupportedIframeSrc(null)).toBe(true);
    expect(isUnsupportedIframeSrc(undefined)).toBe(true);
    expect(isUnsupportedIframeSrc('')).toBe(true);
  });

  it('returns true for about:blank', () => {
    expect(isUnsupportedIframeSrc('about:blank')).toBe(true);
  });

  it('returns true for about:srcdoc', () => {
    expect(isUnsupportedIframeSrc('about:srcdoc')).toBe(true);
  });

  it('returns true for javascript: URLs', () => {
    expect(isUnsupportedIframeSrc('javascript:void(0)')).toBe(true);
  });

  it('returns true for data: URLs', () => {
    expect(isUnsupportedIframeSrc('data:text/html,<h1>Test</h1>')).toBe(true);
  });

  it('returns true for blob: URLs', () => {
    expect(isUnsupportedIframeSrc('blob:http://example.com/abc')).toBe(true);
  });

  it('returns true for vbscript: URLs', () => {
    expect(isUnsupportedIframeSrc('vbscript:msgbox')).toBe(true);
  });

  it('returns true for chrome: URLs', () => {
    expect(isUnsupportedIframeSrc('chrome://settings')).toBe(true);
  });

  it('returns true for chrome-extension: URLs', () => {
    expect(isUnsupportedIframeSrc('chrome-extension://abc/page.html')).toBe(true);
  });

  it('returns false for http URLs', () => {
    expect(isUnsupportedIframeSrc('http://example.com')).toBe(false);
  });

  it('returns false for https URLs', () => {
    expect(isUnsupportedIframeSrc('https://example.com/iframe')).toBe(false);
  });
});

describe('getOrigin', () => {
  const { getOrigin } = require('..');

  it('extracts origin from a valid URL', () => {
    expect(getOrigin('https://example.com/path')).toBe('https://example.com');
  });

  it('includes port in origin when specified', () => {
    expect(getOrigin('http://localhost:8080/page')).toBe('http://localhost:8080');
  });

  it('returns null for invalid URLs', () => {
    expect(getOrigin('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getOrigin('')).toBeNull();
  });
});

describe('processFrame', () => {
  const { processFrame } = require('..');

  function mockBrowser(snapshot) {
    return {
      executeScript: jasmine.createSpy('executeScript').and.returnValue(Promise.resolve(snapshot)),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
  }

  function mockLog() {
    return { debug: jasmine.createSpy('debug') };
  }

  it('returns captured iframe data on success', async () => {
    let snapshot = { html: '<html></html>' };
    let b = mockBrowser(snapshot);
    let log = mockLog();
    let iframe = { src: 'https://other.com/frame', index: 0, percyElementId: 'abc123' };

    let result = await processFrame(b, iframe, {}, 'percyDOMScript', log);

    expect(result).toEqual({
      frameUrl: 'https://other.com/frame',
      iframeData: { percyElementId: 'abc123' },
      iframeSnapshot: snapshot
    });
    expect(b.switchTo).toHaveBeenCalled();
  });

  it('returns null when serialization returns empty', async () => {
    let b = mockBrowser(null);
    let log = mockLog();
    let iframe = { src: 'https://other.com/frame', index: 0, percyElementId: 'abc123' };

    let result = await processFrame(b, iframe, {}, 'percyDOMScript', log);

    expect(result).toBeNull();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/empty result/));
  });

  it('returns null and logs on error', async () => {
    let b = {
      executeScript: jasmine.createSpy('executeScript').and.returnValue(Promise.reject(new Error('frame error'))),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();
    let iframe = { src: 'https://other.com/frame', index: 0, percyElementId: 'abc123' };

    let result = await processFrame(b, iframe, {}, 'percyDOMScript', log);

    expect(result).toBeNull();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Failed to process/));
  });

  it('handles switchTo error in finally block', async () => {
    let switchTo = {
      frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
      defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.reject(new Error('switch error')))
    };
    let b = {
      executeScript: jasmine.createSpy('executeScript').and.returnValue(Promise.resolve({ html: '<html></html>' })),
      switchTo: jasmine.createSpy('switchTo').and.returnValue(switchTo)
    };
    let log = mockLog();
    let iframe = { src: 'https://other.com/frame', index: 0, percyElementId: 'abc123' };

    let result = await processFrame(b, iframe, {}, 'percyDOMScript', log);

    expect(result).not.toBeNull();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Failed to switch back/));
  });
});

describe('captureSerializedDOM', () => {
  const { captureSerializedDOM } = require('..');

  function mockLog() {
    return { debug: jasmine.createSpy('debug') };
  }

  it('returns domSnapshot and url with no iframes', async () => {
    let domSnapshot = { html: '<html></html>' };
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.resolve([])
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot).toEqual(domSnapshot);
    expect(result.url).toBe('http://localhost:5338/test');
  });

  it('skips unsupported iframe srcs', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframes = [
      { src: 'about:blank', srcdoc: null, percyElementId: 'a', index: 0 },
      { src: 'javascript:void(0)', srcdoc: null, percyElementId: 'b', index: 1 },
      { src: '', srcdoc: null, percyElementId: 'c', index: 2 }
    ];
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.resolve(iframes)
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Skipping unsupported iframe src/));
  });

  it('skips srcdoc iframes', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframes = [
      { src: 'https://other.com/frame', srcdoc: '<p>inline</p>', percyElementId: 'a', index: 0 }
    ];
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.resolve(iframes)
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Skipping srcdoc iframe/));
  });

  it('skips iframes with invalid URLs', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframes = [
      { src: 'not-a-url', srcdoc: null, percyElementId: 'a', index: 0 }
    ];
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.resolve(iframes)
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Skipping iframe with invalid URL/));
  });

  it('skips same-origin iframes', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframes = [
      { src: 'http://localhost:5338/other-page', srcdoc: null, percyElementId: 'a', index: 0 }
    ];
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.resolve(iframes)
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Skipping same-origin iframe/));
  });

  it('skips cross-origin iframes without percyElementId', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframes = [
      { src: 'https://other.com/frame', srcdoc: null, percyElementId: null, index: 0 }
    ];
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.resolve(iframes)
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeUndefined();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/without data-percy-element-id/));
  });

  it('captures cross-origin iframes successfully', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframeSnapshot = { html: '<iframe-html></iframe-html>' };
    let iframes = [
      { src: 'https://other.com/frame', srcdoc: null, percyElementId: 'abc123', index: 0 }
    ];
    let callCount = 0;
    let b = {
      executeScript: jasmine.createSpy('executeScript').and.callFake(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' });
        if (callCount === 2) return Promise.resolve(iframes);
        if (callCount === 3) return Promise.resolve(); // inject PercyDOM
        return Promise.resolve(iframeSnapshot); // serialize frame
      }),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toEqual([{
      frameUrl: 'https://other.com/frame',
      iframeData: { percyElementId: 'abc123' },
      iframeSnapshot
    }]);
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Captured 1 cross-origin iframe/));
  });

  it('skips cross-origin iframes that fail to process', async () => {
    let domSnapshot = { html: '<html></html>' };
    let iframes = [
      { src: 'https://other.com/frame', srcdoc: null, percyElementId: 'abc123', index: 0 }
    ];
    let callCount = 0;
    let switchTo = {
      frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
      defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
    };
    let b = {
      executeScript: jasmine.createSpy('executeScript').and.callFake(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' });
        if (callCount === 2) return Promise.resolve(iframes);
        // processFrame's executeScript calls - fail on inject
        return Promise.reject(new Error('inject failed'));
      }),
      switchTo: jasmine.createSpy('switchTo').and.returnValue(switchTo)
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeUndefined();
  });

  it('captures nested cross-origin iframes up to MAX_FRAME_DEPTH', async () => {
    let domSnapshot = { html: '<html></html>' };
    let outerIframes = [
      { src: 'https://outer.com/page', srcdoc: null, percyElementId: 'p-outer', index: 0 }
    ];
    let outerSnapshot = { html: '<html>outer</html>' };
    let innerIframesWithinOuter = [
      { src: 'https://inner.com/page', srcdoc: null, percyElementId: 'p-inner', index: 0 }
    ];
    let innerSnapshot = { html: '<html>inner</html>' };
    let innerInnerIframes = []; // no further nesting

    let scriptCalls = [];
    let parentFrameCalls = 0;
    let defaultContentCalls = 0;

    let switchTo = {
      frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
      parentFrame: jasmine.createSpy('parentFrame').and.callFake(() => {
        parentFrameCalls++;
        return Promise.resolve();
      }),
      defaultContent: jasmine.createSpy('defaultContent').and.callFake(() => {
        defaultContentCalls++;
        return Promise.resolve();
      })
    };

    let b = {
      executeScript: jasmine.createSpy('executeScript').and.callFake((fn, ...args) => {
        scriptCalls.push(typeof fn === 'function' ? fn.toString() : fn);
        let last = scriptCalls[scriptCalls.length - 1];
        // 1) top-level domSnapshot+url
        if (last.includes('domSnapshot:')) {
          return Promise.resolve({ domSnapshot, url: 'http://localhost:5338/host' });
        }
        // 2/4/6) iframe enumeration in current context
        if (last.includes("querySelectorAll('iframe')") || last.includes('querySelectorAll("iframe")')) {
          // Return progressively shallower nesting
          if (scriptCalls.filter(s => s.includes('querySelectorAll')).length === 1) return Promise.resolve(outerIframes);
          if (scriptCalls.filter(s => s.includes('querySelectorAll')).length === 2) return Promise.resolve(innerIframesWithinOuter);
          return Promise.resolve(innerInnerIframes);
        }
        // 3/5) percyDOMScript injection (passed as a string)
        if (typeof fn === 'string') return Promise.resolve();
        // PercyDOM.serialize call inside a frame (top-level serialize is matched
        // earlier via the 'domSnapshot:' marker, so any remaining serialize
        // call is from a nested frame).
        if (last.includes('PercyDOM.serialize')) {
          let frameSerializeCalls = scriptCalls.filter(s => s.includes('PercyDOM.serialize') && !s.includes('domSnapshot:')).length;
          if (frameSerializeCalls === 1) return Promise.resolve(outerSnapshot);
          return Promise.resolve(innerSnapshot);
        }
        return Promise.resolve();
      }),
      switchTo: jasmine.createSpy('switchTo').and.returnValue(switchTo)
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot.corsIframes).toBeDefined();
    expect(result.domSnapshot.corsIframes.length).toBe(2);
    expect(result.domSnapshot.corsIframes[0]).toEqual({
      frameUrl: 'https://outer.com/page',
      iframeData: { percyElementId: 'p-outer' },
      iframeSnapshot: outerSnapshot
    });
    expect(result.domSnapshot.corsIframes[1]).toEqual({
      frameUrl: 'https://inner.com/page',
      iframeData: { percyElementId: 'p-inner' },
      iframeSnapshot: innerSnapshot
    });
    // Two depth-up restorations (one per recursion level).
    expect(parentFrameCalls).toBe(2);
  });

  it('handles errors during CORS iframe processing gracefully', async () => {
    let domSnapshot = { html: '<html></html>' };
    let b = {
      executeScript: jasmine.createSpy('executeScript')
        .and.returnValues(
          Promise.resolve({ domSnapshot, url: 'http://localhost:5338/test' }),
          Promise.reject(new Error('script error'))
        ),
      switchTo: jasmine.createSpy('switchTo').and.returnValue({
        frame: jasmine.createSpy('frame').and.returnValue(Promise.resolve()),
        defaultContent: jasmine.createSpy('defaultContent').and.returnValue(Promise.resolve())
      })
    };
    let log = mockLog();

    let result = await captureSerializedDOM(b, {}, 'percyDOMScript', log);

    expect(result.domSnapshot).toEqual(domSnapshot);
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Error capturing CORS iframes/));
  });
});
