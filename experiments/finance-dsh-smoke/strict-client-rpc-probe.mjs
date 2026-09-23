import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [sourceArg, runtimeArg] = process.argv.slice(2)
if (!sourceArg || !runtimeArg) throw new Error('Pass DSH source and isolated runtime directory')
const dshSource = resolve(sourceArg)
const runtime = resolve(runtimeArg)
const stdout = await readFile(join(runtime, 'stdout.log'), 'utf8')
const bootUrl = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0]
if (!bootUrl) throw new Error('Isolated DSH boot URL missing')
const origin = new URL(bootUrl).origin
const login = await fetch(bootUrl, { redirect: 'manual' })
assert.equal(login.status, 303, 'DSH local login did not issue a redirect')
const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
assert.ok(cookie, 'DSH local login did not issue an authentication cookie')

const fromSource = (...parts) => pathToFileURL(join(dshSource, ...parts)).href
const requireFromGateway = createRequire(join(dshSource, 'packages', 'api', 'gateway', 'package.json'))
const { Context } = await import(pathToFileURL(requireFromGateway.resolve('@deepseek-ai/cordis')).href)
const { default: TypertRegistry } = await import(fromSource('packages', 'typert', 'registry', 'lib', 'index.js'))
const gatewayClient = await import(fromSource('packages', 'api', 'gateway', 'src', 'client', 'index.ts'))
const { createWebConnectionRpc } = await import(fromSource('packages', 'client', 'connection', 'src', 'client', 'rpc.ts'))
const { default: financeRemote } = await import(new URL('./.runtime/strict-remote-workspace/packages/finance/lib/typert.remote-client.runtime.js', import.meta.url))

const rpc = createWebConnectionRpc((input, init) => {
  const target = new URL(input.pathname, origin)
  return fetch(target, {
    ...init,
    headers: { ...init.headers, cookie },
  })
}, async function* () { throw new Error('Stream is unused in this probe') })
const ctx = new Context()
try {
  await ctx.plugin(TypertRegistry)
  ctx.provide('connection', {
    rpc,
    registerGenerationSource: () => () => {},
    start: () => ({ stop: () => {} }),
  })
  await ctx.plugin({ inject: gatewayClient.inject, apply: gatewayClient.apply })
  await ctx.remote.$mount(financeRemote)
  assert.equal(typeof ctx.remote.financeSummary?.summary, 'function')
  const result = await ctx.remote.financeSummary.summary({ bookId: 'personal-probe' })
  assert.deepEqual(result, { ok: true, value: { expenseMinor: 3500, bankDeltaMinor: -3500 } })
  const invalid = await ctx.remote.financeSummary.summary({ bookId: 123 })
  assert.equal(invalid.ok, false, 'Strict Host validation accepted a non-string bookId')
  process.stdout.write('Generated contribution mounted in DSH Client Remote: true\n')
  process.stdout.write('Client ctx.remote called strict Host endpoint over authenticated Connection RPC: true\n')
  process.stdout.write('Strict Host rejected malformed request over Connection RPC: true\n')
} finally {
  await ctx.fiber.dispose()
}
