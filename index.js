const utils = require('@percy/sdk-utils');

// Collect client and environment information
const sdkPkg = require('./package.json');
const protractorPkg = require('protractor/package.json');
const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`;
const ENV_INFO = `${protractorPkg.name}/${protractorPkg.version}`;

// Take a DOM snapshot and post it to the snapshot endpoint
module.exports = async function percySnapshot(name, options) {
  if (!browser) throw new Error('Protractor\'s `browser` was not found.');
  if (!name) throw new Error('The `name` argument is required.');
  if (!(await utils.isPercyEnabled())) return;

  try {
    // Inject the DOM serialization script
    await browser.executeScript(await utils.fetchPercyDOM());

    // Serialize and capture the DOM
    /* istanbul ignore next: no instrumenting injected code */
    let { domSnapshot, url } = await browser.executeScript(options => ({
      /* eslint-disable-next-line no-undef */
      domSnapshot: PercyDOM.serialize(options),
      url: document.URL
    }), options);

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
    utils.log('error', `Could not take DOM snapshot "${name}"`);
    utils.log('error', error);
  }
};
