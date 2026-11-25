// provider-balance — per-provider account balance lookup (2026-11-25)
//
// Pure module: no DOM, no network, no Vue. It owns three things:
//   1. Which providers expose a balance endpoint and how to call it
//      (buildBalanceRequests / resolveBalanceProfile);
//   2. How to normalize each provider's response into one shape
//      (parseBalanceResponses → { amount, currency, used, unlimited, ... });
//   3. The threshold verdict shared by the UI badge and the send-time guard
//      (evaluateBalanceGuard) plus the display formatter (formatBalance).
//
// Design notes (see documents/API余额与额度池方案.md):
// - Providers are matched by API host, not by catalogue id, so a custom
//   provider pointing at api.deepseek.com still gets DeepSeek's endpoint.
// - Unknown hosts are 'unsupported', never guessed: a wrong endpoint would
//   ship the user's key to a domain they never configured.
// - Relay stations (new-api / one-api) answer on /v1/dashboard/billing/*;
//   their usage figure is in cents, hence the /100 in the parser.
// - Every parser tolerates missing/garbage fields and returns null amounts
//   instead of throwing: a provider changing its response shape must degrade
//   to "查询失败", never to a crash inside the send path.

const KIND_DEEPSEEK = 'deepseek';
const KIND_MOONSHOT = 'moonshot';
const KIND_OPENROUTER = 'openrouter';
const KIND_SILICONFLOW = 'siliconflow';
const KIND_RELAY = 'relay';

// Host → profile. Matched against the URL hostname (lowercase, no port).
const HOST_RULES = [
    { pattern: /(^|\.)api\.deepseek\.com$/, kind: KIND_DEEPSEEK, currency: 'CNY', label: 'DeepSeek' },
    { pattern: /(^|\.)api\.moonshot\.cn$/, kind: KIND_MOONSHOT, currency: 'CNY', label: 'Moonshot' },
    { pattern: /(^|\.)openrouter\.ai$/, kind: KIND_OPENROUTER, currency: 'USD', label: 'OpenRouter' },
    { pattern: /(^|\.)api\.siliconflow\.cn$/, kind: KIND_SILICONFLOW, currency: 'CNY', label: 'SiliconFlow' },
    // STA1N is a new-api relay: same billing routes as OneAPI/NewAPI.
    { pattern: /(^|\.)sta1n\.cn$/, kind: KIND_RELAY, currency: 'USD', label: 'STA1N' }
];

// Relay hard limits above this are placeholders for "no limit" in new-api.
const RELAY_UNLIMITED_THRESHOLD = 100000;

const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const firstFinite = (...values) => {
    for (const value of values) {
        const number = toFiniteNumber(value);
        if (number !== null) return number;
    }
    return null;
};

// new-api exposes both `<host>/v1/...` and `<host>/api/...` roots depending on
// deployment. `baseUrl` is the provider's OpenAI-compatible base (…/v1), so the
// relay root is that base with the trailing version segment removed.
const stripVersionSuffix = (url) => String(url || '').replace(/\/+$/, '').replace(/\/v\d+$/i, '');

const getHostname = (url) => {
    try {
        return new URL(String(url || '')).hostname.toLowerCase();
    } catch (_) {
        return '';
    }
};

/**
 * Resolve the balance profile for a provider.
 * @param {{ providerId?: string, apiUrl?: string }} provider
 * @returns {{ kind: string, currency: string, label: string, baseUrl: string, rootUrl: string } | null}
 *   null means "this provider has no known balance endpoint" → UI hides the row.
 *   `baseUrl` keeps the versioned OpenAI base (Moonshot/OpenRouter/SiliconFlow
 *   put their account routes under /v1); `rootUrl` drops it (DeepSeek answers
 *   on the bare host, relays on <host>/dashboard).
 */const resolveBalanceProfile = (provider = {}) => {
    const apiUrl = String(provider?.apiUrl || '').trim();
    if (!apiUrl) return null;
    const hostname = getHostname(apiUrl);
    if (!hostname) return null;
    const rule = HOST_RULES.find(entry => entry.pattern.test(hostname));
    if (!rule) return null;
    return {
        kind: rule.kind,
        currency: rule.currency,
        label: rule.label,
        baseUrl: apiUrl.replace(/\/+$/, ''),
        rootUrl: stripVersionSuffix(apiUrl)
    };
};

/**
 * Build the HTTP requests needed to read one provider's balance.
 * Most providers need one GET; relays need subscription + usage.
 * The caller performs them (fetch / native) — this module stays network-free.
 */
const buildBalanceRequests = (profile, apiKey) => {
    if (!profile || !profile.baseUrl) return [];
    const headers = { Authorization: `Bearer ${String(apiKey || '')}` };
    const { baseUrl, rootUrl } = profile;
    switch (profile.kind) {
        case KIND_DEEPSEEK:
            // Account routes sit on the bare host, not under /v1.
            return [{ key: 'primary', url: `${rootUrl}/user/balance`, method: 'GET', headers }];
        case KIND_MOONSHOT:
            return [{ key: 'primary', url: `${baseUrl}/users/me/balance`, method: 'GET', headers }];
        case KIND_OPENROUTER:
            // /credits requires a management key; /key works with a normal sk-or
            // key and also reports the remaining limit.
            return [{ key: 'primary', url: `${baseUrl}/key`, method: 'GET', headers }];
        case KIND_SILICONFLOW:
            return [{ key: 'primary', url: `${baseUrl}/user/info`, method: 'GET', headers }];
        case KIND_RELAY: {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
            const end = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10);
            return [
                { key: 'subscription', url: `${rootUrl}/dashboard/billing/subscription`, method: 'GET', headers },
                {
                    key: 'usage',
                    url: `${rootUrl}/dashboard/billing/usage?start_date=${start}&end_date=${end}`,
                    method: 'GET',
                    headers
                }
            ];
        }
        default:
            return [];
    }
};

const parseDeepSeekBalance = (json) => {
    const infos = Array.isArray(json?.balance_infos) ? json.balance_infos : [];
    const balances = infos.map(info => ({
        currency: String(info?.currency || 'CNY').toUpperCase(),
        amount: toFiniteNumber(info?.total_balance),
        granted: toFiniteNumber(info?.granted_balance),
        toppedUp: toFiniteNumber(info?.topped_up_balance)
    })).filter(entry => entry.amount !== null);
    const primary = balances[0] || null;
    return {
        amount: primary ? primary.amount : null,
        currency: primary ? primary.currency : 'CNY',
        granted: primary ? primary.granted : null,
        toppedUp: primary ? primary.toppedUp : null,
        available: json?.is_available !== false,
        balances
    };
};

const parseMoonshotBalance = (json) => {
    const data = json?.data || {};
    return {
        amount: firstFinite(data.available_balance, data.cash_balance),
        currency: 'CNY',
        voucher: toFiniteNumber(data.voucher_balance),
        cash: toFiniteNumber(data.cash_balance)
    };
};

const parseOpenRouterKey = (json) => {
    const data = json?.data || {};
    const limit = toFiniteNumber(data.limit);
    const remaining = toFiniteNumber(data.limit_remaining);
    return {
        // A null limit means the key is not capped: spend draws on credits.
        unlimited: limit === null,
        amount: limit === null ? null : remaining,
        limit,
        used: toFiniteNumber(data.usage),
        currency: 'USD',
        isFreeTier: data.is_free_tier === true
    };
};

const parseSiliconFlowUserInfo = (json) => {
    const data = json?.data || {};
    return {
        amount: firstFinite(data.totalBalance, data.balance, data.chargeBalance),
        currency: 'CNY',
        charge: toFiniteNumber(data.chargeBalance),
        gift: toFiniteNumber(data.balance)
    };
};

const parseRelayBilling = (subscriptionJson, usageJson) => {
    const hardLimit = toFiniteNumber(subscriptionJson?.hard_limit_usd);
    // new-api reports usage in cents (100 = $1).
    const usedCents = toFiniteNumber(usageJson?.total_usage);
    const used = usedCents === null ? null : usedCents / 100;
    const unlimited = hardLimit !== null && hardLimit >= RELAY_UNLIMITED_THRESHOLD;
    return {
        unlimited,
        amount: hardLimit === null || unlimited ? null : Math.max(0, hardLimit - (used || 0)),
        limit: hardLimit,
        used,
        currency: 'USD'
    };
};

/**
 * Normalize raw responses into the single cached-entry payload shape.
 * @param {string} kind profile kind
 * @param {Record<string, any>} responses keyed by buildBalanceRequests().key
 */
const parseBalanceResponses = (kind, responses = {}) => {
    switch (kind) {
        case KIND_DEEPSEEK: return parseDeepSeekBalance(responses.primary);
        case KIND_MOONSHOT: return parseMoonshotBalance(responses.primary);
        case KIND_OPENROUTER: return parseOpenRouterKey(responses.primary);
        case KIND_SILICONFLOW: return parseSiliconFlowUserInfo(responses.primary);
        case KIND_RELAY: return parseRelayBilling(responses.subscription, responses.usage);
        default: return { amount: null, currency: 'CNY' };
    }
};

const CURRENCY_SYMBOLS = { CNY: '¥', USD: '$' };

const formatBalanceAmount = (amount, currency) => {
    const number = toFiniteNumber(amount);
    if (number === null) return '—';
    const symbol = CURRENCY_SYMBOLS[String(currency || 'CNY').toUpperCase()] || '';
    // Sub-cent balances are common on relays; keep two decimals but never
    // render "-0.00" for a tiny negative rounding artefact.
    const rounded = Math.abs(number) < 0.005 ? 0 : number;
    return `${symbol}${rounded.toFixed(2)}`;
};

const formatBalance = (entry) => {
    if (!entry) return '—';
    // Status checks come first: a failed refresh keeps the previous reading
    // (including `unlimited`), so testing unlimited first would mask the
    // failure and show a confident 「不限」 for a provider we could not reach.
    if (entry.status === 'unsupported') return '不支持查询';
    if (entry.status === 'error') return '查询失败';
    if (entry.status === 'no-key') return '未配置密钥';
    if (entry.status === 'exhausted') return '余额不足';
    if (entry.unlimited) return '不限';
    return formatBalanceAmount(entry.amount, entry.currency);
};

const GUARD_STATES = Object.freeze(['off', 'unknown', 'ok', 'warn', 'blocked']);

/**
 * Threshold verdict. `mode` is the user-facing guard switch:
 *   'off'  → never warn or block (default: stale balances must not block sends)
 *   'warn' → warn below `warnBelow`
 *   'block'→ warn below `warnBelow`, block below `blockBelow`
 * Amounts that are not finite yield 'unknown' so callers can stay silent.
 */
const evaluateBalanceGuard = ({
    amount,
    mode = 'off',
    warnBelow = 0,
    blockBelow = 0
} = {}) => {
    const normalizedMode = ['off', 'warn', 'block'].includes(mode) ? mode : 'off';
    if (normalizedMode === 'off') return { state: 'off', threshold: null };
    const value = toFiniteNumber(amount);
    if (value === null) return { state: 'unknown', threshold: null };
    const blockAt = toFiniteNumber(blockBelow) || 0;
    const warnAt = toFiniteNumber(warnBelow) || 0;
    if (normalizedMode === 'block' && blockAt > 0 && value <= blockAt) {
        return { state: 'blocked', threshold: blockAt };
    }
    if (warnAt > 0 && value <= warnAt) {
        return { state: 'warn', threshold: warnAt };
    }
    return { state: 'ok', threshold: null };
};

// Cached entries older than this are still displayed (marked stale) but the
// send-time guard refuses to act on them: a wrong block is worse than none.
const BALANCE_STALE_MS = 30 * 60 * 1000;

const isBalanceStale = (entry, now = Date.now()) => {
    const fetchedAt = toFiniteNumber(entry?.fetchedAt);
    if (fetchedAt === null) return true;
    return now - fetchedAt > BALANCE_STALE_MS;
};

export {
    BALANCE_STALE_MS,
    KIND_DEEPSEEK,
    KIND_MOONSHOT,
    KIND_OPENROUTER,
    KIND_RELAY,
    KIND_SILICONFLOW,
    GUARD_STATES,
    RELAY_UNLIMITED_THRESHOLD,
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
};
