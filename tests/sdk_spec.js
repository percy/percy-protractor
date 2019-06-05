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
    beforeEach(async function() {
      await browser.get(TEST_URL)
    })

    afterEach(async function() {
      // Clear local storage between tests so that we always start with a clean slate.
      await browser.executeScript('window.localStorage.clear()')
    })

    it('snapshots with provided name', async function() {
      await percySnapshot('snapshots with provided name')
    })

    it('snapshots with provided name and widths', async function() {
      await percySnapshot('snapshots with provided name and widths', {
        widths: [768, 992, 1200],
      })
    })

    it('snapshots with provided name and minHeight', async function() {
      await percySnapshot('snapshots with provided name and minHeight', {
        minHeight: 2000,
      })
    })

    it('takes multiple snapshots in one test', async function() {
      await element(by.css('.new-todo')).sendKeys(
        'A thing to accomplish',
        protractor.Key.ENTER
      )
      await percySnapshot('takes multiple snapshots - #1', {
        widths: [768, 992, 1200],
      })

      await element(by.css('input.toggle')).click()
      await percySnapshot('takes multiple snapshots - #2', {
        widths: [768, 992, 1200],
      })
    })
  })

  describe('with live sites', function() {
    beforeEach(async function() {
      await browser.waitForAngularEnabled(false)
    })

    afterEach(async function() {
      await browser.waitForAngularEnabled(true)
    })
    it('snapshots a website with HTTP', async function() {
      await browser.get('http://example.com/')
      await percySnapshot('snapshots a website with HTTP')
    })

    it('snapshots a website with HTTPS, strict CSP, CORS and HSTS setup', async function() {
      await browser.get('https://sdk-test.percy.dev')
      await percySnapshot('snapshots a website with HTTPS, strict CSP, CORS and HSTS setup')
    })
  })
})
