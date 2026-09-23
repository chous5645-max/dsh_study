import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const dshSource = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Pass the pinned DSH source directory')

const workspace = join(import.meta.dirname, '.runtime', 'strict-remote-workspace')
const financeRoot = join(workspace, 'packages', 'finance')
await mkdir(join(financeRoot, 'src'), { recursive: true })

const fixtureRoot = join(dshSource, 'packages', 'typert', 'generator', 'tests', 'fixtures', 'remote-model')
const protocol = await readFile(join(fixtureRoot, 'typert-protocol.d.ts'), 'utf8')
const files = new Map([
  ['package.json', JSON.stringify({ name: '@dsh-study/strict-remote-workspace', private: true, type: 'module' }, null, 2)],
  ['typert-protocol.d.ts', protocol],
  ['tsconfig.base.json', JSON.stringify({ compilerOptions: {
    target: 'ES2024', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    composite: true, noEmit: true, allowImportingTsExtensions: true,
    ignoreDeprecations: '6.0', skipLibCheck: true,
    paths: {
      '@deepseek-ai/dsh-typert-protocol': ['./typert-protocol.d.ts'],
      '@dsh-study/finance-strict-probe': ['./packages/finance/src/index.ts'],
      '@dsh-study/finance-strict-probe/*': ['./packages/finance/src/*'],
    },
  } }, null, 2)],
  ['tsconfig.host.json', JSON.stringify({ extends: './tsconfig.base.json', files: [], references: [{ path: './packages/finance' }] }, null, 2)],
  ['packages/finance/package.json', JSON.stringify({
    name: '@dsh-study/finance-strict-probe', private: true, type: 'module',
    exports: {
      '.': './src/index.ts',
      './types': './src/types.ts',
      './typert': { types: './lib/typert.host.d.ts', default: './lib/typert.host.js' },
      './remote': { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' },
    },
    files: ['lib/typert.host.js', 'lib/typert.host.d.ts', 'lib/typert.remote-client.js', 'lib/typert.remote-client.d.ts'],
  }, null, 2)],
  ['packages/finance/tsconfig.json', JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: { rootDir: 'src', outDir: 'lib/types', noEmit: false, declaration: true, emitDeclarationOnly: true },
    include: ['src'],
  }, null, 2)],
  ['packages/finance/src/types.ts', `export interface FinanceSummaryRequest {
  readonly bookId: string
}

export interface FinanceSummaryResult {
  readonly expenseMinor: number
  readonly bankDeltaMinor: number
}
`],
  ['packages/finance/src/index.ts', `import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { FinanceSummaryRequest, FinanceSummaryResult } from './types.ts'

export class FinanceSummaryService extends TypertRemoteService {
  constructor() {
    super(undefined, 'financeSummary', { namespace: 'financeSummary' })
  }

  @Remote
  summary(request: FinanceSummaryRequest): FinanceSummaryResult {
    if (request.bookId !== 'personal-probe') throw new Error('Unknown synthetic book')
    return { expenseMinor: 3500, bankDeltaMinor: -3500 }
  }
}

export type { FinanceSummaryRequest, FinanceSummaryResult } from './types.ts'
`],
])

for (const [relativePath, content] of files) {
  const destination = join(workspace, relativePath)
  await mkdir(resolve(destination, '..'), { recursive: true })
  await writeFile(destination, content)
}

const generatorUrl = pathToFileURL(join(dshSource, 'packages', 'typert', 'generator', 'src', 'workspace.ts'))
const { WorkspaceTypertGenerator } = await import(generatorUrl.href)
const [artifact] = new WorkspaceTypertGenerator(workspace).generate(['@dsh-study/finance-strict-probe'])
assert.ok(artifact, 'No Host artifact was generated')
assert.ok(artifact.remote?.js && artifact.remote.dts, 'No strict Client Remote artifact was generated')
assert.match(artifact.remote.dts, /financeSummary\/summary/)
assert.match(artifact.remote.dts, /FinanceSummaryRequest/)
assert.match(artifact.remote.dts, /FinanceSummaryResult/)
assert.match(artifact.remote.dts, /TypertRemoteNamespaceMap/)
await mkdir(join(financeRoot, 'lib'), { recursive: true })
await writeFile(join(financeRoot, 'lib', 'typert.host.js'), artifact.js)
await writeFile(join(financeRoot, 'lib', 'typert.host.d.ts'), artifact.dts)
await writeFile(join(financeRoot, 'lib', 'typert.remote-client.js'), artifact.remote.js)
await writeFile(join(financeRoot, 'lib', 'typert.remote-client.d.ts'), artifact.remote.dts)

const requireFromDsh = createRequire(join(dshSource, 'package.json'))
const zodUrl = pathToFileURL(requireFromDsh.resolve('zod')).href
const executable = artifact.remote.js.replace("from 'zod'", `from ${JSON.stringify(zodUrl)}`)
await writeFile(join(financeRoot, 'lib', 'typert.host.runtime.js'), artifact.js.replace("from 'zod'", `from ${JSON.stringify(zodUrl)}`))
await writeFile(join(financeRoot, 'lib', 'typert.remote-client.runtime.js'), executable)
await writeFile(join(workspace, 'client-entry.js'), `import financeRemote from './packages/finance/lib/typert.remote-client.runtime.js'\nwindow.__financeStrictRemoteContribution = financeRemote\n`)
const generated = await import(`data:text/javascript,${encodeURIComponent(executable)}`)
const descriptor = generated.TYPERT_REMOTE.descriptors.find((entry) => entry.namespace === 'financeSummary' && entry.method === 'summary')
assert.ok(descriptor, 'financeSummary/summary descriptor was not generated')
assert.equal(descriptor.parameters[0]?.wire, 'request')
assert.equal(descriptor.parameters[0].codec.create().safeParse({ bookId: 'personal-probe' }).success, true)
assert.equal(descriptor.parameters[0].codec.create().safeParse({ bookId: 123 }).success, false)
assert.equal(descriptor.result.create().safeParse({ expenseMinor: 3500, bankDeltaMinor: -3500 }).success, true)
assert.equal(descriptor.result.create().safeParse({ expenseMinor: '3500', bankDeltaMinor: -3500 }).success, false)

process.stdout.write('Strict Finance Remote generated: true\n')
process.stdout.write('Typed Client namespace and method generated: true\n')
process.stdout.write('Request and result codecs reject wrong types: true\n')
