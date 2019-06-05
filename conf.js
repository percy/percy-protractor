exports.config = {
  // Connect directly to browser, without intermediate Selenium Server.
  directConnect: true,

  // Test framework to use.
  framework: 'jasmine',

  // Spec files with our tests.
  specs: ['tests/*_spec.js'],

  // Required since we're using `async` / `await`:
  // "Because async/await uses native promises, it will make the Control Flow
  // unreliable"
  // Control Flow is also deprecated
  // see: https://www.protractortest.org/#/control-flow
  // see: https://github.com/SeleniumHQ/selenium/issues/2969
  SELENIUM_PROMISE_MANAGER: false,

  // Options for the webdriver instance to use in tests.
  capabilities: {
    browserName: 'chrome',
    chromeOptions: {
      args: [
        'headless',
        'disable-web-security',
        'ignore-certificate-errors',
        'allow-running-insecure-content'
      ]
    }
  }
};
