const { shouldSkipIframe, processFrameTree, findIframeByPercyId } = require('../index.js');
const shim = require('../_iframe_shim.js');

// A placeholder representing a Selenium WebElement handle. processFrameTree
// passes it back to switchTo().frame() and our mocks below ignore the value.
const FAKE_ELEMENT = { __fakeWebElement: true };

describe('shouldSkipIframe', () => {
  let log;
  beforeEach(() => {
    log = { debug: () => {} };
  });

  it('skips iframe with dataPercyIgnore=true', () => {
    expect(shouldSkipIframe({ dataPercyIgnore: true, src: 'https://x.com', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with dataPercyIgnore=true and missing src', () => {
    expect(shouldSkipIframe({ dataPercyIgnore: true, index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with matchesIgnoreSelector=true', () => {
    expect(shouldSkipIframe({ matchesIgnoreSelector: true, src: 'https://x.com', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with matchesIgnoreSelector=true and missing src', () => {
    expect(shouldSkipIframe({ matchesIgnoreSelector: true, index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with no src', () => {
    expect(shouldSkipIframe({ index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with unsupported src', () => {
    expect(shouldSkipIframe({ src: 'about:blank', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with srcdoc attribute', () => {
    expect(shouldSkipIframe({ src: 'https://x.com', srcdoc: '<p>x</p>', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with invalid URL', () => {
    expect(shouldSkipIframe({ src: 'not-a-url', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips same-origin iframe', () => {
    expect(shouldSkipIframe({ src: 'https://parent.com/embed', percyElementId: 'pe1', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('skips cross-origin iframe without percyElementId', () => {
    expect(shouldSkipIframe({ src: 'https://other.com/', index: 0 }, 'https://parent.com', log)).toBe(true);
  });

  it('does not skip valid cross-origin iframe with percyElementId', () => {
    expect(shouldSkipIframe({ src: 'https://other.com/', percyElementId: 'pe1', index: 0 }, 'https://parent.com', log)).toBe(false);
  });
});

describe('processFrameTree', () => {
  let log;
  beforeEach(() => {
    log = { debug: () => {} };
  });

  function mockBrowserBase() {
    return {
      switchTo: () => ({
        frame: async () => {},
        parentFrame: async () => {},
        defaultContent: async () => {}
      })
    };
  }

  it('returns [] when depth exceeds maxFrameDepth', async () => {
    const b = mockBrowserBase();
    const iframe = { src: 'https://x.com', index: 0, percyElementId: 'pe' };
    const ctx = { maxFrameDepth: 2, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, FAKE_ELEMENT, iframe, 3, new Set(), ctx);
    expect(result).toEqual([]);
  });

  it('returns [] when iframe URL is in ancestor chain (cyclic)', async () => {
    const b = mockBrowserBase();
    const iframe = { src: 'https://cyclic.com', index: 0, percyElementId: 'pe' };
    const ancestors = new Set(['https://cyclic.com']);
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, FAKE_ELEMENT, iframe, 1, ancestors, ctx);
    expect(result).toEqual([]);
  });

  it('returns [] when serialization yields no snapshot', async () => {
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(src) {
        // First call is percyDOMScript injection; second is PercyDOM.serialize
        if (typeof src === 'string') return Promise.resolve(undefined);
        return Promise.resolve(null); // serialization returns null
      }),
      switchTo: () => ({
        frame: () => Promise.resolve(),
        parentFrame: () => Promise.resolve(),
        defaultContent: () => Promise.resolve()
      })
    };
    const iframe = { src: 'https://x.com', index: 0, percyElementId: 'pe' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, FAKE_ELEMENT, iframe, 1, new Set(), ctx);
    expect(result).toEqual([]);
  });

  it('throws percyContextLost when depth > 1 and parentFrame fails', async () => {
    const switchObj = {
      frame: () => Promise.resolve(),
      parentFrame: () => Promise.reject(new Error('parent fail')),
      defaultContent: () => Promise.resolve()
    };
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(src) {
        if (typeof src === 'string') return Promise.resolve(undefined);
        return Promise.resolve({ html: '<html></html>' });
      }),
      switchTo: () => switchObj
    };
    const iframe = { src: 'https://leaf.com', index: 0, percyElementId: 'pe' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    let thrownErr;
    try {
      await processFrameTree(b, FAKE_ELEMENT, iframe, 2, new Set(), ctx);
    } catch (e) { thrownErr = e; }
    expect(thrownErr).toBeDefined();
    expect(thrownErr.percyContextLost).toBe(true);
    expect(Array.isArray(thrownErr.partialCapture)).toBe(true);
  });

  it('throws percyContextLost even at depth 1 when parentFrame fails', async () => {
    // Even at depth 1 we must signal — the outer captureSerializedDOM loop is
    // holding iframe meta entries enumerated against the now-lost parent
    // context and continuing would mis-resolve percyElementIds.
    const switchObj = {
      frame: () => Promise.resolve(),
      parentFrame: () => Promise.reject(new Error('parent fail at top')),
      defaultContent: () => Promise.resolve()
    };
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(src) {
        if (typeof src === 'string') return Promise.resolve(undefined);
        return Promise.resolve({ html: '<html></html>' });
      }),
      switchTo: () => switchObj
    };
    const iframe = { src: 'https://leaf.com', index: 0, percyElementId: 'pe' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    let thrownErr;
    try {
      await processFrameTree(b, FAKE_ELEMENT, iframe, 1, new Set(), ctx);
    } catch (e) { thrownErr = e; }
    expect(thrownErr).toBeDefined();
    expect(thrownErr.percyContextLost).toBe(true);
    // Partial capture survives — we got the leaf snapshot before the parent
    // restore failed.
    expect(Array.isArray(thrownErr.partialCapture)).toBe(true);
  });

  it('propagates inner percyContextLost error and merges partialCapture', async () => {
    // Simulate processFrameTree being called recursively where the inner call
    // throws a percyContextLost error with partialCapture data.
    const innerErr = new Error('lost');
    innerErr.percyContextLost = true;
    innerErr.partialCapture = [{ frameUrl: 'https://inner.com', iframeData: { percyElementId: 'inner' }, iframeSnapshot: { html: '' } }];

    // First switchTo().frame() succeeds (parent); the SECOND one — into the
    // child — rejects with the innerErr. The mock counts switchTo() calls and
    // dispatches accordingly so the parent capture completes and we hit the
    // recursive call.
    let frameSwitchCalls = 0;
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(src) {
        if (typeof src === 'string') return Promise.resolve(undefined);
        if (typeof src === 'function' && src.toString().includes('document.URL')) {
          return Promise.resolve('https://parent.com');
        }
        if (typeof src === 'function' && src.toString().includes('PercyDOM.serialize')) {
          return Promise.resolve({ html: '<html></html>' });
        }
        // enumerateIframesScript — return one child that will throw on processing
        return Promise.resolve([{ src: 'https://child.com', index: 0, percyElementId: 'child', dataPercyIgnore: false, matchesIgnoreSelector: false, srcdoc: null }]);
      }),
      findElement: jasmine.createSpy('findElement').and.returnValue(Promise.resolve(FAKE_ELEMENT)),
      By: { css: (s) => s },
      switchTo: () => ({
        frame: () => {
          frameSwitchCalls++;
          if (frameSwitchCalls === 1) return Promise.resolve();
          return Promise.reject(innerErr);
        },
        parentFrame: () => Promise.resolve(),
        defaultContent: () => Promise.resolve()
      })
    };
    const iframe = { src: 'https://parent.com', index: 0, percyElementId: 'parent' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    let thrownErr;
    try {
      await processFrameTree(b, FAKE_ELEMENT, iframe, 1, new Set(), ctx);
    } catch (e) { thrownErr = e; }
    // The outer catch re-throws when it sees percyContextLost
    expect(thrownErr).toBeDefined();
    expect(thrownErr.percyContextLost).toBe(true);
  });

  it('bails when post-switch document.URL is unsupported and returns []', async () => {
    // Frame's static src attribute is fine (https), but after switching in,
    // the document loaded about:blank — a failed-navigation surrogate. The
    // function must drop the entry, restore the parent, and return an empty
    // array. This is the "post-switch URL bail" path.
    const switchObj = {
      frame: () => Promise.resolve(),
      parentFrame: jasmine.createSpy('parentFrame').and.returnValue(Promise.resolve()),
      defaultContent: () => Promise.resolve()
    };
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(arg) {
        if (typeof arg === 'string') return Promise.resolve(undefined);
        if (typeof arg === 'function' && arg.toString().includes('document.URL')) {
          return Promise.resolve('about:blank');
        }
        // No further calls should reach PercyDOM.serialize once we bail.
        throw new Error('unexpected executeScript call after bail');
      }),
      switchTo: () => switchObj
    };
    const iframe = { src: 'https://looks-fine.com/x', index: 0, percyElementId: 'pe' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    const result = await processFrameTree(b, FAKE_ELEMENT, iframe, 1, new Set(), ctx);
    expect(result).toEqual([]);
    // parentFrame was still called in finally to restore the outer context.
    expect(switchObj.parentFrame).toHaveBeenCalled();
  });

  it('switches by element handle, immune to numeric-index DOM mutation', async () => {
    // Simulates the BLOCKER: enumerateIframesScript runs, then PercyDOM
    // serialization on the parent re-orders the live iframe collection. A
    // numeric-index switch would land in the wrong frame; switching by the
    // WebElement handle returned from findIframeByPercyId always lands in the
    // correct one. Here we encode that by having frame() inspect the handle
    // and only accept the handle we pre-resolved for THIS iframe.
    const correctHandle = { __id: 'pe-correct' };
    const wrongHandle = { __id: 'pe-wrong' };
    let captured = null;
    const switchObj = {
      frame: (handle) => {
        if (handle && handle.__id === 'pe-correct') {
          captured = 'correct';
          return Promise.resolve();
        }
        captured = 'wrong';
        return Promise.reject(new Error('would have landed in wrong frame'));
      },
      parentFrame: () => Promise.resolve(),
      defaultContent: () => Promise.resolve()
    };
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(arg) {
        if (typeof arg === 'string') return Promise.resolve(undefined);
        if (typeof arg === 'function' && arg.toString().includes('document.URL')) {
          return Promise.resolve('https://target.com/page');
        }
        if (typeof arg === 'function' && arg.toString().includes('PercyDOM.serialize')) {
          return Promise.resolve({ html: '<correct/>' });
        }
        return Promise.resolve([]); // no children
      }),
      switchTo: () => switchObj
    };
    // index points at the WRONG position (mutation race), but we pass the
    // pre-resolved correctHandle — processFrameTree must use the handle.
    const iframe = { src: 'https://target.com/page', index: 5, percyElementId: 'pe-correct' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    const result = await processFrameTree(b, correctHandle, iframe, 1, new Set(), ctx);
    expect(captured).toBe('correct');
    expect(result.length).toBe(1);
    expect(result[0].iframeData.percyElementId).toBe('pe-correct');
    expect(result[0].iframeSnapshot).toEqual({ html: '<correct/>' });
    // Sanity: had switchTo received the wrong handle, the test would have
    // failed via the rejection above. We hold a reference here purely to
    // document the contrast in the test name.
    expect(wrongHandle.__id).toBe('pe-wrong');
  });

  it('merges nested partialCapture and re-throws at depth>1', async () => {
    // depth>1 inner failure: child processFrameTree throws percyContextLost
    // with its own partialCapture. The outer (this) processFrameTree must
    // merge that into its `collected` array, set the outer collected as the
    // new partialCapture, and re-throw — so the top-level loop in
    // captureSerializedDOM gets the full set when it breaks.
    const grandchildPartial = [{
      frameUrl: 'https://grandchild.com',
      iframeData: { percyElementId: 'gc' },
      iframeSnapshot: { html: '<gc/>' }
    }];
    const innerErr = new Error('lost');
    innerErr.percyContextLost = true;
    innerErr.partialCapture = grandchildPartial;

    let frameSwitchCalls = 0;
    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(arg) {
        if (typeof arg === 'string') return Promise.resolve(undefined);
        if (typeof arg === 'function' && arg.toString().includes('document.URL')) {
          return Promise.resolve('https://outer.com/page');
        }
        if (typeof arg === 'function' && arg.toString().includes('PercyDOM.serialize')) {
          return Promise.resolve({ html: '<outer/>' });
        }
        // enumerateIframesScript — one nested child
        return Promise.resolve([{
          src: 'https://nested.com',
          srcdoc: null,
          percyElementId: 'nested',
          dataPercyIgnore: false,
          matchesIgnoreSelector: false,
          index: 0
        }]);
      }),
      findElement: jasmine.createSpy('findElement').and.returnValue(Promise.resolve(FAKE_ELEMENT)),
      By: { css: (s) => s },
      switchTo: () => ({
        frame: () => {
          frameSwitchCalls++;
          if (frameSwitchCalls === 1) return Promise.resolve();
          // Second switchTo().frame() is the child; reject with the inner err
          // so the recursive call's outer-catch percyContextLost branch fires.
          return Promise.reject(innerErr);
        },
        parentFrame: () => Promise.resolve(),
        defaultContent: () => Promise.resolve()
      })
    };
    const iframe = { src: 'https://outer.com/page', index: 0, percyElementId: 'outer' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    // Call at depth=2 so the parent restore at the outer level would normally
    // succeed; we want the inner failure path, not the parent-restore path.
    let thrownErr;
    try {
      await processFrameTree(b, FAKE_ELEMENT, iframe, 2, new Set(), ctx);
    } catch (e) { thrownErr = e; }

    expect(thrownErr).toBeDefined();
    expect(thrownErr.percyContextLost).toBe(true);
    // The thrown error's partialCapture now contains BOTH the outer frame's
    // own snapshot AND the inner grandchildPartial that was merged in.
    expect(Array.isArray(thrownErr.partialCapture)).toBe(true);
    const ids = thrownErr.partialCapture.map(e => e.iframeData.percyElementId);
    expect(ids).toContain('outer');
    expect(ids).toContain('gc');
  });
});

describe('findIframeByPercyId', () => {
  let log;
  beforeEach(() => {
    log = { debug: jasmine.createSpy('debug') };
  });

  it('returns null for empty/undefined id without invoking findElement', async () => {
    const findElement = jasmine.createSpy('findElement');
    const b = { findElement, By: { css: (s) => s } };
    expect(await findIframeByPercyId(b, null, log)).toBeNull();
    expect(await findIframeByPercyId(b, '', log)).toBeNull();
    expect(await findIframeByPercyId(b, undefined, log)).toBeNull();
    expect(findElement).not.toHaveBeenCalled();
  });

  it('builds a CSS attribute selector with the percyElementId', async () => {
    const fakeElement = { __el: true };
    const b = {
      findElement: jasmine.createSpy('findElement').and.returnValue(Promise.resolve(fakeElement)),
      By: { css: jasmine.createSpy('css').and.callFake((s) => ({ selector: s })) }
    };
    const result = await findIframeByPercyId(b, 'abc-123', log);
    expect(result).toBe(fakeElement);
    expect(b.By.css).toHaveBeenCalledWith('iframe[data-percy-element-id="abc-123"]');
  });

  it('escapes embedded backslashes and double-quotes defensively', async () => {
    const b = {
      findElement: jasmine.createSpy('findElement').and.returnValue(Promise.resolve({})),
      By: { css: jasmine.createSpy('css').and.callFake((s) => ({ selector: s })) }
    };
    await findIframeByPercyId(b, 'weird"id\\here', log);
    expect(b.By.css).toHaveBeenCalledWith('iframe[data-percy-element-id="weird\\"id\\\\here"]');
  });

  it('returns null and logs when findElement rejects', async () => {
    const b = {
      findElement: jasmine.createSpy('findElement').and.returnValue(Promise.reject(new Error('not found'))),
      By: { css: (s) => s }
    };
    const result = await findIframeByPercyId(b, 'abc', log);
    expect(result).toBeNull();
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Could not locate iframe/));
  });
});

describe('_iframe_shim', () => {
  describe('resolveIgnoreSelectors', () => {
    it('returns [] when no selectors are set', () => {
      expect(shim.resolveIgnoreSelectors({})).toEqual([]);
      expect(shim.resolveIgnoreSelectors()).toEqual([]);
    });

    it('returns the array unchanged when an array of strings is passed', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: ['.a', '.b'] })).toEqual(['.a', '.b']);
    });

    it('filters out non-string and empty entries from an array', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: ['.a', '', null, 7, '.b'] })).toEqual(['.a', '.b']);
    });

    it('wraps a single string selector in an array', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: '.solo' })).toEqual(['.solo']);
    });

    it('returns [] for an empty string selector', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: '' })).toEqual([]);
    });

    it('falls back to the legacy ignoreSelectors key', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreSelectors: ['.legacy'] })).toEqual(['.legacy']);
    });

    it('returns [] for unsupported types (number, object, boolean)', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: 42 })).toEqual([]);
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: { a: 1 } })).toEqual([]);
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: true })).toEqual([]);
    });
  });

  describe('normalizeIgnoreSelectors', () => {
    it('is an alias of resolveIgnoreSelectors', () => {
      expect(shim.normalizeIgnoreSelectors({ ignoreIframeSelectors: ['.x'] })).toEqual(['.x']);
      expect(shim.normalizeIgnoreSelectors()).toEqual([]);
    });
  });

  describe('resolveMaxFrameDepth', () => {
    // sdk-utils exposes DEFAULT_MAX_IFRAME_DEPTH / HARD_MAX_IFRAME_DEPTH;
    // pull them at runtime so this test tracks the dependency rather than
    // hardcoding numbers that will drift when sdk-utils bumps.
    const utils = require('@percy/sdk-utils');
    const DEFAULT = utils.DEFAULT_MAX_IFRAME_DEPTH ?? 10;
    const HARD = utils.HARD_MAX_IFRAME_DEPTH ?? 25;

    it('returns the default when not supplied', () => {
      expect(shim.resolveMaxFrameDepth({})).toBe(DEFAULT);
      expect(shim.resolveMaxFrameDepth()).toBe(DEFAULT);
    });

    it('returns the explicit value when within range', () => {
      const inRange = Math.min(DEFAULT, HARD);
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: inRange })).toBe(inRange);
    });

    it('accepts the legacy maxIframeDepth key', () => {
      const inRange = Math.min(DEFAULT, HARD);
      expect(shim.resolveMaxFrameDepth({ maxIframeDepth: inRange })).toBe(inRange);
    });

    it('clamps negative values up to 0', () => {
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: -5 })).toBe(0);
    });

    it('clamps overflow values down to the hard cap', () => {
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: HARD + 1000 })).toBe(HARD);
    });

    it('falls back to default when value is not numeric', () => {
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: 'banana' })).toBe(DEFAULT);
    });
  });

  describe('isUnsupportedIframeSrc', () => {
    it('returns true for null/empty', () => {
      expect(shim.isUnsupportedIframeSrc(null)).toBe(true);
      expect(shim.isUnsupportedIframeSrc('')).toBe(true);
    });

    it('returns true for browser-internal and legacy schemes', () => {
      expect(shim.isUnsupportedIframeSrc('about:blank')).toBe(true);
      expect(shim.isUnsupportedIframeSrc('javascript:void(0)')).toBe(true);
      expect(shim.isUnsupportedIframeSrc('data:text/html,foo')).toBe(true);
      expect(shim.isUnsupportedIframeSrc('blob:http://example.com/x')).toBe(true);
      expect(shim.isUnsupportedIframeSrc('vbscript:msgbox')).toBe(true);
      expect(shim.isUnsupportedIframeSrc('file:///etc/passwd')).toBe(true);
    });

    it('returns false for http(s)', () => {
      expect(shim.isUnsupportedIframeSrc('http://example.com')).toBe(false);
      expect(shim.isUnsupportedIframeSrc('https://example.com/page')).toBe(false);
    });
  });
});
