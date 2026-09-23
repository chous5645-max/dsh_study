# Isolated DSH integration smoke test

Run the Windows script run-smoke.ps1 with -DshSource set to the absolute path of a pinned official deepseek-harness checkout. Node.js, Chrome, dependencies and built bundles are required. The script starts the Web profile with a Host core plugin and a Host/UI client package; checks their shared synthetic result, model-visible tool schema and execution, Host Gateway dispatch, browser-to-Host Connection RPC, authenticated Web boot page, and actual browser-side client execution and a minimal main Slot diagnostic panel through Chrome DevTools; then stops the processes it started.

The basic `run-smoke.ps1` check involves no LLM call, finance UI component, generated typed Remote client, or real financial data. The generated .runtime directory contains a temporary DSH home and raw logs; it is ignored and must not be shared because the Web URL carries a token.


Run twice with the same isolated DSH_HOME to observe Plugin store reused change from False to True. This is a smoke check for plugin-owned state across process restarts, not a ledger implementation or chat-deletion test.



Run run-core-only.ps1 with the same -DshSource parameter to verify that the core tool and Gateway remain queryable when the finance UI package is not loaded.

Run `run-strict-remote.ps1` from this directory (or from the repository root with its full relative path) to check strict Typert generation for a synthetic `financeSummary/summary` contract. It uses the pinned DSH generator and its official test declaration fixture to build an isolated TypeScript workspace under the ignored `.runtime` directory. The check asserts that Host and Client artifacts, the typed Client namespace, and request/result codecs are generated; malformed values must fail codec validation. It does not install the generated contribution in DSH, mount it through `ctx.remote`, or call it from the browser. Those runtime integration steps remain open.

Run `run-strict-runtime.ps1` to start a separate isolated DSH Web instance on an OS-assigned port, register the generated strict Host descriptor with a synthetic finance service, and invoke it through the Host Gateway. The script also loads the generated Client contribution in a Node DSH Client Remote context, then calls `ctx.remote.financeSummary.summary(...)` through the authenticated DSH Connection RPC. It checks that a malformed request is rejected by the Host. The script stops the DSH process it starts. Pass `-RequireBrowser` to additionally require the real browser Client bundle check; that check depends on local headless Chrome and is not part of the default pass. The strict contribution is registered manually in this experiment, so external package build/Loader integration is still unverified.
