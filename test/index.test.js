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
