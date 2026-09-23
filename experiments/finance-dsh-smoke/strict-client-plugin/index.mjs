export const name = 'finance-strict-ui-adapter-probe'
export const inject = ['financeSummary', 'typertGateway']

export async function apply(ctx) {
  const result = await ctx.typertGateway.invoke({
    namespace: 'financeSummary',
    method: 'summary',
    args: { request: { bookId: 'personal-probe' } },
  })
  if (result?.expenseMinor !== 3500 || result?.bankDeltaMinor !== -3500) {
    throw new Error('Strict Host Gateway returned an unexpected value')
  }
  console.log('[finance-strict] Host Gateway strict invocation passed')
}
