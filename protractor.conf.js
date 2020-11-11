exports.config = {
  directConnect: true,
  framework: 'mocha',
  specs: ['test/*.test.js'],
  capabilities: {
    browserName: 'firefox',
    'moz:firefoxOptions': {
      args: ['-headless']
    }
  }
};
