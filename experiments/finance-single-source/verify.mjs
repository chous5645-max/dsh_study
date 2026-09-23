import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openLedger } from './ledger.mjs'

const root = import.meta.dirname
const statePath = join(root, '.runtime', 'verify-' + randomUUID(), 'ledger.json')
const bookId = 'personal-synthetic'
const january = await readFile(join(root, 'fixtures', 'january.csv'), 'utf8')
const overlap = await readFile(join(root, 'fixtures', 'overlap.csv'), 'utf8')
const header = january.split(/\r?\n/)[0]
const row = (id, amount = '35.00', category = '餐饮') =>
  `${header}\n2026-02-02,${id},银行卡A,支出,${amount},${category},完成\n`
const ledger = openLedger(statePath)

const first = await ledger.prepareImport({ bookId, csvText: january })
assert.deepEqual(first.counts, { added: 2, duplicate: 0 })
assert.equal(first.baseRevision, 0)
assert.deepEqual(first.issues, [])
assert.equal((await ledger.query(bookId)).entries.length, 0, 'Preview must not post transactions')
const committed = await ledger.applyImport({ proposalId: first.proposalId, bookId, idempotencyKey: 'january-1' })
assert.equal(committed.addedIds.length, 2)
let view = await ledger.query(bookId)
assert.equal(view.expenseMinor, 5500)
assert.equal(view.accountDeltas['银行卡A'], -5500)
assert.deepEqual(view.categoryTotals, { 餐饮: 3500, 日用: 2000 })
assert.deepEqual(view.entries.map((entry) => entry.source.line), [2, 3])
assert.ok(view.entries.every((entry) => entry.source.fileHash.length === 64))

// The caller discards the original response, then reopens the store and retries its operation.
const resumed = openLedger(statePath)
assert.deepEqual(await resumed.applyImport({ proposalId: first.proposalId, bookId, idempotencyKey: 'january-1' }), committed)
assert.equal((await resumed.query(bookId)).expenseMinor, 5500)
const repeated = await resumed.prepareImport({ bookId, csvText: january })
assert.deepEqual(repeated.counts, { added: 0, duplicate: 2 })
await resumed.applyImport({ proposalId: repeated.proposalId, bookId, idempotencyKey: 'january-repeat' })
assert.equal((await resumed.query(bookId)).entries.length, 2)

const overlapping = await resumed.prepareImport({ bookId, csvText: overlap })
assert.deepEqual(overlapping.counts, { added: 1, duplicate: 2 })
await resumed.applyImport({ proposalId: overlapping.proposalId, bookId, idempotencyKey: 'overlap-1' })
view = await resumed.query(bookId)
assert.equal(view.expenseMinor, 9500)
assert.equal(view.accountDeltas['银行卡A'], -9500)
assert.equal(view.entries.length, 3)
assert.equal(view.entries.find((entry) => entry.externalId === 'W-103')?.source.line, 4)

const sameAmount = await resumed.prepareImport({ bookId, csvText: row('W-104') })
assert.deepEqual(sameAmount.counts, { added: 1, duplicate: 0 })
await resumed.applyImport({ proposalId: sameAmount.proposalId, bookId, idempotencyKey: 'same-amount-distinct' })
view = await resumed.query(bookId)
assert.equal(view.expenseMinor, 13000)
assert.equal(view.accountDeltas['银行卡A'], -13000)
assert.equal(view.entries.length, 4)

const stale = await resumed.prepareImport({ bookId, csvText: row('W-105') })
const concurrent = await resumed.prepareImport({ bookId, csvText: row('W-106') })
await resumed.applyImport({ proposalId: concurrent.proposalId, bookId, idempotencyKey: 'concurrent' })
await assert.rejects(
  () => resumed.applyImport({ proposalId: stale.proposalId, bookId, idempotencyKey: 'stale' }),
  { code: 'VERSION_CONFLICT' },
)
await assert.rejects(
  () => resumed.applyImport({ proposalId: stale.proposalId, bookId, idempotencyKey: 'concurrent' }),
  { code: 'IDEMPOTENCY_CONFLICT' },
)

const conflictingSource = await resumed.prepareImport({ bookId, csvText: row('W-101', '36.00') })
assert.deepEqual(conflictingSource.issues.map((issue) => issue.code), ['SOURCE_CONFLICT'])
await assert.rejects(
  () => resumed.applyImport({ proposalId: conflictingSource.proposalId, bookId, idempotencyKey: 'conflicting-source' }),
  { code: 'REVIEW_REQUIRED' },
)
await assert.rejects(
  () => resumed.prepareImport({ bookId, csvText: 'unknown,header\na,b\n' }),
  { code: 'UNSUPPORTED_FORMAT' },
)
await assert.rejects(
  () => resumed.prepareImport({ bookId, csvText: row('W-107', '35.000') }),
  { code: 'INVALID_AMOUNT' },
)
view = await resumed.query(bookId)
assert.equal(view.expenseMinor, 16500)
assert.equal(view.accountDeltas['银行卡A'], -16500)
assert.equal(view.entries.length, 5)
assert.match(view.coverage, /opening balances are unknown/)

process.stdout.write('V0 cases 01 and 02, plus the distinct-id rule from 04: passed\n')
process.stdout.write('V2 preview, commit, deduplication, traceability, persistence and retry: passed\n')
process.stdout.write('V2 stale preview, idempotency conflict and malformed input: rejected as expected\n')
