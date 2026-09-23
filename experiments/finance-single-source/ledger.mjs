import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const HEADER = ['交易日期', '交易单号', '真实账户', '收支类型', '金额(元)', '分类', '状态']
const initialState = () => ({ ledgerRevision: 0, entries: [], proposals: {}, operations: {} })
const digest = (value) => createHash('sha256').update(value).digest('hex')

export class FinanceProbeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'FinanceProbeError'
    this.code = code
  }
}

async function load(statePath) {
  try { return JSON.parse(await readFile(statePath, 'utf8')) }
  catch (error) {
    if (error?.code === 'ENOENT') return initialState()
    throw error
  }
}

async function save(statePath, state) {
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = statePath + '.' + randomUUID() + '.tmp'
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), { flag: 'wx' })
  await rename(temporaryPath, statePath)
}

function parseCsv(text) {
  const records = []
  let fields = []
  let field = ''
  let quoted = false
  let afterQuote = false
  let line = 1
  let recordLine = 1
  const endRecord = () => {
    fields.push(field)
    if (fields.some((value) => value !== '')) records.push({ line: recordLine, fields })
    fields = []
    field = ''
    afterQuote = false
    recordLine = line + 1
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++ }
      else if (char === '"') { quoted = false; afterQuote = true }
      else { field += char; if (char === '\n') line++ }
    } else if (char === '"' && field === '' && !afterQuote) {
      quoted = true
    } else if (char === ',' && !afterQuote) {
      fields.push(field)
      field = ''
    } else if (char === ',') {
      fields.push(field)
      field = ''
      afterQuote = false
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      endRecord()
      line++
    } else if (afterQuote) {
      throw new FinanceProbeError('INVALID_CSV', `Unexpected character after quote on line ${line}`)
    } else {
      field += char
    }
  }
  if (quoted) throw new FinanceProbeError('INVALID_CSV', 'Unclosed quoted field')
  if (field !== '' || fields.length > 0 || afterQuote) endRecord()
  return records
}

function amountMinor(value, line) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new FinanceProbeError('INVALID_AMOUNT', `Invalid amount on line ${line}`)
  }
  const [whole, fraction = ''] = value.split('.')
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (minor < 1n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FinanceProbeError('INVALID_AMOUNT', `Amount out of range on line ${line}`)
  }
  return Number(minor)
}

function transactionRow(record, bookId, fileHash) {
  const [date, externalId, account, direction, amount, category, status] = record.fields
  if (record.fields.length !== HEADER.length || !externalId || !account || !category) {
    throw new FinanceProbeError('INVALID_ROW', `Missing required field on line ${record.line}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new FinanceProbeError('INVALID_DATE', `Invalid date on line ${record.line}`)
  }
  if (direction !== '支出' || status !== '完成') {
    throw new FinanceProbeError('UNSUPPORTED_ROW', `Only completed expense rows are supported on line ${record.line}`)
  }
  const cents = amountMinor(amount, record.line)
  const sourceKey = [bookId, 'synthetic-csv-v1', account, externalId].join('|')
  const factHash = digest(JSON.stringify({ date, externalId, account, direction, cents, category, status }))
  return { sourceKey, factHash, externalId, date, account, category, expenseMinor: cents,
    bankDeltaMinor: -cents, source: { fileHash, line: record.line } }
}

export function openLedger(statePath) {
  return {
    async prepareImport({ bookId, csvText }) {
      if (!bookId || typeof bookId !== 'string') throw new FinanceProbeError('INVALID_BOOK', 'Book id is required')
      const records = parseCsv(csvText.replace(/^\uFEFF/, ''))
      if (records.length === 0 || records[0].fields.join('\u0000') !== HEADER.join('\u0000')) {
        throw new FinanceProbeError('UNSUPPORTED_FORMAT', 'Expected the fixed synthetic CSV header')
      }
      const state = await load(statePath)
      const fileHash = digest(csvText)
      const existing = new Map(state.entries.filter((entry) => entry.bookId === bookId).map((entry) => [entry.sourceKey, entry]))
      const seen = new Map()
      const rows = []
      for (const record of records.slice(1)) {
        const row = transactionRow(record, bookId, fileHash)
        const prior = seen.get(row.sourceKey) ?? existing.get(row.sourceKey)
        const decision = prior === undefined ? 'new' : prior.factHash === row.factHash ? 'duplicate' : 'conflict'
        rows.push({ ...row, decision })
        if (prior === undefined) seen.set(row.sourceKey, row)
      }
      const proposalId = randomUUID()
      const proposal = { proposalId, bookId, baseRevision: state.ledgerRevision, rows,
        issues: rows.filter((row) => row.decision === 'conflict').map((row) => ({ code: 'SOURCE_CONFLICT', line: row.source.line })),
        counts: { added: rows.filter((row) => row.decision === 'new').length,
          duplicate: rows.filter((row) => row.decision === 'duplicate').length },
      }
      state.proposals[proposalId] = proposal
      await save(statePath, state)
      return structuredClone(proposal)
    },

    async applyImport({ proposalId, bookId, idempotencyKey }) {
      if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        throw new FinanceProbeError('INVALID_KEY', 'Idempotency key is required')
      }
      const state = await load(statePath)
      const operationKey = `${bookId}|${idempotencyKey}`
      const requestHash = digest(JSON.stringify({ proposalId, bookId }))
      const previous = state.operations[operationKey]
      if (previous) {
        if (previous.requestHash !== requestHash) throw new FinanceProbeError('IDEMPOTENCY_CONFLICT', 'Key used for another request')
        return structuredClone(previous.result)
      }
      const proposal = state.proposals[proposalId]
      if (!proposal || proposal.bookId !== bookId) throw new FinanceProbeError('PROPOSAL_NOT_FOUND', 'Proposal not found in book')
      if (proposal.issues.length) throw new FinanceProbeError('REVIEW_REQUIRED', 'Proposal has unresolved source conflicts')
      if (proposal.baseRevision !== state.ledgerRevision) throw new FinanceProbeError('VERSION_CONFLICT', 'Preview is stale')
      const existing = new Map(state.entries.filter((entry) => entry.bookId === bookId).map((entry) => [entry.sourceKey, entry]))
      const added = []
      for (const row of proposal.rows) {
        const prior = existing.get(row.sourceKey)
        if (prior && (prior.factHash !== row.factHash || row.decision !== 'duplicate')) {
          throw new FinanceProbeError('SOURCE_CONFLICT', 'Source changed after preview')
        }
        if (!prior && row.decision === 'duplicate') throw new FinanceProbeError('SOURCE_CONFLICT', 'Preview duplicate disappeared')
        if (row.decision === 'new') {
          const entry = { id: randomUUID(), bookId, ...row }
          delete entry.decision
          state.entries.push(entry)
          existing.set(row.sourceKey, entry)
          added.push(entry.id)
        }
      }
      if (added.length) state.ledgerRevision++
      const result = { proposalId, bookId, addedIds: added, duplicateCount: proposal.counts.duplicate,
        ledgerRevision: state.ledgerRevision }
      state.operations[operationKey] = { requestHash, result }
      await save(statePath, state)
      return structuredClone(result)
    },

    async query(bookId) {
      const state = await load(statePath)
      const entries = state.entries.filter((entry) => entry.bookId === bookId)
      const categoryTotals = {}
      const accountDeltas = {}
      for (const entry of entries) {
        categoryTotals[entry.category] = (categoryTotals[entry.category] ?? 0) + entry.expenseMinor
        accountDeltas[entry.account] = (accountDeltas[entry.account] ?? 0) + entry.bankDeltaMinor
      }
      return { ledgerRevision: state.ledgerRevision, entries: structuredClone(entries),
        expenseMinor: entries.reduce((sum, entry) => sum + entry.expenseMinor, 0), categoryTotals, accountDeltas,
        coverage: 'Only completed synthetic CSV expenses; account opening balances are unknown' }
    },
  }
}
