import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'finance-prototype-core'
export const inject = ['tools']

export async function apply(ctx) {
  const sourceRoot = process.env.DSH_SOURCE_ROOT
  if (!sourceRoot) throw new Error('DSH_SOURCE_ROOT is required')
  const toolsEntry = pathToFileURL(join(sourceRoot, 'packages', 'core', 'tools', 'lib', 'index.js'))
  const { defineTool } = await import(toolsEntry.href)
  const cases = JSON.parse(await readFile(new URL('../mock-cases.json', import.meta.url), 'utf8'))
  const byId = new Map(cases.map((item) => [item.id, item]))
  ctx.tools.register(defineTool({
    name: 'finance_review_case',
    description: 'Read one synthetic DSH Finance review case by id. This tool never posts, merges, or edits any account.',
    parameters: {
      case_id: { type: 'string', required: true, description: 'Review case id: lunch, sameamount, partial, or conflict' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const item = byId.get(args.case_id)
      if (!item) throw new Error('Unknown synthetic review case id')
      return JSON.stringify({
        bookId: 'personal-prototype',
        caseId: item.id,
        title: item.title,
        existingRecord: item.manual,
        existingRecordBasis: item.manualMeta,
        importedSource: item.source,
        sourceLocation: item.sourceMeta,
        extraSource: item.extraSource ?? null,
        businessAmountMinor: item.businessAmountMinor,
        bankMovementMinor: item.bankMovementMinor,
        currency: item.currency,
        candidatesOnly: true,
        decisionOptions: item.options.map((option) => ({
          key: option.key,
          label: option.label,
          expenseDeltaMinor: option.expense * 100,
          bankDeltaMinor: option.bank * 100,
          unmatchedDeltaMinor: option.unmatched * 100,
        })),
      })
    },
  }))
  if (!ctx.tools.schemas().some((tool) => tool.name === 'finance_review_case')) {
    throw new Error('finance_review_case is absent from model-visible tool schemas')
  }
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: 'finance-prototype-read-only-check',
    name: 'finance_review_case',
    arguments: { case_id: 'partial' },
  })
  if (result.isError) throw new Error('finance_review_case failed through the DSH tool pipeline')
  const sample = JSON.parse(result.value)
  if (sample.businessAmountMinor !== 10000 || sample.bankMovementMinor !== -6000) {
    throw new Error('Synthetic tool result does not match the shared fixture')
  }
  console.log('[finance-prototype] read-only finance tool ready')
}
