import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'finance-strict-core-probe'
export const inject = ['typert']

export async function apply(ctx) {
  const sourceRoot = process.env.DSH_SOURCE_ROOT
  if (!sourceRoot) throw new Error('DSH_SOURCE_ROOT is required')
  const protocolUrl = pathToFileURL(join(sourceRoot, 'packages', 'typert', 'protocol', 'lib', 'index.js'))
  const manifestUrl = new URL('../.runtime/strict-remote-workspace/packages/finance/lib/typert.host.runtime.js', import.meta.url)
  const [{ bindTypertRemote }, { TYPERT }] = await Promise.all([
    import(protocolUrl.href), import(manifestUrl.href),
  ])
  class FinanceSummaryService {
    constructor() {
      this.typertRemote = bindTypertRemote(this, 'financeSummary', { namespace: 'financeSummary' })
    }
    summary(request) {
      if (request.bookId !== 'personal-probe') throw new Error('Unknown synthetic book')
      return { expenseMinor: 3500, bankDeltaMinor: -3500 }
    }
  }
  ctx.provide('financeSummary', new FinanceSummaryService())
  ctx.typert.register(TYPERT)
  if (!ctx.typert.local.get('financeSummary/summary')) {
    throw new Error('Strict Host descriptor did not register')
  }
  console.log('[finance-strict] Host descriptor and service ready')
}
