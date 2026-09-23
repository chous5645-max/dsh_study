window.__ModuleLoader__.load({
  id: 'dsh-finance-strict-ui-probe',
  factory: (require) => {
    const React = require('react')
    return {
      name: 'finance-strict-client-probe',
      inject: ['remote', 'slots', 'layout'],
      async apply(ctx) {
        const contribution = window.__financeStrictRemoteContribution
        if (!contribution) throw new Error('Generated Finance Remote contribution missing')
        await ctx.remote.$mount(contribution)
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'finance-strict-probe',
        }, () => React.createElement('div', { 'data-finance-smoke-panel': 'rendered' }, 'Strict Remote probe')))
        window.__financeSmokeSelectPanel = () => ctx.layout.selectPanel('finance-strict-probe')
        document.documentElement.setAttribute('data-finance-smoke-client', 'loaded')
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            const result = await ctx.remote.financeSummary.summary({ bookId: 'personal-probe' })
            if (result.ok && result.value?.expenseMinor === 3500 && result.value?.bankDeltaMinor === -3500) {
              document.documentElement.setAttribute('data-finance-smoke-remote', 'ok')
              document.documentElement.setAttribute('data-finance-strict-remote', 'ok')
              return
            }
            document.documentElement.setAttribute('data-finance-strict-error', result.ok ? 'wrong-value' : String(result.error?.code ?? 'unknown'))
          } catch (error) {
            document.documentElement.setAttribute('data-finance-strict-error', error instanceof Error ? error.name : 'unknown')
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
      },
    }
  },
})
