exports.config = {
  directConnect: true,
  framework: 'jasmine',
  specs: ['test/*.test.js'],
  capabilities: {
    browserName: 'firefox',
    'moz:firefoxOptions': {
      args: ['-headless']
    }
  }
};
