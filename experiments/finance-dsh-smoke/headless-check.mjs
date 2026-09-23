export const name = 'finance-headless-query-probe'
export const inject = ['financeProbe', 'tools', 'typertGateway']

export async function apply(ctx) {
  const expected = 'expenseMinor=3500;bankDeltaMinor=-3500'
  const toolResult = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: 'finance-headless-call',
    name: 'finance_probe_summary',
    arguments: {},
  })
  const remoteResult = await ctx.typertGateway.invoke({
    namespace: 'financeProbe',
    method: 'summary',
    args: {},
  })
  const ok = ctx.financeProbe.summary() === expected
    && !toolResult.isError && toolResult.value === expected
    && remoteResult === expected
  console.log('[finance-smoke] core-only query passed=' + ok)
  if (!ok) throw new Error('Core-only query returned an inconsistent result')
}
