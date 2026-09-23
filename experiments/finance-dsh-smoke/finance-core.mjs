export const name = 'finance-core-probe'
export const inject = ['tools']

export async function apply(ctx) {
  const sourceRoot = process.env.DSH_SOURCE_ROOT
  const dshHome = process.env.DSH_HOME
  if (!sourceRoot || !dshHome) throw new Error('DSH_SOURCE_ROOT and DSH_HOME are required')
  const { join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { mkdir, readFile, writeFile } = await import('node:fs/promises')
  const fromSource = (...parts) => pathToFileURL(join(sourceRoot, ...parts)).href
  const { defineTool } = await import(fromSource('packages', 'core', 'tools', 'lib', 'index.js'))
  const { bindTypertRemote, Remote } = await import(fromSource('packages', 'typert', 'protocol', 'lib', 'index.js'))

  const storeDirectory = join(dshHome, 'finance-probe')
  const storePath = join(storeDirectory, 'sample.json')
  await mkdir(storeDirectory, { recursive: true })
  let sample
  let storeReused = false
  try {
    sample = JSON.parse(await readFile(storePath, 'utf8'))
    storeReused = true
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    sample = { expenseMinor: 3500, bankDeltaMinor: -3500 }
    await writeFile(storePath, JSON.stringify(sample), { flag: 'wx' })
  }
  if (sample.expenseMinor !== 3500 || sample.bankDeltaMinor !== -3500) {
    throw new Error('Synthetic store contents changed unexpectedly')
  }
  const financeProbe = Object.freeze({
    summary: () => 'expenseMinor=' + sample.expenseMinor + ';bankDeltaMinor=' + sample.bankDeltaMinor,
  })
  ctx.tools.register(defineTool({
    name: 'finance_probe_summary',
    description: 'Return a fixed synthetic finance summary for integration testing.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return financeProbe.summary()
    },
  }))

  const initializers = []
  class FinanceRemoteProbe {
    constructor() {
      this.typertRemote = bindTypertRemote(this, 'financeProbeRemote', { namespace: 'financeProbe' })
      for (const initialize of initializers) initialize.call(this)
    }
    summary() {
      return financeProbe.summary()
    }
  }
  Remote('summary')(FinanceRemoteProbe.prototype.summary, {
    kind: 'method',
    name: 'summary',
    private: false,
    static: false,
    addInitializer(initialize) { initializers.push(initialize) },
  })
  ctx.provide('financeProbeRemote', new FinanceRemoteProbe())
  ctx.provide('financeProbe', financeProbe)
  console.log('[finance-smoke] core ready; tool registered; remote service provided')
  console.log('[finance-smoke] store reused=' + storeReused)
}
