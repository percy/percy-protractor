exports.config = {
  // Connect directly to browser, without intermediate Selenium Server.
  directConnect: true,

  // Test framework to use.
  framework: 'jasmine',

  // Spec files with our tests.
  specs: ['tests/*_spec.js'],

  // Options for the webdriver instance to use in tests.
  capabilities: {
    browserName: 'chrome',
    chromeOptions: {
      args: ["--headless"]
    }
  }
}
