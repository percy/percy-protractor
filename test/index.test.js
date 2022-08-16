const expect = require('expect');
const percySnapshot = require('..');

describe('percySnapshot', () => {
  let og, helpers;

  before(async () => {
    ({ default: helpers } = await import('@percy/sdk-utils/test/helpers'));
    browser.ignoreSynchronization = true;
  });

  beforeEach(async function() {
    og = browser;
    this.timeout(0);
    await helpers.setupTest();
    await browser.get(helpers.testSnapshotURL);
  });

  afterEach(() => {
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
    await helpers.test('error', '/percy/healthcheck');

    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Percy is not running, disabling snapshots'
    ]));
  });

  it('posts snapshots to the local percy server', async () => {
    await percySnapshot('Snapshot 1');
    await percySnapshot('Snapshot 2');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2',
      `- url: ${helpers.testSnapshotURL}`,
      expect.stringMatching(/clientInfo: @percy\/protractor\/.+/),
      expect.stringMatching(/environmentInfo: protractor\/.+/)
    ]));
  });

  it('handles snapshot failures', async () => {
    await helpers.test('error', '/percy/snapshot');
    await percySnapshot('Snapshot 1');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Could not take DOM snapshot "Snapshot 1"'
    ]));
  });

  it('works in standalone mode', async () => {
    browser = null;

    await percySnapshot(og, 'Snapshot 1');
    await percySnapshot(og, 'Snapshot 2');

    expect(await helpers.get('logs')).toEqual(expect.arrayContaining([
      'Snapshot found: Snapshot 1',
      'Snapshot found: Snapshot 2'
    ]));
  });

  it('throws the proper argument error in standalone mode', async () => {
    browser = null;

    expect(() => percySnapshot())
      .toThrow("Protractor's `browser` was not found");
  });
});
