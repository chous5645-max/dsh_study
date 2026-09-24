import assert from 'node:assert/strict'
import { createMatcher } from './matcher.mjs'

const common = { book: 'personal', amountMinor: 3500, date: '2026-01-08',
  currency: 'CNY', status: 'completed', orderNamespace: 'merchant-order', orderVerified: true }
const wechat = (transactionId, orderId, extra = {}) => ({ ...common, channel: 'wechat',
  kind: 'purchase', scope: 'wechat-user', transactionId, orderId, fundingAccount: 'bank-A', ...extra })
const bank = (transactionId, orderId, extra = {}) => ({ ...common, channel: 'bank',
  kind: 'debit', scope: 'bank-A', transactionId, orderId, account: 'bank-A', ...extra })
const record = (title, result, probe) => {
  process.stdout.write(`\n${title}\n`)
  process.stdout.write(JSON.stringify({ result, state: probe.view() }, null, 2) + '\n')
}
const commit = (probe, rows, title, options = {}) => {
  const result = probe.apply(probe.prepare(rows, options), title)
  record(title, result, probe)
  return result
}

// Two normalized sources with a verified shared order become one business/settlement event.
const direct = createMatcher()
let result = commit(direct, [wechat('W-1', 'ORDER-1'), bank('B-1', 'ORDER-1')], 'shared-order')
assert.equal(result.linked.length, 1)
assert.equal(direct.view().events.length, 1)
assert.equal(direct.view().events[0].sourceKeys.length, 2)
assert.equal(direct.view().expenseMinor, 3500)
assert.equal(direct.view().bankDeltaMinor, -3500)

// Reimport records: visible skip notices, while a retry of the same operation returns its original result.
const repeatRows = [wechat('W-1', 'ORDER-1'), bank('B-1', 'ORDER-1')]
const repeated = commit(direct, repeatRows, 'repeat-file')
assert.equal(repeated.skipped.length, 2)
assert.equal(direct.view().notices.length, 2)
const retry = direct.apply(direct.prepare(repeatRows), 'repeat-file')
record('same-operation-retry', retry, direct)
assert.deepEqual(retry, repeated)
assert.equal(direct.view().notices.length, 2)
assert.equal(direct.view().expenseMinor, 3500)

// Import order is irrelevant for the accounting result.
for (const [first, second] of [
  [wechat('W-2', 'ORDER-2'), bank('B-2', 'ORDER-2')],
  [bank('B-3', 'ORDER-3'), wechat('W-3', 'ORDER-3')],
]) {
  const probe = createMatcher()
  commit(probe, [first], 'first-' + first.transactionId)
  result = commit(probe, [second], 'second-' + second.transactionId)
  assert.equal(result.linked.length, 1)
  assert.equal(probe.view().events.length, 1)
  assert.equal(probe.view().expenseMinor, 3500)
  assert.equal(probe.view().bankDeltaMinor, -3500)
}

// Equal text in different identifier namespaces is not a verified shared order.
const wrongNamespace = createMatcher()
commit(wrongNamespace, [wechat('W-4', '12345'), bank('B-4', '12345',
  { orderNamespace: 'bank-transaction' })], 'different-namespace')
assert.equal(wrongNamespace.view().events.length, 2)
assert.equal(wrongNamespace.view().expenseMinor, 3500)
assert.equal(wrongNamespace.view().bankDeltaMinor, -3500)

// Equal date and amount with different orders remain separate purchases.
const distinct = createMatcher()
commit(distinct, [wechat('W-5', 'ORDER-5'), wechat('W-6', 'ORDER-6')], 'different-orders')
assert.equal(distinct.view().events.length, 2)
assert.equal(distinct.view().expenseMinor, 7000)

// Conflicting pair is held; an unrelated clear item in the same batch can post.
const partial = createMatcher()
result = commit(partial, [wechat('W-7', 'ORDER-7'), bank('B-7', 'ORDER-7',
  { amountMinor: 3600 }), wechat('W-8', 'ORDER-8', { amountMinor: 2000 }),
  bank('B-9', 'ORDER-9', { date: '' })], 'partial-batch')
assert.equal(result.review.length, 3)
assert.equal(result.posted.length, 1)
assert.equal(partial.view().expenseMinor, 2000)
assert.equal(partial.view().bankDeltaMinor, 0)
assert.deepEqual(new Set(result.review.map((item) => item.code)), new Set(['FACT_CONFLICT', 'UNCERTAIN_FACT']))

// A missing date in one source blocks its shared-order partner, but not unrelated rows.
const dependent = createMatcher()
result = commit(dependent, [wechat('W-14', 'ORDER-14'),
  bank('B-14', 'ORDER-14', { date: '' }),
  wechat('W-15', 'ORDER-15', { amountMinor: 2000 })], 'dependent-uncertain-date')
assert.equal(result.review.length, 2)
assert.equal(result.posted.length, 1)
assert.deepEqual(new Set(result.review.map((item) => item.code)),
  new Set(['UNCERTAIN_FACT', 'DEPENDENT_ISSUE']))
assert.equal(dependent.view().expenseMinor, 2000)
assert.equal(dependent.view().bankDeltaMinor, 0)

// A changed version of a known source blocks a new same-order partner.
const changedSource = createMatcher()
commit(changedSource, [wechat('W-16', 'ORDER-16')], 'original-source')
result = commit(changedSource, [wechat('W-16', 'ORDER-16', { amountMinor: 3600 }),
  bank('B-16', 'ORDER-16')], 'changed-source')
assert.equal(result.review.length, 2)
assert.equal(changedSource.view().expenseMinor, 3500)
assert.equal(changedSource.view().bankDeltaMinor, 0)

// More than one potential target never picks an arbitrary match.
const ambiguous = createMatcher()
result = commit(ambiguous, [wechat('W-10', 'ORDER-10'),
  wechat('W-11', 'ORDER-10'), bank('B-10', 'ORDER-10')], 'ambiguous-order')
assert.equal(result.review.length, 3)
assert.equal(ambiguous.view().events.length, 0)

// A legacy two-event state can reconcile without adding either amount a second time.
const legacy = createMatcher()
commit(legacy, [wechat('W-12', 'ORDER-12'), bank('B-12', 'ORDER-12')],
  'legacy-independent-seed', { disableAutoLink: true })
assert.equal(legacy.view().events.length, 2)
const before = { expenseMinor: legacy.view().expenseMinor, bankDeltaMinor: legacy.view().bankDeltaMinor }
result = legacy.reconcile('personal|merchant-order|ORDER-12')
record('reconcile-existing-events', result, legacy)
assert.equal(result.status, 'linked')
assert.equal(legacy.view().events.length, 1)
assert.equal(legacy.view().aliases[result.alias], result.eventId)
assert.equal(legacy.view().expenseMinor, before.expenseMinor)
assert.equal(legacy.view().bankDeltaMinor, before.bankDeltaMinor)

// A second preview prepared at the same revision must re-evaluate after the first commits.
const concurrent = createMatcher()
const sameBank = bank('B-13', 'ORDER-13')
const firstPreview = concurrent.prepare([sameBank])
const secondPreview = concurrent.prepare([sameBank])
result = concurrent.apply(firstPreview, 'concurrent-first')
record('concurrent-first', result, concurrent)
assert.throws(() => concurrent.apply(secondPreview, 'concurrent-second'), /STALE_PREVIEW/)
result = commit(concurrent, [sameBank], 'concurrent-retry')
assert.equal(result.skipped.length, 1)
assert.equal(concurrent.view().bankDeltaMinor, -3500)
assert.equal(concurrent.view().events.length, 1)

process.stdout.write('\nPASS: synthetic cross-source identity, matching, review, partial batch and stale preview scenarios\n')
