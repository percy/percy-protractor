import fs = require('fs')
const { agentJsFilename, isAgentRunning, postSnapshot } = require('@percy/agent/dist/utils/sdk-utils')
import { clientInfo } from './environment'

declare var PercyAgent: any

// The Protractor 'browser' instance.
declare var browser: any

/**
 * A function to take a Percy snapshot from a Protractor test.
 *
 * @param name Name of the snapshot that we're taking. Required.
 * @param options Additional options, e.g. '{widths: [768, 992, 1200]}'. Optional.
 */
export async function percySnapshot(name: string, options: any = {}) {
  if (!browser) {
    throw new Error("No 'browser' object found. This function must be called from within a Protractor test.")
  }
  if (!name) {
    throw new Error("'name' must be provided.")
  }

  await browser.executeScript(fs.readFileSync(agentJsFilename()).toString())

  const canSnapshot = await isAgentRunning()
  if (!canSnapshot) { return }

  const { url, domSnapshot } = await browser.executeScript((name: string, options: any, clientInfo: string) => {
    const percyAgentClient = new PercyAgent({ clientInfo, handleAgentCommunication: false })

    return {
      domSnapshot: percyAgentClient.snapshot(name, options),
      url: window.location.href
    }
  }, name, options, clientInfo())

  await postSnapshot({
    name,
    url,
    domSnapshot,
    clientInfo: clientInfo(),
    ...options
  })
}
