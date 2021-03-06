const expect = require('expect');
const sdk = require('@percy/sdk-utils/test/helper');
const percySnapshot = require('..');

describe('percySnapshot', () => {
  let og;

  before(async () => {
    await sdk.testsite.mock();
    browser.ignoreSynchronization = true;
  });

  after(async () => {
    await sdk.testsite.close();
  });

  beforeEach(async function() {
    og = browser;
    this.timeout(0);
    await sdk.setup();
    await browser.get('http://localhost:8000');
  });

  afterEach(async () => {
    await sdk.teardown();
    browser = og;
  });

  it('throws an error when the browser object is missing', () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrow('Protractor\'s `browser` was not found.');
  });

  it('throws an error when a name is not provided', () => {
    expect(() => percySnapshot())
      .toThrow('The `name` argument is required.');
  });

  it('disables snapshots when the healthcheck fails', async () => {
    sdk.test.failure('/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(sdk.server.requests).toEqual([
      ['/percy/healthcheck']
    ]);

    expect(sdk.logger.stderr).toEqual([]);
    expect(sdk.logger.stdout).toEqual([
      '[percy] Percy is not running, disabling snapshots\n'
    ]);
  });

  it('posts snapshots to the local percy server', async () => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(sdk.server.requests).toEqual([
      ['/percy/healthcheck'],
      ['/percy/dom.js'],
      ['/percy/snapshot', {
        name: 'Snapshot 1',
        url: 'http://localhost:8000/',
        domSnapshot: '<html><head></head><body>Snapshot Me</body></html>',
        clientInfo: expect.stringMatching(/@percy\/protractor\/.+/),
        environmentInfo: expect.stringMatching(/protractor\/.+/)
      }],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 2'
      })]
    ]);

    expect(sdk.logger.stdout).toEqual([]);
    expect(sdk.logger.stderr).toEqual([]);
  });

  it('handles snapshot failures', async () => {
    sdk.test.failure('/percy/snapshot', 'failure');

    await percySnapshot('Snapshot 1');

    expect(sdk.logger.stdout).toHaveLength(0);
    expect(sdk.logger.stderr).toEqual([
      '[percy] Could not take DOM snapshot "Snapshot 1"\n',
      '[percy] Error: failure\n'
    ]);
  });

  it('works in standalone mode', async () => {
    browser = null;

    await percySnapshot(og, 'Snapshot 1');
    await percySnapshot(og, 'Snapshot 2');

    expect(sdk.server.requests).toEqual([
      ['/percy/healthcheck'],
      ['/percy/dom.js'],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 1'
      })],
      ['/percy/snapshot', expect.objectContaining({
        name: 'Snapshot 2'
      })]
    ]);

    expect(sdk.logger.stderr).toEqual([]);
  });

  it('throws the proper argument error in standalone mode', async () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrow("Protractor's `browser` was not found");
  });
});
