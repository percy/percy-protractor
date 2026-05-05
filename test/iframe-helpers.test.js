const { shouldSkipIframe } = require('../index.js');

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
