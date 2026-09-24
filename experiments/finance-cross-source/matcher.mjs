// THROWAWAY PROTOTYPE: synthetic, normalized records only; no DSH or persistence.
const sourceKey = (row) => `${row.book}|${row.channel}|${row.scope}|${row.transactionId}`
const orderKey = (row) => row.orderVerified && row.orderNamespace && row.orderId
  ? `${row.book}|${row.orderNamespace}|${row.orderId}` : null
const fingerprint = (row) => JSON.stringify(row)

function valid(row) {
  return row.book && row.scope && row.transactionId && Number.isSafeInteger(row.amountMinor) &&
    row.amountMinor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date ?? '') &&
    row.status === 'completed' && row.currency === 'CNY' &&
    ((row.channel === 'wechat' && row.kind === 'purchase' && row.fundingAccount) ||
      (row.channel === 'bank' && row.kind === 'debit' && row.account))
}

function compatible(left, right) {
  const wechat = left.channel === 'wechat' ? left : right
  const bank = left.channel === 'bank' ? left : right
  return wechat.channel === 'wechat' && bank.channel === 'bank' &&
    wechat.amountMinor === bank.amountMinor && wechat.currency === bank.currency &&
    wechat.date === bank.date && wechat.fundingAccount === bank.account &&
    wechat.status === 'completed' && bank.status === 'completed'
}

export function createMatcher() {
  const state = {
    revision: 0, nextEvent: 1, sources: new Map(), events: new Map(),
    operations: new Map(), notices: [], issues: [], aliases: new Map(),
  }

  function plan(rows, disableAutoLink = false) {
    const actions = []
    const fresh = []
    const seen = new Map()
    const blockedOrders = new Set()
    for (const row of rows) {
      const key = sourceKey(row)
      const prior = seen.get(key) ?? state.sources.get(key)?.row
      if (prior) {
        const same = fingerprint(prior) === fingerprint(row)
        actions.push({ type: same ? 'skip' : 'review',
          rows: [row], reason: same ? 'SAME_SOURCE' : 'SOURCE_CONFLICT' })
        if (!same && orderKey(row)) blockedOrders.add(orderKey(row))
      } else if (!valid(row)) {
        actions.push({ type: 'review', rows: [row], reason: 'UNCERTAIN_FACT' })
        if (orderKey(row)) blockedOrders.add(orderKey(row))
      } else {
        fresh.push(row)
        seen.set(key, row)
      }
    }

    if (disableAutoLink) {
      for (const row of fresh) actions.push({ type: 'post', rows: [row] })
      return actions
    }

    const groups = new Map()
    for (const source of state.sources.values()) {
      const key = orderKey(source.row)
      if (key) groups.set(key, [...(groups.get(key) ?? []), { row: source.row, existing: true }])
    }
    for (const row of fresh) {
      const key = orderKey(row)
      if (!key) { actions.push({ type: 'post', rows: [row] }); continue }
      groups.set(key, [...(groups.get(key) ?? []), { row, existing: false }])
    }

    for (const [key, group] of groups) {
      const incoming = group.filter((item) => !item.existing).map((item) => item.row)
      if (!incoming.length) continue
      if (blockedOrders.has(key)) {
        actions.push({ type: 'review', rows: incoming, reason: 'DEPENDENT_ISSUE' })
      } else if (group.length === 1) {
        actions.push({ type: 'post', rows: incoming })
      } else if (group.length === 2 && compatible(group[0].row, group[1].row)) {
        actions.push({ type: 'link', rows: incoming,
          existingKey: group.find((item) => item.existing)?.row &&
            sourceKey(group.find((item) => item.existing).row) })
      } else {
        actions.push({ type: 'review', rows: incoming, reason: group.length > 2 ? 'AMBIGUOUS_ORDER' : 'FACT_CONFLICT' })
      }
    }
    return actions
  }

  function refresh(event) {
    const rows = event.sourceKeys.map((key) => state.sources.get(key).row)
    const wechat = rows.find((row) => row.channel === 'wechat')
    const bank = rows.find((row) => row.channel === 'bank')
    if (rows.filter((row) => row.channel === 'wechat').length > 1 ||
        rows.filter((row) => row.channel === 'bank').length > 1) throw new Error('DUPLICATE_EFFECT')
    event.expenseMinor = wechat?.amountMinor ?? 0
    event.bankDeltaMinor = bank ? -bank.amountMinor : 0
    event.bankAccount = bank?.account ?? null
  }

  function addEvent(rows) {
    const event = { id: `E${state.nextEvent++}`, sourceKeys: [], expenseMinor: 0,
      bankDeltaMinor: 0, bankAccount: null }
    state.events.set(event.id, event)
    for (const row of rows) {
      const key = sourceKey(row)
      state.sources.set(key, { row, eventId: event.id })
      event.sourceKeys.push(key)
    }
    refresh(event)
    return event.id
  }

  function appendToEvent(eventId, rows) {
    const event = state.events.get(eventId)
    for (const row of rows) {
      const key = sourceKey(row)
      state.sources.set(key, { row, eventId })
      event.sourceKeys.push(key)
    }
    refresh(event)
    return event.id
  }

  function view() {
    const events = [...state.events.values()].map((event) => ({ ...event, sourceKeys: [...event.sourceKeys] }))
    return {
      revision: state.revision, events,
      expenseMinor: events.reduce((sum, event) => sum + event.expenseMinor, 0),
      bankDeltaMinor: events.reduce((sum, event) => sum + event.bankDeltaMinor, 0),
      notices: structuredClone(state.notices), issues: structuredClone(state.issues),
      aliases: Object.fromEntries(state.aliases),
    }
  }

  return {
    prepare(rows, { disableAutoLink = false } = {}) {
      const copied = structuredClone(rows)
      return { rows: copied, baseRevision: state.revision, disableAutoLink,
        preview: plan(copied, disableAutoLink) }
    },
    apply(proposal, operationId) {
      const request = JSON.stringify({ rows: proposal.rows, disableAutoLink: proposal.disableAutoLink })
      const previous = state.operations.get(operationId)
      if (previous) {
        if (previous.request !== request) throw new Error('IDEMPOTENCY_CONFLICT')
        return structuredClone(previous.result)
      }
      if (proposal.baseRevision !== state.revision) throw new Error('STALE_PREVIEW')
      const actions = plan(proposal.rows, proposal.disableAutoLink)
      if (JSON.stringify(actions) !== JSON.stringify(proposal.preview)) throw new Error('CHANGED_PREVIEW')
      const result = { posted: [], linked: [], skipped: [], review: [] }
      for (const action of actions) {
        if (action.type === 'post') result.posted.push(addEvent(action.rows))
        if (action.type === 'link') {
          const eventId = action.existingKey
            ? appendToEvent(state.sources.get(action.existingKey).eventId, action.rows)
            : addEvent(action.rows)
          result.linked.push(eventId)
        }
        if (action.type === 'skip') {
          const notice = { code: action.reason, sourceKey: sourceKey(action.rows[0]), operationId }
          state.notices.push(notice)
          result.skipped.push(notice)
        }
        if (action.type === 'review') {
          for (const row of action.rows) {
            const issue = { code: action.reason, sourceKey: sourceKey(row), operationId }
            state.issues.push(issue)
            result.review.push(issue)
          }
        }
      }
      state.revision++
      state.operations.set(operationId, { request, result })
      return structuredClone(result)
    },
    reconcile(key) {
      const matching = [...state.sources.values()].filter((source) => orderKey(source.row) === key)
      if (matching.length !== 2 || !compatible(matching[0].row, matching[1].row)) return { status: 'review' }
      const first = state.events.get(matching[0].eventId)
      const second = state.events.get(matching[1].eventId)
      if (first.id === second.id) return { status: 'already-linked', eventId: first.id }
      for (const source of matching) {
        source.eventId = first.id
      }
      first.sourceKeys.push(...second.sourceKeys)
      state.events.delete(second.id)
      state.aliases.set(second.id, first.id)
      refresh(first)
      state.revision++
      return { status: 'linked', eventId: first.id, alias: second.id }
    },
    view,
  }
}
