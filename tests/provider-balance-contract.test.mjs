// Contract tests for the provider account-balance feature (2026-11-25).
//
// Covers three layers:
//   1. src/modules/provider-balance.mjs — the pure half: profile resolution,
//      request building, response normalization, threshold verdict, formatting.
//   2. Wiring — app.mjs owns fetch/persist/guard; the send path and the other
//      paid call sites consult the guard; settings carry off-by-default knobs.
//   3. UI — ApiConfig.vue renders one row per queried provider and the
//      threshold controls, without reintroducing semantic-colour blocks.
//
// See documents/API余额与额度池方案.md for the feasibility survey (which
// endpoints answer with CORS enabled, which providers have no balance API).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    BALANCE_STALE_MS,
    buildBalanceRequests,
    evaluateBalanceGuard,
    formatBalance,
    formatBalanceAmount,
    isBalanceStale,
    parseBalanceResponses,
    parseDeepSeekBalance,
    parseMoonshotBalance,
    parseOpenRouterKey,
    parseRelayBilling,
    parseSiliconFlowUserInfo,
    resolveBalanceProfile
} from '../src/modules/provider-balance.mjs';

const [app, sender, templatePipeline, apiConfigHtml, settingsState, apiConfigComposable, storageRepo] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useUiTemplatePipeline.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/ApiConfig.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useApiConfig.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/storage-repository.mjs', import.meta.url), 'utf8')
]);

// --- 1. Pure module: profile resolution ---

test('resolveBalanceProfile matches providers by host, not by catalogue id', () => {
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://api.deepseek.com/v1' }).kind, 'deepseek');
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://api.moonshot.cn/v1' }).kind, 'moonshot');
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://openrouter.ai/api/v1' }).kind, 'openrouter');
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://api.siliconflow.cn/v1' }).kind, 'siliconflow');
    // A relay station is recognised by its host so the billing routes are used.
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://cdn.sta1n.cn/v1' }).kind, 'relay');
});

test('a custom provider pointed at a known host still resolves a profile', () => {
    // This is the whole reason matching is host-based: users configure their
    // own relay/base URL under "自定义", and it must still be queryable.
    const profile = resolveBalanceProfile({ apiUrl: 'https://api.deepseek.com' });
    assert.equal(profile.kind, 'deepseek');
    assert.equal(profile.currency, 'CNY');
});

test('unknown hosts resolve to null instead of guessing an endpoint', () => {
    // Sending a key to a guessed endpoint would leak the credential to a host
    // the user never configured, so unsupported must stay unsupported.
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://api.zhipu.example/v1' }), null);
    assert.equal(resolveBalanceProfile({ apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }), null);
    assert.equal(resolveBalanceProfile({ apiUrl: 'http://192.168.1.9:11434/v1' }), null);
    assert.equal(resolveBalanceProfile({ apiUrl: '' }), null);
    assert.equal(resolveBalanceProfile({}), null);
});

test('relay profiles strip the version segment before billing routes', () => {
    const profile = resolveBalanceProfile({ apiUrl: 'https://cdn.sta1n.cn/v1' });
    assert.equal(profile.rootUrl, 'https://cdn.sta1n.cn', 'rootUrl drops /v1');
    assert.equal(profile.baseUrl, 'https://cdn.sta1n.cn/v1', 'baseUrl keeps it');
    const requests = buildBalanceRequests(profile, 'sk-test');
    assert.equal(requests.length, 2, 'relays need subscription + usage');
    assert.ok(requests[0].url.endsWith('/dashboard/billing/subscription'));
    assert.match(requests[1].url, /\/dashboard\/billing\/usage\?start_date=\d{4}-\d{2}-\d{2}&end_date=\d{4}-\d{2}-\d{2}/);
    assert.equal(requests[0].headers.Authorization, 'Bearer sk-test');
});

test('each provider builds its documented balance request', () => {
    const url = (apiUrl) => buildBalanceRequests(resolveBalanceProfile({ apiUrl }), 'k')[0].url;
    // DeepSeek answers on the bare host, not under /v1.
    assert.equal(url('https://api.deepseek.com/v1'), 'https://api.deepseek.com/user/balance');
    // Moonshot / OpenRouter / SiliconFlow keep the versioned base.
    assert.equal(url('https://api.moonshot.cn/v1'), 'https://api.moonshot.cn/v1/users/me/balance');
    // OpenRouter's /credits needs a management key; /key works with a normal key.
    assert.equal(url('https://openrouter.ai/api/v1'), 'https://openrouter.ai/api/v1/key');
    assert.equal(url('https://api.siliconflow.cn/v1'), 'https://api.siliconflow.cn/v1/user/info');
    assert.deepEqual(buildBalanceRequests(null, 'k'), []);
});

// --- 1. Pure module: response normalization ---

test('parseDeepSeekBalance reads the balance_infos array and is_available', () => {
    const parsed = parseDeepSeekBalance({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }]
    });
    assert.equal(parsed.amount, 110);
    assert.equal(parsed.currency, 'CNY');
    assert.equal(parsed.granted, 10);
    assert.equal(parsed.toppedUp, 100);
    assert.equal(parsed.available, true);
    // Amounts arrive as strings; a non-numeric one must not become NaN.
    assert.equal(parseDeepSeekBalance({ balance_infos: [{ total_balance: 'oops' }] }).amount, null);
    assert.equal(parseDeepSeekBalance({}).amount, null);
});

test('parseDeepSeekBalance honours an unavailable account', () => {
    const parsed = parseDeepSeekBalance({
        is_available: false,
        balance_infos: [{ currency: 'USD', total_balance: '0.00' }]
    });
    assert.equal(parsed.available, false);
    assert.equal(parsed.currency, 'USD');
});

test('parseMoonshotBalance exposes available/voucher/cash', () => {
    const parsed = parseMoonshotBalance({
        code: 0,
        data: { available_balance: 49.58894, voucher_balance: 46.58893, cash_balance: 3.00001 }
    });
    assert.equal(parsed.amount, 49.58894);
    assert.equal(parsed.voucher, 46.58893);
    assert.equal(parsed.cash, 3.00001);
});

test('parseOpenRouterKey distinguishes an uncapped key from a capped one', () => {
    const capped = parseOpenRouterKey({ data: { limit: 100, limit_remaining: 74.25, usage: 25.75 } });
    assert.equal(capped.amount, 74.25);
    assert.equal(capped.limit, 100);
    assert.equal(capped.used, 25.75);
    assert.equal(capped.unlimited, false);
    // limit:null means spend draws on credits — no remaining figure exists.
    const uncapped = parseOpenRouterKey({ data: { limit: null, usage: 3.5 } });
    assert.equal(uncapped.unlimited, true);
    assert.equal(uncapped.amount, null);
});

test('parseSiliconFlowUserInfo tolerates alternative field names', () => {
    // The success shape is unverified against a real key, so the parser accepts
    // the three field names SiliconFlow has used.
    assert.equal(parseSiliconFlowUserInfo({ data: { totalBalance: '12.5' } }).amount, 12.5);
    assert.equal(parseSiliconFlowUserInfo({ data: { balance: '7' } }).amount, 7);
    assert.equal(parseSiliconFlowUserInfo({ data: { chargeBalance: '1.25' } }).amount, 1.25);
    assert.equal(parseSiliconFlowUserInfo({}).amount, null);
});

test('parseRelayBilling converts cents and treats huge limits as unlimited', () => {
    const normal = parseRelayBilling({ hard_limit_usd: 100 }, { total_usage: 2500 });
    assert.equal(normal.used, 25, 'total_usage is in cents');
    assert.equal(normal.amount, 75);
    assert.equal(normal.currency, 'USD');
    // new-api uses a very large hard_limit_usd as the "no limit" sentinel.
    const unlimited = parseRelayBilling({ hard_limit_usd: 1000000 }, { total_usage: 100 });
    assert.equal(unlimited.unlimited, true);
    assert.equal(unlimited.amount, null);
    // Never report a negative remainder.
    assert.equal(parseRelayBilling({ hard_limit_usd: 1 }, { total_usage: 500 }).amount, 0);
});

test('parseBalanceResponses dispatches on the profile kind', () => {
    assert.equal(parseBalanceResponses('moonshot', { primary: { data: { available_balance: 5 } } }).amount, 5);
    assert.equal(parseBalanceResponses('deepseek', { primary: { balance_infos: [{ total_balance: '3' }] } }).amount, 3);
    assert.equal(parseBalanceResponses('relay', {
        subscription: { hard_limit_usd: 10 },
        usage: { total_usage: 100 }
    }).amount, 9);
    // Unknown kinds degrade to an empty reading rather than throwing.
    assert.equal(parseBalanceResponses('nope', {}).amount, null);
});

// --- 1. Pure module: verdict + formatting ---

test('evaluateBalanceGuard is inert when the mode is off (the default)', () => {
    assert.equal(evaluateBalanceGuard({ amount: 0.01, mode: 'off' }).state, 'off');
    assert.equal(evaluateBalanceGuard({ amount: 0.01 }).state, 'off', 'off is the default mode');
    // A missing/garbage amount must not be read as "broke".
    assert.equal(evaluateBalanceGuard({ amount: null, mode: 'block' }).state, 'unknown');
    assert.equal(evaluateBalanceGuard({ amount: 'abc', mode: 'warn' }).state, 'unknown');
});

test('evaluateBalanceGuard separates warn from block thresholds', () => {
    const base = { mode: 'block', warnBelow: 10, blockBelow: 2 };
    assert.equal(evaluateBalanceGuard({ ...base, amount: 50 }).state, 'ok');
    assert.equal(evaluateBalanceGuard({ ...base, amount: 5 }).state, 'warn');
    assert.equal(evaluateBalanceGuard({ ...base, amount: 2 }).state, 'blocked');
    assert.equal(evaluateBalanceGuard({ ...base, amount: 0 }).state, 'blocked');
    // 'warn' mode never blocks, no matter how low the balance.
    assert.equal(evaluateBalanceGuard({ amount: 0, mode: 'warn', warnBelow: 10, blockBelow: 2 }).state, 'warn');
});

test('isBalanceStale refuses to trust old readings', () => {
    const now = Date.now();
    assert.equal(isBalanceStale({ fetchedAt: now - 1000 }, now), false);
    assert.equal(isBalanceStale({ fetchedAt: now - BALANCE_STALE_MS - 1 }, now), true);
    assert.equal(isBalanceStale({}, now), true);
    assert.equal(isBalanceStale(null, now), true);
});

test('formatBalance renders each status without inventing numbers', () => {
    assert.equal(formatBalanceAmount(12.4, 'CNY'), '¥12.40');
    assert.equal(formatBalanceAmount(3.1, 'USD'), '$3.10');
    assert.equal(formatBalanceAmount(-0.0001, 'USD'), '$0.00', 'no -0.00');
    assert.equal(formatBalance({ status: 'ok', amount: 12.4, currency: 'CNY' }), '¥12.40');
    assert.equal(formatBalance({ status: 'ok', unlimited: true }), '不限');
    assert.equal(formatBalance({ status: 'unsupported' }), '不支持查询');
    assert.equal(formatBalance({ status: 'error' }), '查询失败');
    assert.equal(formatBalance({ status: 'no-key' }), '未配置密钥');
    assert.equal(formatBalance({ status: 'exhausted' }), '余额不足');
    assert.equal(formatBalance(null), '—');
    // A failed refresh keeps the previous reading, `unlimited` included — the
    // failure must win over the stale flag or the row claims a reachable "不限".
    assert.equal(formatBalance({ status: 'error', unlimited: true }), '查询失败');
    assert.equal(formatBalance({ status: 'ok', unlimited: true }), '不限');
});

// --- 2. Wiring: state, persistence, orchestration ---

test('the balance display state lives in useApiConfig like the other status refs', () => {
    assert.ok(apiConfigComposable.includes('const providerBalances = reactive({});'));
    assert.ok(apiConfigComposable.includes('const balancesLoading = ref(false);'));
    assert.ok(apiConfigComposable.includes('providerBalances,\n        balancesLoading,'),
        'both are returned from the composable');
    // The composable holds state only — I/O stays in app.mjs (pattern contract).
    assert.ok(!apiConfigComposable.includes('fetch('), 'no network calls in the composable');
});

test('settings carry off-by-default guard knobs', () => {
    assert.ok(settingsState.includes("export const BALANCE_GUARD_MODES = Object.freeze(['off', 'warn', 'block']);"));
    assert.ok(settingsState.includes("balanceGuardMode: 'off'"),
        'the guard must default to off — a stale balance must not block sends');
    assert.ok(settingsState.includes('providerBalanceQueryEnabled: true'));
    assert.ok(settingsState.includes('balanceWarnBelow: BALANCE_GUARD_CARD_DEFAULTS.balanceWarnBelow'));
    assert.ok(settingsState.includes('balanceBlockBelow: BALANCE_GUARD_CARD_DEFAULTS.balanceBlockBelow'));
});

test('app.mjs owns balance fetch, persistence and the guard decision', () => {
    assert.ok(app.includes('const BALANCE_STORAGE_KEY = \'provider_balances\';'));
    assert.ok(app.includes('const fetchProviderBalance = async (providerId, options = {}) => {'));
    assert.ok(app.includes('const refreshAllProviderBalances = async (options = {}) => {'));
    assert.ok(app.includes('const confirmBalanceAllowsRequest = async (providerId, label = \'当前供应商\') => {'));
    // Failures keep the previous reading and flip status instead of blanking.
    assert.match(app, /status: 'error',[\s\S]{0,200}fetchedAt: previous\.fetchedAt \|\| 0/);
    // Single-flight: a repeated tap must not stack requests.
    assert.ok(app.includes('if (balanceInflight.has(requestKey)) return balanceInflight.get(requestKey);'));
    // Startup: cached values paint first, refresh runs in the background.
    assert.ok(app.includes('await loadProviderBalances();'));
    assert.ok(app.includes('refreshAllProviderBalances().catch(error => console.error(\'Balance refresh failed:\', error));'));
});

test('the guard never awaits the network and skips tool continuations', () => {
    assert.ok(app.includes('// Cached verdict for one provider id. The guard deliberately returns'),
        'the cache-only contract is documented at the decision point');
    assert.ok(app.includes('if (!entry || entry.status !== \'ok\' || entry.unlimited || isBalanceStale(entry)) {'),
        'stale/unsupported/unlimited entries never produce a verdict');
    assert.ok(sender.includes('if (activeToolDepth === 0 && typeof confirmBalanceAllowsRequest === \'function\') {'),
        'a tool continuation is already paid for and must not re-prompt');
    assert.ok(sender.includes('const allowed = await confirmBalanceAllowsRequest(getChatProvider().providerId, \'聊天供应商\');'));
});

test('a block still asks once instead of refusing outright', () => {
    assert.match(app, /const proceed = await showVueConfirmModal\(\s*'余额低于阈值',/,
        'blocked sends go through one labelled confirm, not a hard refusal');
    assert.ok(app.includes("{ confirmLabel: '继续请求', cancelLabel: '取消' }"),
        'the confirm declares its own button labels');
});

test('every other paid call site consults the same guard', () => {
    // Memory summary (classic + v6 ledger batch) bills the memory provider.
    assert.ok(app.includes("confirmBalanceAllowsRequest(memoryProvider.providerId, '记忆供应商')"));
    // Vision recognition bills the chat provider and can cost more than a turn.
    assert.ok(app.includes("confirmBalanceAllowsRequest(provider.providerId, '识图供应商')"));
    // UI template analysis bills the chat provider.
    assert.ok(templatePipeline.includes("confirmBalanceAllowsRequest(chatProviderForAnalysis.providerId, '模板分析供应商')"));
});

test('insufficient balance is translated instead of surfacing raw provider text', () => {
    assert.ok(sender.includes('if (status === 402 || /insufficient|余额不足|quota exceeded|credit/i.test(String(detailText || \'\'))) {'));
    assert.ok(sender.includes("throw new Error('当前供应商余额不足，请充值后重试'"));
});

test('the cached balance payload is shape-checked by the storage repository', () => {
    assert.ok(storageRepo.includes("'rp_hub_provider_balances'"),
        'balances are an object-keyed record and get the same shape guard');
});

// --- 3. UI ---

test('ApiConfig.vue renders a balance row per queried provider', () => {
    assert.match(apiConfigHtml, /v-for="item in balanceRows" :key="item.id"/,
        'one row per provider with a cached entry');
    assert.ok(apiConfigHtml.includes('{{ item.label }} 余额'));
    assert.ok(apiConfigHtml.includes('{{ item.display }}'));
    // The row colour expresses the verdict, but the amount itself is the anchor.
    assert.match(apiConfigHtml, /item\.guardState === 'blocked' \? 'text-red-600'/);
});

test('the balance row detail explains the reading instead of guessing', () => {
    assert.ok(apiConfigHtml.includes("if (entry.status === 'unsupported') return '该供应商未开放余额查询';"));
    assert.ok(apiConfigHtml.includes("if (entry.status === 'error') return '查询失败，显示上次结果';"));
    assert.ok(apiConfigHtml.includes("if (entry.status === 'exhausted') return '供应商报告余额不足';"));
});

test('rows are driven by cached balances, not by the provider catalogue', () => {
    // The catalogue and the balance-capability table are independent lists: a
    // provider can be queryable without being a catalogue entry (Moonshot), and
    // a custom entry pointed at a known host resolves a profile under the
    // custom id. Iterating the cache keeps both cases visible; iterating the
    // catalogue silently dropped them.
    assert.ok(apiConfigHtml.includes('return Object.keys(balances).map(providerId => {'),
        'the row list comes from the cache keys');
    assert.ok(!apiConfigHtml.includes('balances[provider.id]'),
        'the catalogue-driven filter must not come back');
    // The label rides in the cache entry, with the catalogue name as fallback
    // for entries written before the label was stored.
    assert.ok(apiConfigHtml.includes("label: entry.label || ctx?.getProviderDisplayName?.(providerId) || providerId,"));
});

test('a cached entry carries what a refresh needs to survive a catalogue gap', () => {
    // label: renders a row for a provider the catalogue never listed.
    assert.match(app, /label: profile\.label,/);
    // apiUrl: refreshing such an id has no other way to recover its endpoint.
    assert.match(app, /apiUrl: connection\.apiUrl,/);
    assert.ok(app.includes("if (!apiUrl) apiUrl = String(providerBalances[id]?.apiUrl || '');"));
    // The refresh sweep must include cached ids, not just catalogue entries.
    assert.ok(app.includes('...Object.keys(providerBalances)'));
});

test('the threshold controls mirror the guard modes and default to off', () => {
    assert.ok(apiConfigHtml.includes("const balanceGuardModeOptions = ["));
    assert.ok(apiConfigHtml.includes("{ value: 'off', label: '关闭' }"));
    assert.ok(apiConfigHtml.includes("{ value: 'block', label: '提醒并拦截' }"));
    assert.ok(apiConfigHtml.includes('v-model.number="settings.balanceWarnBelow"'));
    assert.ok(apiConfigHtml.includes('v-model.number="settings.balanceBlockBelow"'));
    // Block threshold only matters in block mode.
    assert.ok(apiConfigHtml.includes("v-if=\"settings.balanceGuardMode === 'block'\""));
    assert.ok(apiConfigHtml.includes('const restoreBalanceGuardDefaults = () => {'));
});

test('the UI verdict reuses the pure guard instead of re-deriving thresholds', () => {
    // A second copy of the threshold maths would let the red row and the send
    // guard disagree on boundary values.
    assert.ok(apiConfigHtml.includes("import { formatBalance, evaluateBalanceGuard, isBalanceStale } from \"../../modules/provider-balance.mjs\";"));
    assert.match(apiConfigHtml, /const verdict = evaluateBalanceGuard\(\{/);
    assert.ok(!apiConfigHtml.includes('amount <= blockBelow'), 'no duplicated comparison logic');
});

test('the query toggle is honoured by the refresh path and hides stale rows', () => {
    assert.ok(apiConfigHtml.includes('v-model="settings.providerBalanceQueryEnabled"'));
    // Turning queries off must also remove the rows: a lingering old number
    // reads as a live balance.
    assert.ok(apiConfigHtml.includes('if (!ctx?.settings?.providerBalanceQueryEnabled) return [];'));
    assert.ok(app.includes('if (!options.silent) showToast(\'已在设置中关闭余额查询\', \'info\');'));
});

test('a stale reading says so instead of posing as live', () => {
    assert.ok(apiConfigHtml.includes('if (isBalanceStale(entry)) parts.push(\'数据已过期\');'));
});

test('every long explanation lives behind a help popover, not in the card body', () => {
    // Four settings in this card need a paragraph of context; printing them
    // inline made the card read as a wall of text. Each one now hides behind
    // the shared circled-question trigger (.settings-help-trigger).
    const section = apiConfigHtml.slice(
        apiConfigHtml.indexOf('<!-- 余额提醒与阈值守卫'),
        apiConfigHtml.indexOf('<!-- Generation Settings')
    );
    assert.ok(section.length > 0, 'the guard section exists');
    assert.equal((section.match(/class="settings-help-trigger"/g) || []).length, 4,
        'four triggers: query toggle, guard mode, warn threshold, block threshold');
    for (const topic of ['providerBalanceQuery', 'balanceGuard', 'balanceWarn', 'balanceBlock']) {
        assert.ok(section.includes(`settingsHelpTopic === '${topic}'`), `topic ${topic} is wired`);
    }
    // The long copy must not survive as a visible <p> in the card body.
    assert.ok(!section.includes('<p class="text-[10px] text-gray-400'),
        'no inline explanatory paragraphs remain');
    // Each trigger keeps its own aria-label so screen readers get the subject.
    assert.equal((section.match(/class="settings-help-trigger"/g) || []).length,
        (section.match(/aria-label="查看[^"]*说明"/g) || []).length,
        'every trigger is labelled');
});

test('the guard card only clips while collapsed, so popovers are not cut off', () => {
    // overflow-hidden is what makes the grid-rows collapse animation clean, but
    // an open card must release it or the help bubble is clipped at the card
    // edge (verified in the browser: popover 339-446 vs card 354-396).
    assert.ok(apiConfigHtml.includes(":class=\"['settings-subsection-card mt-1', balanceGuardOpen ? '' : 'overflow-hidden']\""),
        'outer card drops overflow-hidden when open');
    assert.ok(apiConfigHtml.includes(":class=\"['min-h-0', balanceGuardOpen ? '' : 'overflow-hidden']\""),
        'inner wrapper drops overflow-hidden when open');
});

// --- 聊天参数 compact layout (2026-11-25) ---
// The card was 473px tall on a 393px-wide phone for six sliders. Each slider
// needs a 44px touch target (accessibility floor, unchanged), so the win comes
// from removing the stacked label/number rows and collapsing the four
// low-frequency timeout sliders into a second-level accordion.

test('chat parameter rows put label, slider and value on one line', () => {
    // A single flex row per setting instead of a label row stacked above the
    // slider: that stack was the height cost.
    const chatSection = apiConfigHtml.slice(
        apiConfigHtml.indexOf('<!-- 聊天参数（温度 / 输出长度上限 / 网络超时） -->'),
        apiConfigHtml.indexOf('<!-- 余额提醒与阈值守卫')
    );
    assert.ok(chatSection.length > 0, 'the chat params section exists');
    assert.equal((chatSection.match(/flex items-center gap-2\.5 rounded-xl/g) || []).length, 2,
        'temperature and output-limit rows share the one-line layout');
    // The value badge moved from a bordered pill above the slider to a plain
    // right-aligned readout beside it.
    assert.ok(!chatSection.includes('bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100'),
        'the old stacked value pills are gone');
    assert.ok(chatSection.includes('w-9 flex-none text-right text-xs font-mono text-teal-600'),
        'values render right-aligned on the same line as the slider');
});

test('the four timeout sliders live in a nested accordion, closed by default', () => {
    // These are low-frequency settings; keeping them always-visible added ~190px.
    assert.ok(apiConfigHtml.includes('const timeoutsOpen = ref(false);'),
        'timeouts start collapsed');
    assert.ok(apiConfigHtml.includes('@click="timeoutsOpen = !timeoutsOpen"'));
    assert.ok(apiConfigHtml.includes("gridTemplateRows: timeoutsOpen ? '1fr' : '0fr'"));
    // The most-adjusted value stays readable while collapsed.
    assert.ok(apiConfigHtml.includes("v-if=\"!timeoutsOpen\""),
        'collapsed header still shows the first-token timeout');
});

test('the chat params card also releases its clip when open', () => {
    // Same popover-clipping fix as the balance card: the help bubbles sit
    // inside this card too.
    assert.ok(apiConfigHtml.includes(":class=\"['settings-subsection-card mt-1', chatParamsOpen ? '' : 'overflow-hidden']\""));
    assert.ok(apiConfigHtml.includes(":class=\"['min-h-0', chatParamsOpen ? '' : 'overflow-hidden']\""));
});

test('no explanatory paragraph remains inline in the chat params card', () => {
    const chatSection = apiConfigHtml.slice(
        apiConfigHtml.indexOf('<!-- 聊天参数（温度 / 输出长度上限 / 网络超时） -->'),
        apiConfigHtml.indexOf('<!-- 余额提醒与阈值守卫')
    );
    assert.ok(!chatSection.includes('<p class="text-[10px] text-gray-400'),
        'per-slider descriptions moved into the timeout popover');
    assert.equal((chatSection.match(/class="settings-help-trigger"/g) || []).length, 3,
        'temperature, output limit, and the timeout group each keep a trigger');
    // The popover builds its list from requestTimeoutItems, so the copy has a
    // single source rather than being duplicated in the template.
    assert.ok(chatSection.includes('v-for="item in requestTimeoutItems" :key="item.key" class="block"'),
        'the timeout popover renders its lines from the shared definitions');
});

test('the balance card keeps neutral surfaces (no semantic colour blocks)', () => {
    // AGENTS §2.7: semantic colour belongs on icons/text, never on a whole card,
    // because those classes have no dark-theme override.
    const guardSection = apiConfigHtml.slice(
        apiConfigHtml.indexOf('<!-- 余额提醒与阈值守卫'),
        apiConfigHtml.indexOf('<!-- Generation Settings')
    );
    assert.ok(guardSection.length > 0, 'the guard section exists');
    assert.ok(!/bg-(green|amber|red)-(50|100)/.test(guardSection),
        'no light semantic fills inside the guard card');
    assert.ok(guardSection.includes('bg-gray-50/60'), 'the card body uses the neutral surface');
});

test('the balance guard reuses the neutral model-setting-row shell', () => {
    assert.match(apiConfigHtml, /<div v-for="item in balanceRows" :key="item.id" class="model-setting-row">/,
        'rows share the existing status-row styling so dark mode needs no new rules');
});
