import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

const [url, runtimeDir, chromePath, mode] = process.argv.slice(2)
if (!url || !runtimeDir || !chromePath) throw new Error('URL, runtime directory and Chrome path are required')
const strictMode = mode === 'strict'
const profile = await mkdtemp(join(runtimeDir, 'chrome-cdp-'))
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', '--disable-gpu',
  '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore', windowsHide: true })

let socket
try {
  let port
  for (let i = 0; i < 80; i++) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0])
      if (Number.isInteger(port) && port > 0) break
    } catch {}
    await pause(100)
  }
  if (!port) throw new Error('Chrome DevTools port did not appear')
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  const page = pages.find((entry) => entry.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome page target missing')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    clearTimeout(entry.timeout)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout)
      entry.reject(new Error('Chrome DevTools socket closed'))
    }
    pending.clear()
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Chrome DevTools ' + method + ' timed out'))
    }, 10000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Page.navigate', { url })
  let executed = false
  let remoteReached = false
  let strictReached = false
  for (let i = 0; i < 80; i++) {
    const result = await call('Runtime.evaluate', {
      expression: 'document.documentElement.getAttribute("data-finance-smoke-client")',
      returnByValue: true,
    })
    const remote = await call('Runtime.evaluate', { expression: 'document.documentElement.getAttribute("data-finance-smoke-remote")', returnByValue: true })
    remoteReached = remote?.result?.value === 'ok'
    if (strictMode) {
      const strict = await call('Runtime.evaluate', { expression: 'document.documentElement.getAttribute("data-finance-strict-remote")', returnByValue: true })
      strictReached = strict?.result?.value === 'ok'
    }
    if (result?.result?.value === 'loaded' && remoteReached && (!strictMode || strictReached)) {
      executed = true
      break
    }
    await pause(250)
  }
  let panelRendered = false
  if (executed && remoteReached) {
    await call('Runtime.evaluate', {
      expression: 'window.__financeSmokeSelectPanel()',
      returnByValue: true,
    })
    for (let i = 0; i < 40; i++) {
      const panel = await call('Runtime.evaluate', {
        expression: 'document.querySelector("[data-finance-smoke-panel=rendered]") !== null',
        returnByValue: true,
      })
      if (panel?.result?.value === true) {
        panelRendered = true
        break
      }
      await pause(100)
    }
  }
  process.stdout.write('Browser rendered main slot panel: ' + panelRendered + '\n')
  process.stdout.write('Browser executed client module: ' + executed + '\n')
  process.stdout.write('Browser Remote returned core summary: ' + remoteReached + '\n')
  if (strictMode) process.stdout.write('Browser ctx.remote used generated contribution: ' + strictReached + '\n')
  if (!executed || !remoteReached || !panelRendered || (strictMode && !strictReached)) process.exitCode = 1
} catch (error) {
  process.stderr.write('Browser probe failed: ' + String(error.message).replace(/token=[^\s]+/g, 'token=[REDACTED]') + '\n')
  process.exitCode = 1
} finally {
  socket?.close()
  if (chrome.pid) spawnSync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
}
