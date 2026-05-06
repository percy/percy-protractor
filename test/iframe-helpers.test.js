const { shouldSkipIframe, processFrameTree } = require('../index.js');

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
    const result = await processFrameTree(b, iframe, 3, new Set(), ctx);
    expect(result).toEqual([]);
  });

  it('returns [] when iframe URL is in ancestor chain (cyclic)', async () => {
    const b = mockBrowserBase();
    const iframe = { src: 'https://cyclic.com', index: 0, percyElementId: 'pe' };
    const ancestors = new Set(['https://cyclic.com']);
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, iframe, 1, ancestors, ctx);
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
    const result = await processFrameTree(b, iframe, 1, new Set(), ctx);
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
      await processFrameTree(b, iframe, 2, new Set(), ctx);
    } catch (e) { thrownErr = e; }
    expect(thrownErr).toBeDefined();
    expect(thrownErr.percyContextLost).toBe(true);
    expect(Array.isArray(thrownErr.partialCapture)).toBe(true);
  });

  it('does not throw percyContextLost at depth 1 when parentFrame fails', async () => {
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

    const result = await processFrameTree(b, iframe, 1, new Set(), ctx);
    // Capture succeeded; parentFrame failure swallowed because depth=1 falls back to top
    expect(result.length).toBe(1);
    expect(result[0].iframeData.percyElementId).toBe('pe');
  });

  it('propagates inner percyContextLost error and merges partialCapture', async () => {
    // Simulate processFrameTree being called recursively where the inner call
    // throws a percyContextLost error with partialCapture data.
    const innerErr = new Error('lost');
    innerErr.percyContextLost = true;
    innerErr.partialCapture = [{ frameUrl: 'https://inner.com', iframeData: { percyElementId: 'inner' }, iframeSnapshot: { html: '' } }];

    const b = {
      executeScript: jasmine.createSpy('exec').and.callFake(function(src) {
        if (typeof src === 'string') return Promise.resolve(undefined);
        if (typeof src === 'function' && src.toString().includes('PercyDOM.serialize')) {
          return Promise.resolve({ html: '<html></html>' });
        }
        // enumerateIframesScript — return one child that will throw on processing
        return Promise.resolve([{ src: 'https://child.com', index: 0, percyElementId: 'child', dataPercyIgnore: false, matchesIgnoreSelector: false, srcdoc: null }]);
      }),
      switchTo: () => ({
        frame: () => Promise.reject(innerErr),
        parentFrame: () => Promise.resolve(),
        defaultContent: () => Promise.resolve()
      })
    };
    const iframe = { src: 'https://parent.com', index: 0, percyElementId: 'parent' };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };

    let thrownErr;
    try {
      await processFrameTree(b, iframe, 1, new Set(), ctx);
    } catch (e) { thrownErr = e; }
    // The outer catch re-throws when it sees percyContextLost
    expect(thrownErr).toBeDefined();
    expect(thrownErr.percyContextLost).toBe(true);
  });
});
