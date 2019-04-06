import fs = require('fs')
const { agentJsFilename } = require('@percy/agent/dist/utils/sdk-utils')
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
  browser.executeScript(fs.readFileSync(agentJsFilename()).toString())
  browser.executeScript((name: string, options: any, clientInfo: string) => {
      const percyAgentClient = new PercyAgent({clientInfo})
      percyAgentClient.snapshot(name, options)
    }, name, options, clientInfo())
  }
