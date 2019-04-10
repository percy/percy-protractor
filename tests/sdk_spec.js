const httpServer = require('http-server')
const { percySnapshot } = require('../dist')

describe('@percy/protractor SDK', function() {
  const PORT = 8000
  const TEST_URL = `http://localhost:${PORT}`
  let server

  beforeAll(function() {
    // Start a local server to serve our Angular Todo app.
    server = httpServer.createServer({ root: `${__dirname}/testapp` })
    server.listen(PORT)
  })

  afterAll(function() {
    // Shutdown our http server.
    server.close()
  })

  describe('with local app', function() {
    beforeEach(function() {
      browser.get(TEST_URL)
    })

    afterEach(function() {
      // Clear local storage between tests so that we always start with a clean slate.
      browser.executeScript('window.localStorage.clear()')
    })

    it('snapshots with provided name', function() {
      percySnapshot(this.test.fullTitle())
    })

    it('snapshots with provided name and widths', function() {
      percySnapshot(this.test.fullTitle(), {
        widths: [768, 992, 1200],
      })
    })

    it('snapshots with provided name and minHeight', function() {
      percySnapshot(this.test.fullTitle(), {
        minHeight: 2000,
      })
    })

    it('takes multiple snapshots in one test', function() {
      element(by.css('.new-todo')).sendKeys(
        'A thing to accomplish',
        protractor.Key.ENTER
      )
      percySnapshot(this.test.fullTitle() + '#1')

      element(by.css('input.toggle')).click()
      percySnapshot(this.test.fullTitle() + '#2')
    })
  })

  describe('with live sites', function() {
    it('snapshots a website with HTTP', function() {
      browser.get('http://example.com/')
      percySnapshot(this.test.fullTitle())
    })

    it('snapshots a website with HTTPS, strict CSP, CORS and HSTS setup', function() {
      browser.get('https://sdk-test.percy.dev')
      percySnapshot(this.test.fullTitle())
    })
  })
})
