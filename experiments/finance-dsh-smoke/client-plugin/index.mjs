export const name = 'finance-ui-adapter-probe'
export const inject = ['financeProbe', 'tools', 'typertGateway']

export async function apply(ctx) {
  const summary = ctx.financeProbe.summary()
  const toolVisible = ctx.tools.schemas().some((tool) => tool.name === 'finance_probe_summary')
  const toolResult = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: 'finance-probe-call',
    name: 'finance_probe_summary',
    arguments: {},
  })
  const remoteResult = await ctx.typertGateway.invoke({
    namespace: 'financeProbe',
    method: 'summary',
    args: {},
  })
  const expected = 'expenseMinor=3500;bankDeltaMinor=-3500'
  const toolExecuted = !toolResult.isError && toolResult.value === expected
  const remoteDispatched = remoteResult === expected
  console.log('[finance-smoke] ui adapter summary=' + summary + '; toolVisible=' + toolVisible + '; toolExecuted=' + toolExecuted + '; remoteDispatched=' + remoteDispatched)
  if (summary !== expected || !toolVisible || !toolExecuted || !remoteDispatched) {
    throw new Error('Host adapter did not observe the shared core, tool execution, and Remote dispatch')
  }
}
