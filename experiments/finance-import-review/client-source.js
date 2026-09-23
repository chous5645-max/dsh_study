window.__ModuleLoader__.load({
  id: 'dsh-finance-import-review-prototype',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const CSS = __FINANCE_PROTO_CSS__
    const PROTOTYPE_WORKSPACE_PATH = __FINANCE_PROTO_WORKSPACE_PATH__
    const VARIANTS = [
      { key: 'A', name: '并排工作台' },
      { key: 'B', name: '逐题核对' },
      { key: 'C', name: '账目优先' },
    ]
    const CASES = __FINANCE_PROTO_CASES__
    const CASE_BY_ID = Object.fromEntries(CASES.map((item) => [item.id, item]))
    const INITIAL_EXPENSE = CASES.reduce((sum, item) => sum + item.businessAmountMinor / 100, 0)
    const KNOWN_BANK = CASES.reduce((sum, item) => sum + item.bankMovementMinor / 100, 0)
    const INITIAL_UNMATCHED = INITIAL_EXPENSE
    const prototypeMemory = {}
    const yuan = (value) => (value < 0 ? '-¥' + Math.abs(value) : '¥' + value)
    const delta = (value) => (value > 0 ? '+¥' + value : value < 0 ? '-¥' + Math.abs(value) : '¥0')
    const minorMoney = (minor) => (minor < 0 ? '-' : '') + '¥' + (Math.abs(minor) / 100).toFixed(2)
    const classes = (...names) => names.filter(Boolean).join(' ')
    const variantFromUrl = () => {
      const key = new URL(window.location.href).searchParams.get('variant')
      return VARIANTS.some((variant) => variant.key === key) ? key : 'A'
    }
    function statusFor(item, decisions) {
      const selected = decisions[item.id]
      if (!selected) return '待核对'
      if (selected === 'defer') return '已暂缓'
      return '已处理'
    }
    function totalsFor(decisions) {
      let expense = INITIAL_EXPENSE
      let unmatched = INITIAL_UNMATCHED
      for (const item of CASES) {
        const chosen = item.options.find((option) => option.key === decisions[item.id])
        if (chosen) {
          expense += chosen.expense
          unmatched += chosen.unmatched
        }
      }
      return {
        expense,
        bank: KNOWN_BANK,
        unmatched,
        remaining: CASES.filter((item) => !decisions[item.id] || decisions[item.id] === 'defer').length,
        resolved: CASES.filter((item) => decisions[item.id] && decisions[item.id] !== 'defer').length,
      }
    }
    function Chip(props) {
      return h('span', { className: classes('fin-chip', props.tone && 'fin-chip-' + props.tone) }, props.children)
    }
    function Header(props) {
      return h('div', { className: 'fin-header' },
        h('div', { className: 'fin-brand' },
          h('div', { className: 'fin-brand-mark' }, '旻'),
          h('div', null, h('strong', null, '财务工作台'), h('small', null, 'DSH FINANCE · 交互原型'))),
        h('div', { className: 'fin-header-nav' },
          h('button', { className: classes('fin-nav', props.view === 'review' && 'active'), onClick: () => props.onView('review') }, '导入核对'),
          h('button', { className: classes('fin-nav', props.view === 'ledger' && 'active'), onClick: () => props.onView('ledger') }, '账目列表')),
        h('div', { className: 'fin-header-actions' },
          h('span', { className: 'fin-book' }, '个人账本', h('span', { className: 'fin-chevron' }, '⌄')),
          h('button', { className: classes('fin-assistant-toggle', props.assistantOpen && 'active'), onClick: props.onToggleAssistant }, props.assistantOpen ? '✦ 收起助理' : '✦ 问财务助理'),
          h('button', { className: 'fin-ghost-btn', onClick: props.onReset }, '重置演示')))
    }
    function Stats(props) {
      const totals = props.totals
      return h('div', { className: 'fin-stats' },
        h('div', { className: 'fin-stat' }, h('small', null, '导入资料'), h('strong', null, '02', h('em', null, '份')), h('span', null, '微信明细 + 银行截图')),
        h('div', { className: 'fin-stat' }, h('small', null, '需要处理'), h('strong', { className: totals.remaining ? 'fin-amber' : 'fin-green' }, String(totals.remaining).padStart(2, '0'), h('em', null, '项')), h('span', null, '已处理 ' + totals.resolved + ' 项')),
        h('div', { className: 'fin-stat' }, h('small', null, '已确认消费'), h('strong', null, yuan(totals.expense)), h('span', null, '按业务账目统计')),
        h('div', { className: 'fin-stat' }, h('small', null, '已确认银行扣款'), h('strong', null, yuan(totals.bank)), h('span', null, '已知账户事实，匹配不再扣一次')))
    }
    function FileStrip(props) {
      return h('div', { className: 'fin-files' },
        h('button', { className: classes('fin-file', props.filter === 'all' && 'selected'), onClick: () => props.onFilter('all') },
          h('span', { className: 'fin-file-icon all' }, '⌑'), h('span', null, h('b', null, '全部资料'), h('small', null, '4 条待核对线索'))),
        h('button', { className: classes('fin-file', props.filter === 'bank' && 'selected'), onClick: () => props.onFilter('bank') },
          h('span', { className: 'fin-file-icon bank' }, '▤'), h('span', null, h('b', null, '工商银行流水.png'), h('small', null, '4 条扣款 · 金额已确认'))),
        h('button', { className: classes('fin-file', props.filter === 'wechat' && 'selected'), onClick: () => props.onFilter('wechat') },
          h('span', { className: 'fin-file-icon wechat' }, '微'), h('span', null, h('b', null, '微信账单.csv'), h('small', null, '1 条补充来源 · 无新增消费'))))
    }
    function QueueItem(props) {
      const item = props.item
      const status = statusFor(item, props.decisions)
      return h('button', {
        className: classes('fin-queue-item', props.selected && 'selected'),
        onClick: () => props.onSelect(item.id),
      },
      h('div', { className: 'fin-queue-top' }, h('span', { className: 'fin-queue-kind' }, item.kind), h('span', { className: classes('fin-queue-status', status === '已处理' && 'done') }, status)),
      h('strong', null, item.title),
      h('span', { className: 'fin-queue-sub' }, item.date + ' · ' + item.place))
    }
    function EvidenceCard(props) {
      const item = props.item
      return h('div', { className: classes('fin-evidence', props.kind) },
        h('div', { className: 'fin-card-top' },
          h('span', { className: 'fin-card-icon' }, props.kind === 'manual' ? '✎' : '▤'),
          h('span', null, h('strong', null, props.kind === 'manual' ? '已有账目' : '导入来源'), h('small', null, props.kind === 'manual' ? '用户明确输入' : '原始流水证据'))),
        h('div', { className: 'fin-evidence-amount' }, minorMoney(props.kind === 'manual' ? item.businessAmountMinor : item.bankMovementMinor)),
        h('p', { className: 'fin-evidence-quote' }, props.kind === 'manual' ? item.manual : item.source),
        h('small', { className: 'fin-evidence-meta' }, props.kind === 'manual' ? item.manualMeta : item.sourceMeta),
        props.kind === 'source' && item.extraSource && h('div', { className: 'fin-extra-source' }, h('b', null, '另一份来源'), h('span', null, item.extraSource)))
    }
    function Impact(props) {
      const option = props.option
      return h('div', { className: 'fin-impact' },
        h('div', { className: 'fin-impact-head' }, h('strong', null, '本次操作的金额影响'), h('span', null, '与已确认事实分开计算')),
        h('div', { className: 'fin-impact-grid' },
          h('div', null, h('small', null, '消费变化'), h('strong', { className: option.expense < 0 ? 'negative' : '' }, delta(option.expense))),
          h('div', null, h('small', null, '银行余额变化'), h('strong', null, delta(option.bank))),
          h('div', null, h('small', null, '待匹配减少'), h('strong', { className: option.unmatched < 0 ? 'positive' : '' }, option.unmatched < 0 ? yuan(-option.unmatched) : '¥0'))),
        h('p', null, '银行扣款已作为账户事实入账；建立对应关系不会再扣一次。'))
    }
    function Choices(props) {
      return h('div', { className: 'fin-choice-wrap' },
        h('div', { className: 'fin-section-title' }, h('strong', null, '如何处理这条线索'), h('small', null, '选择后先看影响，再确认')),
        h('div', { className: 'fin-choices' },
          props.item.options.map((option) => h('button', {
            key: option.key,
            className: classes('fin-choice', props.choice === option.key && 'active'),
            onClick: () => props.onChoice(option.key),
          }, h('span', { className: 'fin-radio' }), h('span', null, h('b', null, option.label), h('small', null, option.note))))),
        h('button', { className: 'fin-primary-btn', onClick: props.onApply }, props.decided ? '更新处理结果' : '确认处理'),
        props.decided && h('button', { className: 'fin-text-btn', onClick: props.onUndo }, '撤销本次选择'))
    }
    function DetailIntro(props) {
      const item = props.item
      return h('div', { className: 'fin-detail-intro' },
        h('div', { className: 'fin-eyebrow' }, item.eyebrow),
        h('h2', null, item.title),
        h('div', { className: 'fin-detail-meta' }, h(Chip, { tone: 'amber' }, item.kind), h('span', null, item.date + ' · ' + item.place)),
        h('p', null, item.sourceHint))
    }

    function VariantA(props) {
      return h('div', { className: 'fin-variant-a' },
        h('div', { className: 'fin-workspace-heading' },
          h('div', null, h('span', { className: 'fin-kicker' }, 'REVIEW WORKSPACE'), h('h2', null, '导入核对'), h('p', null, '按问题逐项处理，原始证据与金额影响始终可见。')),
          h(Chip, { tone: 'light' }, '4 条线索 · 同一账本')),
        h('div', { className: 'fin-split' },
          h('aside', { className: 'fin-queue-panel' },
            h('div', { className: 'fin-panel-title' }, h('strong', null, '需要你判断'), h('span', null, props.totals.remaining + ' 项待处理')),
            h('div', { className: 'fin-queue-list' }, props.items.map((item) => h(QueueItem, {
              key: item.id, item, selected: props.item.id === item.id, decisions: props.decisions, onSelect: props.onSelect,
            }))),
            h('div', { className: 'fin-queue-note' }, h('strong', null, '可靠部分已先保留'), h('p', null, '账户扣款和已确认消费分别入账；候选对应关系不改变金额。'))),
          h('main', { className: 'fin-detail-panel' },
            h(DetailIntro, { item: props.item }),
            h('div', { className: 'fin-comparison-head' }, h('strong', null, '两份依据并排核对'), h('small', null, '来源记录 · 正式账目')),
            h('div', { className: 'fin-evidence-grid' },
              h(EvidenceCard, { item: props.item, kind: 'manual' }),
              h(EvidenceCard, { item: props.item, kind: 'source' })),
            h('div', { className: 'fin-detail-bottom' },
              h(Impact, { option: props.option }),
              h(Choices, props)))))
    }
    function VariantB(props) {
      const position = CASES.findIndex((item) => item.id === props.item.id)
      return h('div', { className: 'fin-variant-b' },
        h('div', { className: 'fin-wizard-top' },
          h('div', null, h('span', { className: 'fin-kicker' }, 'GUIDED REVIEW'), h('h2', null, '一次只处理一个判断'), h('p', null, '先核对证据，再确认它会改变什么。')),
          h('div', { className: 'fin-step-counter' }, h('strong', null, String(position + 1).padStart(2, '0')), h('span', null, '/ 04'))),
        h('div', { className: 'fin-progress-track' }, h('div', { style: { width: ((position + 1) / CASES.length * 100) + '%' } })),
        h('div', { className: 'fin-wizard-card' },
          h('div', { className: 'fin-wizard-card-head' },
            h('span', { className: 'fin-kicker' }, '问题 ' + (position + 1) + ' / ' + CASES.length),
            h(Chip, { tone: 'amber' }, statusFor(props.item, props.decisions))),
          h(DetailIntro, { item: props.item }),
          h('div', { className: 'fin-wizard-story' },
            h('div', { className: 'fin-story-line' }, h('span', null, '01'), h('strong', null, '先前记录'), h('small', null, '来自你的输入')),
            h(EvidenceCard, { item: props.item, kind: 'manual' }),
            h('div', { className: 'fin-story-connector' }, '↓ 后续导入'),
            h('div', { className: 'fin-story-line' }, h('span', null, '02'), h('strong', null, '新到来源'), h('small', null, '保留原始位置')),
            h(EvidenceCard, { item: props.item, kind: 'source' })),
          h('div', { className: 'fin-wizard-decision' }, h(Impact, { option: props.option }), h(Choices, props))),
        h('div', { className: 'fin-wizard-pager' },
          h('button', { disabled: position === 0, onClick: () => props.onSelect(CASES[position - 1].id) }, '← 上一项'),
          h('span', null, '已处理 ' + props.totals.resolved + ' / 4'),
          h('button', { disabled: position === CASES.length - 1, onClick: () => props.onSelect(CASES[position + 1].id) }, '下一项 →')))
    }
    function VariantC(props) {
      return h('div', { className: 'fin-variant-c' },
        h('div', { className: 'fin-ledger-heading' },
          h('div', null, h('span', { className: 'fin-kicker' }, 'LEDGER FIRST'), h('h2', null, '账目与来源一起看'), h('p', null, '以已记账目为主线，打开右侧检查区处理新来源。')),
          h(Chip, { tone: 'light' }, '本批新增 0 笔重复消费')),
        h('div', { className: 'fin-ledger-shell' },
          h('div', { className: 'fin-ledger-main' },
            h('div', { className: 'fin-ledger-toolbar' }, h('strong', null, '已记录账目'), h('span', null, '9 月 · 个人账本'), h('button', { onClick: props.onShowLedger }, '打开完整账目 ↗')),
            h('div', { className: 'fin-ledger-table-head' }, h('span', null, '账目 / 来源'), h('span', null, '处理状态'), h('span', null, '已确认消费')),
            CASES.map((item) => h('button', {
              key: item.id, className: classes('fin-ledger-row', props.item.id === item.id && 'selected'), onClick: () => props.onSelect(item.id),
            },
            h('div', { className: 'fin-ledger-name' },
              h('span', { className: 'fin-ledger-dot' }),
              h('span', null, h('strong', null, item.place), h('small', null, item.date + ' · 自然语言 + 银行来源'))),
            h('span', { className: classes('fin-ledger-state', statusFor(item, props.decisions) === '已处理' && 'done') }, statusFor(item, props.decisions)),
            h('b', { className: 'fin-ledger-money' }, minorMoney(item.businessAmountMinor + (item.id === 'conflict' && props.decisions.conflict === 'correct30' ? -500 : 0))))),
            h('div', { className: 'fin-ledger-footer' }, '已确认消费 ' + yuan(props.totals.expense) + ' · 银行扣款 ' + yuan(props.totals.bank) + ' · 待匹配 ' + yuan(props.totals.unmatched))),
          h('aside', { className: 'fin-ledger-drawer' },
            h('div', { className: 'fin-drawer-head' }, h('span', null, '账目检查区'), h(Chip, { tone: 'amber' }, props.item.kind)),
            h(DetailIntro, { item: props.item }),
            h('div', { className: 'fin-drawer-sources' }, h(EvidenceCard, { item: props.item, kind: 'manual' }), h(EvidenceCard, { item: props.item, kind: 'source' })),
            h(Impact, { option: props.option }),
            h(Choices, props))))
    }
    function LedgerView(props) {
      return h('div', { className: 'fin-ledger-page' },
        h('div', { className: 'fin-workspace-heading' },
          h('div', null, h('span', { className: 'fin-kicker' }, 'PERSONAL LEDGER'), h('h2', null, '日常账目'), h('p', null, '来源可追溯；候选关系不会改变已确认金额。')),
          h('button', { className: 'fin-outline-btn', onClick: () => props.onView('review') }, '返回导入核对 →')),
        h('div', { className: 'fin-ledger-full' },
          h('div', { className: 'fin-ledger-table-head' }, h('span', null, '日期与账目'), h('span', null, '来源与核对'), h('span', null, '已确认消费')),
          CASES.map((item) => h('button', { key: item.id, className: 'fin-ledger-row', onClick: () => { props.onSelect(item.id); props.onView('review') } },
            h('div', { className: 'fin-ledger-name' }, h('span', { className: 'fin-ledger-dot' }), h('span', null, h('strong', null, item.place), h('small', null, item.date + ' · ' + item.manual))),
            h('span', { className: 'fin-ledger-state' }, statusFor(item, props.decisions) + ' · 查看来源'),
            h('b', { className: 'fin-ledger-money' }, minorMoney(item.businessAmountMinor + (item.id === 'conflict' && props.decisions.conflict === 'correct30' ? -500 : 0)))))))
    }
    function PrototypeSwitcher(props) {
      const index = VARIANTS.findIndex((item) => item.key === props.variant)
      return h('div', { className: 'fin-switcher', 'data-finance-prototype-switcher': 'true' },
        h('span', { className: 'fin-switcher-label' }, '布局比较'),
        h('button', { 'aria-label': '上一个布局', onClick: () => props.onCycle(-1) }, '←'),
        h('strong', null, props.variant + ' · ' + VARIANTS[index].name),
        h('button', { 'aria-label': '下一个布局', onClick: () => props.onCycle(1) }, '→'),
        h('small', null, '← / → 可切换'))
    }
    function AssistantDock(props) {
      const [draft, setDraft] = React.useState('')
      const [copied, setCopied] = React.useState(false)
      const [messages, setMessages] = React.useState([
        { role: 'assistant', text: '我会围绕当前账目和来源解释疑点。这里是合成示意，正式金额由核心规则决定。' },
      ])
      const listRef = React.useRef(null)
      React.useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
      }, [messages])
      React.useEffect(() => { setCopied(false) }, [props.item.id])
      const answerFor = (item) => {
        if (item.id === 'lunch') return '三份资料可能描述同一笔午饭：手记确认消费 ¥35，银行确认扣款 ¥35，微信明细补充渠道证据。确认同笔后，消费与银行金额都不再增加。'
        if (item.id === 'sameamount') return '同金额不能单独证明同笔。请核对文具店商户、16:42 的交易时间和订单信息；不要把午饭 35 元误合并进来。'
        if (item.id === 'partial') return '聚餐消费 ¥100 和银行扣款 ¥60 各自已确认。若把 60 元分配给这笔消费，还剩 40 元待匹配；不能补造现金付款。'
        return '手记消费 ¥35 与银行扣款 ¥30 存在差异。可只匹配 30 元并留下 5 元待说明；若明确更正消费为 30 元，消费汇总会减少 5 元。'
      }
      function send(text) {
        const input = text.trim()
        if (!input) return
        setMessages((previous) => [
          ...previous,
          { role: 'user', text: input },
          { role: 'assistant', text: answerFor(props.item) },
        ])
        setDraft('')
      }
      function contextPrompt() {
        return '[DSH Finance 核对项 ' + props.item.id + '] 请帮我核对个人账本中的“' + props.item.title + '”。已有账目：' + props.item.manual + '。新来源：' + props.item.source + '，' + props.item.sourceMeta + '。当前工作台' + (props.decided ? '已选择' : '正在预览') + '“' + props.option.label + '”，消费变化 ' + delta(props.option.expense) + '，账户变化 ' + delta(props.option.bank) + '；此选择仅在原型内存中，尚非正式账务。如需核验合成事实，请先调用只读工具 finance_review_case，参数 case_id 为 ' + props.item.id + '；请区分已确认事实与候选关系，解释金额影响，不直接确认入账。'
      }
      async function copyContext() {
        try {
          await navigator.clipboard.writeText(contextPrompt())
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }
      return h('aside', { className: 'fin-assistant', 'data-finance-assistant': 'open' },
        h('div', { className: 'fin-assistant-head' },
          h('div', { className: 'fin-assistant-avatar' }, '✦'),
          h('div', null, h('strong', null, '财务助理'), h('small', null, '围绕当前核对项协作')),
          h('button', { 'aria-label': '关闭财务助理', onClick: props.onClose }, '×')),
        h('div', { className: 'fin-assistant-caveat' }, '示意对话 · 合成回复，尚未接通真实 Agent'),
        h('div', { className: 'fin-assistant-context' },
          h('small', null, '当前讨论'),
          h('strong', null, props.item.title),
          h('span', null, '已有：' + props.item.manual),
          h('span', null, '导入：' + props.item.source + ' · ' + props.item.sourceMeta),
          h('span', { className: 'fin-assistant-effect' }, '当前预览：' + props.option.label + ' · 消费 ' + delta(props.option.expense) + '，账户 ' + delta(props.option.bank))),
        h('div', { className: 'fin-assistant-messages', ref: listRef },
          messages.map((message, index) => h('div', {
            key: index, className: classes('fin-chat-message', message.role === 'user' && 'user'),
          }, h('small', null, message.role === 'user' ? '你' : '助理 · 原型示意'), h('p', null, message.text)))),
        h('div', { className: 'fin-assistant-bottom' },
          h('div', { className: 'fin-chat-suggestions' },
            h('button', { onClick: () => send('为什么这条可能重复？') }, '为什么可能重复？'),
            h('button', { onClick: () => send('确认后金额怎样变化？') }, '金额会怎样变？')),
          h('div', { className: 'fin-chat-composer' },
            h('textarea', {
              value: draft,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(draft) } },
              placeholder: '就当前账目提问…',
              rows: 2,
            }),
            h('button', { 'aria-label': '发送示意提问', onClick: () => send(draft) }, '↗')),
          h('div', { className: 'fin-native-chat' },
            h('button', { onClick: copyContext }, copied ? '✓ 已复制问题摘要' : '复制问题摘要'),
            h('button', { onClick: () => props.onNativeChat(contextPrompt()) }, '带入 DSH 对话 ↗'))))
    }


    function App(props) {
      const [variant, setVariant] = React.useState(() => prototypeMemory.variant || variantFromUrl())
      const [view, setView] = React.useState(() => prototypeMemory.view || 'review')
      const [selected, setSelected] = React.useState(() => prototypeMemory.selected || CASES[0].id)
      const [choice, setChoice] = React.useState(() => prototypeMemory.choice || CASES[0].options[0].key)
      const [decisions, setDecisions] = React.useState(() => prototypeMemory.decisions || {})
      const [filter, setFilter] = React.useState(() => prototypeMemory.filter || 'all')
      const [toast, setToast] = React.useState('')
      const [assistantOpen, setAssistantOpen] = React.useState(() => prototypeMemory.assistantOpen ?? window.innerWidth >= 1280)
      React.useEffect(() => { Object.assign(prototypeMemory, { variant, view, selected, choice, decisions, filter, assistantOpen }) }, [variant, view, selected, choice, decisions, filter, assistantOpen])
      const item = CASE_BY_ID[selected] || CASES[0]
      const option = item.options.find((candidate) => candidate.key === choice) || item.options[0]
      const totals = totalsFor(decisions)
      const items = filter === 'wechat' ? [CASES[0]] : CASES
      const showSwitcher = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
      function selectCase(id) {
        const next = CASE_BY_ID[id]
        if (!next) return
        setSelected(id)
        setChoice(decisions[id] || next.options[0].key)
      }
      function changeVariant(key) {
        const next = VARIANTS.find((candidate) => candidate.key === key)
        if (!next) return
        const url = new URL(window.location.href)
        url.searchParams.set('variant', key)
        window.history.replaceState(null, '', url)
        setVariant(key)
      }
      function cycle(direction) {
        const index = VARIANTS.findIndex((candidate) => candidate.key === variant)
        changeVariant(VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length].key)
      }
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          const target = event.target
          if (target && ((typeof target.matches === 'function' && target.matches('input, textarea, select')) || target.isContentEditable)) return
          event.preventDefault()
          cycle(event.key === 'ArrowRight' ? 1 : -1)
        }
        const onPop = () => setVariant(variantFromUrl())
        window.addEventListener('keydown', onKey)
        window.addEventListener('popstate', onPop)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop) }
      }, [variant])
      React.useEffect(() => {
        if (!toast) return
        const timer = setTimeout(() => setToast(''), 3600)
        return () => clearTimeout(timer)
      }, [toast])
      function apply() {
        setDecisions((previous) => ({ ...previous, [item.id]: option.key }))
        setToast('已保存处理结果 · ' + option.label + '。来源和操作记录仍可追溯。')
      }
      function undo() {
        setDecisions((previous) => { const copy = { ...previous }; delete copy[item.id]; return copy })
        setToast('已撤销原型中的处理选择。')
      }
      function reset() {
        setDecisions({})
        setSelected(CASES[0].id)
        setChoice(CASES[0].options[0].key)
        setFilter('all')
        setView('review')
        setToast('已重新载入两份合成资料；没有修改真实账本。')
      }
      const context = {
        item, option, choice, decisions, totals, items,
        onChoice: setChoice, onSelect: selectCase, onApply: apply, onUndo: undo,
        onShowLedger: () => setView('ledger'), decided: Boolean(decisions[item.id]),
      }
      return h('div', { className: classes('fin-prototype', assistantOpen && 'fin-assistant-open'), 'data-finance-prototype-variant': variant },
        h(Header, { view, onView: setView, onReset: reset, assistantOpen, onToggleAssistant: () => setAssistantOpen((open) => !open) }),
        h('div', { className: 'fin-page' },
          h('div', { className: 'fin-proto-banner' },
            h('span', null, h('b', null, '交互原型'), ' · 合成数据，仅用于选择信息结构'),
            h('button', { onClick: reset }, '模拟重新导入 ↻')),
          view === 'ledger' ?
            h(React.Fragment, null,
              h(Stats, { totals }),
              h(LedgerView, { totals, decisions, onView: setView, onSelect: selectCase })) :
          variant === 'A' ?
            h(React.Fragment, null,
              h(Stats, { totals }),
              h(FileStrip, { filter, onFilter: (next) => { setFilter(next); if (next === 'wechat') selectCase('lunch') } }),
              h(VariantA, context)) :
          variant === 'B' ?
            h(React.Fragment, null,
              h('div', { className: 'fin-wizard-context' },
                h('span', null, '资料 2 份 · 本批待处理 ' + totals.remaining + ' 项'),
                h('span', null, '已确认消费 ' + yuan(totals.expense)),
                h('span', null, '账户扣款 ' + yuan(totals.bank))),
              h(VariantB, context)) :
            h(React.Fragment, null,
              h(Stats, { totals }),
              h(VariantC, context))),
        assistantOpen && h(AssistantDock, { item, option, decided: Boolean(decisions[item.id]), onClose: () => setAssistantOpen(false), onNativeChat: props.onOpenDshChat }),
        toast && h('div', { className: 'fin-toast', role: 'status' }, '✓  ' + toast),
        showSwitcher && h(PrototypeSwitcher, { variant, onCycle: cycle }))
    }
    return {
      name: 'finance-import-review-prototype-client',
      inject: ['slots', 'layout', 'sessions', 'workspaces', 'uiWorkspace', 'conversation'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-finance-prototype-style', '')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove())
        let financeSessionId
        async function openFinanceConversation(prompt) {
          try {
            const workspace = await ctx.workspaces.create({ path: PROTOTYPE_WORKSPACE_PATH })
            const sessionId = financeSessionId || await ctx.sessions.create({ workspaceId: workspace.workspaceId })
            financeSessionId = sessionId
            ctx.uiWorkspace.openSession(sessionId)
            for (let attempt = 0; attempt < 80; attempt++) {
              const scope = ctx.sessions.scope(sessionId)
              const editor = document.querySelector('[data-composer-input]')
              if (scope && editor) {
                try {
                  const input = ctx.conversation.input.for(scope)
                  const existing = input.state.getSnapshot().draft
                  if (existing && existing.trim() && existing !== prompt) {
                    input.notify('info', '已有未发送草稿，财务摘要未覆盖；请先处理现有内容。')
                    document.documentElement.setAttribute('data-finance-handoff', 'existing-draft')
                    return
                  }
                  input.setDraft(prompt)
                  await new Promise((resolve) => setTimeout(resolve, 120))
                  const visible = document.querySelector('[data-composer-input]')?.textContent || ''
                  const stored = input.state.getSnapshot().draft || ''
                  document.documentElement.setAttribute('data-finance-handoff-state-length', String(stored.length))
                  document.documentElement.setAttribute('data-finance-handoff-visible-length', String(visible.length))
                  if (visible.includes('DSH Finance 核对项')) {
                    input.focus()
                    document.documentElement.setAttribute('data-finance-handoff', 'draft-ready')
                    return
                  }
                } catch {
                  // A Session scope can exist before its composer input is mounted.
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 100))
            }
            throw new Error('DSH conversation input did not become ready')
          } catch (error) {
            document.documentElement.setAttribute('data-finance-handoff', 'failed')
            ctx.layout.selectPanel('finance-import-prototype')
            console.warn('[finance-prototype] context handoff failed', error)
          }
        }
        const FinancePanel = () => h(App, { onOpenDshChat: openFinanceConversation })
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'finance-import-prototype' }, FinancePanel))
        const FinanceSidebarIcon = (props) => h('span', {
          style: { display: 'inline-block', fontSize: (props.size || 16) + 'px', fontWeight: 800, lineHeight: 1 },
        }, '¥')
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'finance-import-prototype',
          order: 15,
          label: () => '财务工作台',
        }, FinanceSidebarIcon))
        let attempts = 0
        const open = () => {
          try { ctx.layout.selectPanel('finance-import-prototype') }
          catch (error) { if (attempts++ < 20) setTimeout(open, 100) }
        }
        setTimeout(open, 1800)
      },
    }
  },
})
