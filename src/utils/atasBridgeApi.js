const DEFAULT_BASE_URL = "http://localhost:3030";

const HISTORY_START_DATE = "2026-01-01";

const ALLOWED_ATAS_ACCOUNT_IDS = new Set([
    "APEX-425134-08",
    "APEX-425134-09",
    "PA-APEX-425134-02",
]);

const BLOCKED_ACCOUNT_MARKERS = [
    "REPLAY",
    "LUCID",
    "LFE",
    "TEST",
    "SIM",
];

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

function getBaseUrl() {
    const envValue =
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_ATAS_BRIDGE_URL
            ? import.meta.env.VITE_ATAS_BRIDGE_URL
            : DEFAULT_BASE_URL;

    return trimTrailingSlash(envValue || DEFAULT_BASE_URL);
}

async function parseJsonResponse(response) {
    const text = await response.text();

    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error("ATAS Bridge Antwort ist kein gültiges JSON");
    }
}

function toNumber(value, fallback = 0) {
    const numberValue = Number(value);

    if (Number.isFinite(numberValue)) {
        return numberValue;
    }

    return fallback;
}

function cleanString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function buildFlexibleMap(source) {
    const map = {};

    if (!source || typeof source !== "object") {
        return map;
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = cleanString(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

        if (!normalizedKey) {
            return;
        }

        if (map[normalizedKey] === undefined) {
            map[normalizedKey] = source[key];
        }
    });

    return map;
}

function pickFlexibleValue(source, keys) {
    if (!source || typeof source !== "object") {
        return "";
    }

    const map = buildFlexibleMap(source);

    for (const key of keys) {
        const directValue = source[key];

        if (
            directValue !== undefined &&
            directValue !== null &&
            cleanString(directValue) !== ""
        ) {
            return directValue;
        }

        const normalizedKey = cleanString(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

        const mappedValue = map[normalizedKey];

        if (
            mappedValue !== undefined &&
            mappedValue !== null &&
            cleanString(mappedValue) !== ""
        ) {
            return mappedValue;
        }
    }

    return "";
}

function normalizeConnectionStatus(value) {
    const status = cleanString(value).toLowerCase();

    if (["online", "connected", "ready", "live", "ok"].includes(status)) {
        return "online";
    }

    if (["offline", "disconnected", "error", "failed"].includes(status)) {
        return "offline";
    }

    return status || "offline";
}

function normalizeRef(value) {
    return cleanString(value)
        .toUpperCase()
        .replace(/_/g, "-")
        .replace(/\s+/g, "");
}

function canonicalizeAccountRef(value) {
    const normalized = normalizeRef(value);

    if (!normalized) {
        return "";
    }

    const apexWithoutLastDash = normalized.match(/^APEX-(\d{6})(\d{2})$/);

    if (apexWithoutLastDash) {
        return `APEX-${apexWithoutLastDash[1]}-${apexWithoutLastDash[2]}`;
    }

    const paWithoutLastDash = normalized.match(/^PA-APEX-(\d{6})(\d{2})$/);

    if (paWithoutLastDash) {
        return `PA-APEX-${paWithoutLastDash[1]}-${paWithoutLastDash[2]}`;
    }

    return normalized;
}

function isReplayRef(value) {
    return canonicalizeAccountRef(value) === "REPLAY";
}

function hasBlockedAccountMarker(value) {
    const text = canonicalizeAccountRef(value);

    if (!text) {
        return false;
    }

    return BLOCKED_ACCOUNT_MARKERS.some((marker) => text.includes(marker));
}

function isPaApexRef(value) {
    const normalized = canonicalizeAccountRef(value);

    return (
        normalized.startsWith("PA-APEX") ||
        normalized.startsWith("PAAPEX")
    );
}

function isEvalApexRef(value) {
    const normalized = canonicalizeAccountRef(value);

    return normalized.startsWith("APEX-");
}

function isApexRef(value) {
    return isPaApexRef(value) || isEvalApexRef(value);
}

function hasApexRef(value) {
    const normalized = canonicalizeAccountRef(value);

    return (
        normalized.includes("APEX-") ||
        normalized.includes("PA-APEX") ||
        normalized.includes("PAAPEX")
    );
}

function isAllowedCurrentApexAccountRef(value) {
    const accountRef = canonicalizeAccountRef(value);

    if (!accountRef) {
        return false;
    }

    if (hasBlockedAccountMarker(accountRef)) {
        return false;
    }

    if (ALLOWED_ATAS_ACCOUNT_IDS.has(accountRef)) {
        return true;
    }

    const apexMatch = accountRef.match(/^APEX-425134-(\d+)$/);

    if (apexMatch) {
        return Number(apexMatch[1]) >= 8;
    }

    const paMatch = accountRef.match(/^PA-APEX-425134-(\d+)$/);

    if (paMatch) {
        return Number(paMatch[1]) >= 2;
    }

    return false;
}

function getAccountRefCandidates(rawAccount) {
    return [
        pickFlexibleValue(rawAccount, [
            "tradingAccountId",
            "TradingAccountId",
            "tradingRef",
            "TradingRef",
        ]),
        pickFlexibleValue(rawAccount, [
            "tradingAccountName",
            "TradingAccountName",
        ]),
        pickFlexibleValue(rawAccount, [
            "dataProviderAccountId",
            "DataProviderAccountId",
        ]),
        pickFlexibleValue(rawAccount, [
            "dataProviderAccountName",
            "DataProviderAccountName",
        ]),
        pickFlexibleValue(rawAccount, [
            "atasAccountId",
            "AtasAccountId",
        ]),
        pickFlexibleValue(rawAccount, [
            "atasAccountName",
            "AtasAccountName",
        ]),
        pickFlexibleValue(rawAccount, [
            "accountName",
            "name",
            "account",
            "AccountName",
            "Account",
        ]),
        pickFlexibleValue(rawAccount, [
            "accountId",
            "accountID",
            "id",
            "AccountId",
            "AccountID",
        ]),
        pickFlexibleValue(rawAccount?.lastFill, [
            "accountId",
            "accountName",
            "tradingAccountId",
        ]),
        pickFlexibleValue(rawAccount?.lastOrder, [
            "accountId",
            "accountName",
            "tradingAccountId",
        ]),
    ]
        .map(cleanString)
        .filter(Boolean);
}

function resolveBestAccountRef(rawAccount) {
    const candidates = getAccountRefCandidates(rawAccount);

    const allowedRef = candidates.find((candidate) =>
        isAllowedCurrentApexAccountRef(candidate)
    );

    if (allowedRef) {
        return canonicalizeAccountRef(allowedRef);
    }

    const exactApexRef = candidates.find((candidate) => isApexRef(candidate));

    if (exactApexRef) {
        return canonicalizeAccountRef(exactApexRef);
    }

    const containedApexRef = candidates.find((candidate) => hasApexRef(candidate));

    if (containedApexRef) {
        return canonicalizeAccountRef(containedApexRef);
    }

    const nonReplayRef = candidates.find((candidate) => !isReplayRef(candidate));

    if (nonReplayRef) {
        return canonicalizeAccountRef(nonReplayRef);
    }

    const replayRef = candidates.find((candidate) => isReplayRef(candidate));

    if (replayRef) {
        return "Replay";
    }

    return "ATAS Account";
}

function detectAccountPhase(accountRef, rawAccount) {
    const text = [
        accountRef,
        pickFlexibleValue(rawAccount, ["accountPhase", "phase"]),
        pickFlexibleValue(rawAccount, [
            "accountName",
            "accountId",
            "tradingAccountId",
        ]),
    ]
        .join(" ")
        .toUpperCase();

    const normalized = text.replace(/\s+/g, "");

    if (
        normalized.includes("PA-APEX") ||
        normalized.includes("PA_APEX") ||
        normalized.includes("PAAPEX")
    ) {
        return "pa";
    }

    return "eval";
}

function detectProductType(accountRef, rawAccount) {
    const text = [
        accountRef,
        pickFlexibleValue(rawAccount, ["productType", "mode", "accountMode"]),
        pickFlexibleValue(rawAccount, [
            "accountName",
            "accountId",
            "tradingAccountId",
        ]),
    ]
        .join(" ")
        .toLowerCase();

    if (text.includes("intraday")) {
        return "intraday";
    }

    return "eod";
}

function detectAccountSizeFromText(value) {
    const text = normalizeRef(value);

    if (text.includes("150K") || text.includes("150000")) {
        return 150000;
    }

    if (text.includes("100K") || text.includes("100000")) {
        return 100000;
    }

    if (text.includes("50K") || text.includes("50000")) {
        return 50000;
    }

    if (text.includes("25K") || text.includes("25000")) {
        return 25000;
    }

    return 0;
}

function detectAccountSizeFromBalance(value) {
    const balance = toNumber(value, 0);

    if (balance <= 0) {
        return 0;
    }

    const sizes = [25000, 50000, 100000, 150000];

    let bestSize = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    sizes.forEach((size) => {
        const distance = Math.abs(balance - size);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestSize = size;
        }
    });

    return bestSize;
}

function resolveAccountSize(accountRef, rawAccount, currentBalance, startingBalance) {
    const textSize = detectAccountSizeFromText(
        [
            accountRef,
            pickFlexibleValue(rawAccount, ["accountSize", "AccountSize"]),
            pickFlexibleValue(rawAccount, [
                "accountName",
                "accountId",
                "tradingAccountId",
            ]),
        ].join(" ")
    );

    if (textSize > 0) {
        return textSize;
    }

    const directSize = toNumber(
        pickFlexibleValue(rawAccount, ["accountSize", "AccountSize", "size"]),
        0
    );

    if ([25000, 50000, 100000, 150000].includes(directSize)) {
        return directSize;
    }

    const balanceSize = detectAccountSizeFromBalance(
        currentBalance || startingBalance
    );

    if (balanceSize > 0) {
        return balanceSize;
    }

    return 50000;
}

function normalizeDisplaySymbol(value) {
    const raw = cleanString(value).toUpperCase();

    if (!raw) {
        return "";
    }

    return raw
        .replace("@CME", "")
        .replace("@CBOT", "")
        .replace("@NYMEX", "")
        .replace("@COMEX", "")
        .replace("CME", "")
        .replace("CBOT", "")
        .replace("NYMEX", "")
        .replace("COMEX", "")
        .trim();
}

function normalizeOrder(row, index, accountRef) {
    const contract = normalizeDisplaySymbol(
        pickFlexibleValue(row, ["contract", "symbol", "instrument", "product", "rawSymbol"])
    );

    const status = cleanString(
        pickFlexibleValue(row, ["status", "orderStatus", "State"]) || "unknown"
    );

    const quantity = toNumber(
        pickFlexibleValue(row, [
            "quantity",
            "qty",
            "orderQty",
            "filledQty",
            "QuantityToFill",
        ]),
        0
    );

    const price = toNumber(
        pickFlexibleValue(row, [
            "avgFillPrice",
            "price",
            "limitPrice",
            "avgPrice",
            "Price",
        ]),
        0
    );

    const timestamp = cleanString(
        pickFlexibleValue(row, [
            "timestamp",
            "time",
            "dateTime",
            "datetime",
            "createdAt",
            "updatedAt",
            "Time",
        ])
    );

    return {
        ...row,
        id: cleanString(
            row?.id ||
                row?.orderId ||
                row?.orderID ||
                row?.Id ||
                row?.ExtId ||
                row?.["Order ID"] ||
                `${accountRef}-ORDER-${index + 1}`
        ),
        accountId: canonicalizeAccountRef(row?.accountId || row?.AccountID || accountRef),
        accountName: canonicalizeAccountRef(row?.accountName || row?.AccountID || accountRef),
        contract,
        symbol: normalizeDisplaySymbol(row?.symbol || contract),
        instrument: normalizeDisplaySymbol(row?.instrument || contract),
        status,
        quantity,
        qty: quantity,
        price,
        timestamp,
        time: timestamp,
    };
}

function normalizeFill(row, index, accountRef) {
    const contract = normalizeDisplaySymbol(
        pickFlexibleValue(row, ["contract", "symbol", "instrument", "product", "rawSymbol"])
    );

    const quantity = Math.abs(
        toNumber(
            pickFlexibleValue(row, [
                "quantity",
                "qty",
                "fillQty",
                "signedQty",
                "Volume",
            ]),
            0
        )
    );

    const side = cleanString(
        pickFlexibleValue(row, ["side", "Side", "direction", "OrderDirection"])
    );

    const signedQtyValue = toNumber(
        pickFlexibleValue(row, ["signedQty", "signedQuantity"]),
        side.toLowerCase() === "sell" ? -Math.abs(quantity) : quantity
    );

    const price = toNumber(
        pickFlexibleValue(row, ["price", "fillPrice", "avgPrice", "Price"]),
        0
    );

    const timestamp = cleanString(
        pickFlexibleValue(row, [
            "timestamp",
            "time",
            "dateTime",
            "datetime",
            "createdAt",
            "updatedAt",
            "Time",
        ])
    );

    return {
        ...row,
        id: cleanString(
            row?.id ||
                row?.fillId ||
                row?.fillID ||
                row?.Id ||
                row?.executionId ||
                row?.["Fill ID"] ||
                `${accountRef}-FILL-${index + 1}`
        ),
        accountId: canonicalizeAccountRef(row?.accountId || row?.AccountID || accountRef),
        accountName: canonicalizeAccountRef(row?.accountName || row?.AccountID || accountRef),
        contract,
        symbol: normalizeDisplaySymbol(row?.symbol || contract),
        instrument: normalizeDisplaySymbol(row?.instrument || contract),
        side,
        quantity,
        qty: quantity,
        signedQty: signedQtyValue,
        price,
        timestamp,
        time: timestamp,
        realizedPnL: toNumber(row?.realizedPnL ?? row?.realizedPnl, 0),
        commission: toNumber(row?.commission ?? row?.Commission, 0),
        orderId: cleanString(row?.orderId || row?.OrderId || ""),
    };
}

function normalizeBalanceRow(row, index, accountRef) {
    return {
        ...row,
        id: cleanString(
            row?.id || row?.balanceId || `${accountRef}-BALANCE-${index + 1}`
        ),
        accountId: canonicalizeAccountRef(row?.accountId || accountRef),
        accountName: canonicalizeAccountRef(row?.accountName || accountRef),
    };
}
function normalizeHistoryTrade(row, index) {
    const accountRef = canonicalizeAccountRef(
        row?.accountId ||
            row?.AccountID ||
            row?.accountName ||
            ""
    );

    const symbol = normalizeDisplaySymbol(
        row?.symbol ||
            row?.instrument ||
            row?.contract ||
            row?.SecurityId ||
            row?.rawSymbol ||
            ""
    );

    const tradeId = cleanString(
        row?.tradeId ||
            row?.id ||
            row?.Id ||
            `${accountRef}-HISTORY-TRADE-${index + 1}`
    );

    const openVolume = toNumber(row?.openVolume ?? row?.OpenVolume, 0);
    const closeVolume = toNumber(row?.closeVolume ?? row?.CloseVolume, 0);
    const qty = Math.max(
        Math.abs(toNumber(row?.qty ?? row?.quantity, 0)),
        Math.abs(openVolume),
        Math.abs(closeVolume),
        1
    );

    const grossPnL = toNumber(row?.grossPnL ?? row?.pnl ?? row?.PnL, 0);
    const commission = toNumber(row?.commission ?? row?.Commission, 0);
    const netPnL = toNumber(row?.netPnL, grossPnL - commission);

    return {
        ...row,
        provider: "atas",
        source: cleanString(row?.source || "atas-history-mytrade"),
        id: tradeId,
        tradeId,
        accountId: accountRef,
        accountName: accountRef,
        symbol,
        instrument: symbol,
        contract: symbol,
        rawSymbol: cleanString(row?.rawSymbol || row?.SecurityId || symbol),
        side: cleanString(row?.side || (openVolume < 0 ? "short" : "long")),
        qty,
        quantity: qty,
        openTime: cleanString(row?.openTime || row?.OpenTime || row?.entryTime),
        closeTime: cleanString(row?.closeTime || row?.CloseTime || row?.exitTime),
        timestamp: cleanString(
            row?.timestamp ||
                row?.closeTime ||
                row?.CloseTime ||
                row?.openTime ||
                row?.OpenTime
        ),
        entryTime: cleanString(row?.entryTime || row?.openTime || row?.OpenTime),
        exitTime: cleanString(row?.exitTime || row?.closeTime || row?.CloseTime),
        openPrice: toNumber(row?.openPrice ?? row?.OpenPrice, 0),
        closePrice: toNumber(row?.closePrice ?? row?.ClosePrice, 0),
        entryPrice: toNumber(row?.entryPrice ?? row?.openPrice ?? row?.OpenPrice, 0),
        exitPrice: toNumber(row?.exitPrice ?? row?.closePrice ?? row?.ClosePrice, 0),
        grossPnL,
        netPnL,
        pnl: grossPnL,
        ticksPnL: toNumber(row?.ticksPnL ?? row?.TicksPnL, 0),
        pricePnL: toNumber(row?.pricePnL ?? row?.PricePnL, 0),
        commission,
        comment: cleanString(row?.comment || row?.Comment),
        reviewed: Boolean(row?.reviewed),
    };
}

function normalizeHistoryOrder(row, index, accountRef = "") {
    const resolvedAccountRef = canonicalizeAccountRef(
        row?.accountId ||
            row?.AccountID ||
            accountRef
    );

    return normalizeOrder(row, index, resolvedAccountRef);
}

function isAllowedApexDashboardAccount(account) {
    const candidates = [
        account?.accountId,
        account?.accountName,
        account?.displayName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.dataProviderAccountId,
        account?.dataProviderAccountName,
        account?.atasAccountId,
        account?.atasAccountName,
        account?.rawAccountId,
        account?.rawAccountName,
    ]
        .map(canonicalizeAccountRef)
        .filter(Boolean);

    return candidates.some((candidate) =>
        isAllowedCurrentApexAccountRef(candidate)
    );
}

function dedupeAccountsById(accounts) {
    const map = new Map();

    accounts.forEach((account) => {
        const key = canonicalizeAccountRef(
            account?.accountId ||
                account?.tradingAccountId ||
                account?.dataProviderAccountId ||
                account?.displayName
        );

        if (!key) {
            return;
        }

        map.set(key, account);
    });

    return Array.from(map.values());
}

function buildQueryString(options = {}) {
    const params = new URLSearchParams();

    const accountId = cleanString(options.accountId || options.account || "");
    const start = cleanString(options.start || options.from || "");
    const end = cleanString(options.end || options.to || "");

    if (accountId) {
        params.set("accountId", canonicalizeAccountRef(accountId));
    }

    if (start) {
        params.set("start", start);
    }

    if (end) {
        params.set("end", end);
    }

    const queryString = params.toString();

    return queryString ? `?${queryString}` : "";
}

async function fetchBridgeJson(path, signal) {
    const response = await fetch(`${getBaseUrl()}${path}`, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
        signal,
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
        throw new Error(data?.error || "ATAS Bridge Fehler");
    }

    return data;
}

export async function fetchAtasBridgeHealth(signal) {
    return fetchBridgeJson("/health", signal);
}

export async function fetchAtasAccounts(signal) {
    const data = await fetchBridgeJson("/accounts", signal);

    const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
    const count = toNumber(
        data?.count ?? data?.accountCount ?? accounts.length,
        accounts.length
    );

    return {
        ok: Boolean(data?.ok),
        provider: data?.provider || data?.service || "atas",
        count,
        accountCount: count,
        accounts,
        lastUpdatedAt: data?.lastUpdatedAt || data?.updatedAt || "",
        raw: data,
    };
}

export function normalizeAtasAccount(rawAccount = {}) {
    const accountRef = resolveBestAccountRef(rawAccount);

    const rawAccountId = cleanString(
        pickFlexibleValue(rawAccount, [
            "accountId",
            "accountID",
            "id",
            "account",
            "Account",
            "AccountId",
            "AccountID",
        ])
    );

    const rawAccountName = cleanString(
        pickFlexibleValue(rawAccount, [
            "accountName",
            "name",
            "account",
            "AccountName",
            "Account",
        ])
    );

    const displayName = accountRef || rawAccountName || rawAccountId || "ATAS Account";

    const balance = toNumber(
        pickFlexibleValue(rawAccount, [
            "currentBalance",
            "balance",
            "cash",
            "netLiquidation",
            "netLiq",
            "Balance",
            "Cash",
        ]),
        0
    );

    const cash = toNumber(
        pickFlexibleValue(rawAccount, [
            "cash",
            "balance",
            "currentBalance",
            "Cash",
            "Balance",
        ]),
        balance
    );

    const startingBalance = toNumber(
        pickFlexibleValue(rawAccount, [
            "startingBalance",
            "startBalance",
            "providerStartingBalance",
            "atasStartingBalance",
            "initialBalance",
        ]),
        balance
    );

    const realizedPnL = toNumber(
        pickFlexibleValue(rawAccount, [
            "realizedPnL",
            "realizedPnl",
            "realized",
            "RealizedPnL",
        ]),
        0
    );

    const unrealizedPnL = toNumber(
        pickFlexibleValue(rawAccount, [
            "unrealizedPnL",
            "unrealizedPnl",
            "unrealized",
            "UnrealizedPnL",
        ]),
        0
    );

    const positionQty = toNumber(
        pickFlexibleValue(rawAccount, [
            "positionQty",
            "qty",
            "quantity",
            "PositionQty",
        ]),
        0
    );

    const avgPrice = toNumber(
        pickFlexibleValue(rawAccount, [
            "avgPrice",
            "averagePrice",
            "AvgPrice",
        ]),
        0
    );

    const connectionStatus = normalizeConnectionStatus(
        pickFlexibleValue(rawAccount, [
            "connectionStatus",
            "status",
            "ConnectionStatus",
        ])
    );

    const timestamp = cleanString(
        pickFlexibleValue(rawAccount, [
            "timestamp",
            "time",
            "Timestamp",
        ])
    );

    const receivedAt = cleanString(
        pickFlexibleValue(rawAccount, [
            "receivedAt",
            "received",
            "ReceivedAt",
        ])
    );

    const lastSyncAt = cleanString(
        pickFlexibleValue(rawAccount, [
            "lastSyncAt",
            "updatedAt",
            "lastUpdatedAt",
            "LastSyncAt",
        ])
    );

    const symbol = normalizeDisplaySymbol(
        pickFlexibleValue(rawAccount, [
            "symbol",
            "Symbol",
            "instrument",
            "contract",
        ])
    );

    const rawOrders = toArray(rawAccount.orders);
    const rawFills = toArray(rawAccount.fills);
    const rawBalanceHistory = toArray(
        rawAccount.balanceHistory || rawAccount.cashHistory
    );

    const rawLastFill =
        rawAccount.lastFill && typeof rawAccount.lastFill === "object"
            ? rawAccount.lastFill
            : null;

    const orders = rawOrders.map((row, index) =>
        normalizeOrder(row, index, accountRef)
    );

    let fills = rawFills.map((row, index) =>
        normalizeFill(row, index, accountRef)
    );

    const lastFill = rawLastFill
        ? normalizeFill(rawLastFill, fills.length, accountRef)
        : fills.length
            ? fills[fills.length - 1]
            : null;

    if (!fills.length && lastFill) {
        fills = [lastFill];
    }

    const balanceHistory = rawBalanceHistory.map((row, index) =>
        normalizeBalanceRow(row, index, accountRef)
    );

    const accountPhase = detectAccountPhase(accountRef, rawAccount);
    const productType = detectProductType(accountRef, rawAccount);
    const accountSize = resolveAccountSize(
        accountRef,
        rawAccount,
        balance,
        startingBalance
    );

    return {
        id: accountRef,

        provider: "atas",
        dataProvider: "atas",
        providerType: "desktop",
        dataProviderType: "desktop",
        type: "desktop",

        status: connectionStatus === "online" ? "connected" : "offline",
        dataProviderStatus: connectionStatus === "online" ? "connected" : "offline",
        connectionStatus,
        connected: connectionStatus === "online",

        accountId: accountRef,
        accountName: displayName,
        displayName,

        rawAccountId,
        rawAccountName,

        atasAccountId: accountRef,
        atasAccountName: displayName,
        dataProviderAccountId: accountRef,
        dataProviderAccountName: displayName,
        tradingAccountId: accountRef,
        tradingAccountName: displayName,
        tradingAccountKey: accountRef,

        accountPhase,
        productType,
        accountStatus: accountPhase === "pa" ? "active" : "open",
        accountSize,

        balance,
        cash,
        startingBalance,
        currentBalance: balance,
        realizedPnL,
        unrealizedPnL,
        dailyPnL: realizedPnL + unrealizedPnL,

        symbol,
        currency: cleanString(rawAccount.currency || rawAccount.Currency || "USD"),
        positionQty,
        avgPrice,
        openPositionCount: Math.abs(positionQty) > 0 ? 1 : 0,
        openOrderCount: orders.filter((order) => {
            const status = cleanString(order.status).toLowerCase();

            return (
                status === "working" ||
                status === "open" ||
                status === "pending" ||
                status === "submitted"
            );
        }).length,

        orders,
        fills,
        lastFill,
        balanceHistory,
        cashHistory: balanceHistory,
        performance: toArray(rawAccount.performance),
        positionHistory: toArray(rawAccount.positionHistory),

        source: cleanString(rawAccount.source || "atas-bridge"),
        sourceName: accountRef,
        timestamp,
        receivedAt,
        lastSyncAt: lastSyncAt || receivedAt || timestamp,

        raw: rawAccount,
    };
}

export async function fetchNormalizedAtasAccounts(signal) {
    const result = await fetchAtasAccounts(signal);

    const accounts = dedupeAccountsById(
        result.accounts
            .map(normalizeAtasAccount)
            .filter(
                (account) =>
                    account.accountId ||
                    account.accountName ||
                    account.displayName
            )
            .filter(isAllowedApexDashboardAccount)
    );

    return {
        ...result,
        count: accounts.length,
        accountCount: accounts.length,
        accounts,
    };
}

export async function fetchAtasHistorySummary(options = {}, signal) {
    const queryString = buildQueryString({
        start: HISTORY_START_DATE,
        ...options,
    });

    const data = await fetchBridgeJson(
        `/api/atas/history/summary${queryString}`,
        signal
    );

    return {
        ok: Boolean(data?.ok),
        provider: "atas",
        range: data?.range || {},
        historyStartDate: data?.historyStartDate || HISTORY_START_DATE,
        accountCount: toNumber(data?.accountCount, 0),
        tradeCount: toNumber(data?.tradeCount, 0),
        fillCount: toNumber(data?.fillCount, 0),
        orderCount: toNumber(data?.orderCount, 0),
        grossPnL: toNumber(data?.grossPnL, 0),
        netPnL: toNumber(data?.netPnL, 0),
        commission: toNumber(data?.commission, 0),
        accounts: toArray(data?.accounts).filter((account) =>
            isAllowedCurrentApexAccountRef(account?.accountId)
        ),
        sources: data?.sources || {},
        raw: data,
    };
}

export async function fetchAtasHistoryTrades(options = {}, signal) {
    const queryString = buildQueryString({
        start: HISTORY_START_DATE,
        ...options,
    });

    const data = await fetchBridgeJson(
        `/api/atas/history/trades${queryString}`,
        signal
    );

    const trades = toArray(data?.trades)
        .map(normalizeHistoryTrade)
        .filter((trade) => isAllowedCurrentApexAccountRef(trade.accountId));

    return {
        ok: Boolean(data?.ok),
        provider: "atas",
        source: data?.source || "HistoryMyTrade.cdb",
        filePath: data?.filePath || "",
        readAt: data?.readAt || "",
        columns: toArray(data?.columns),
        count: trades.length,
        trades,
        range: data?.range || {},
        raw: data,
    };
}

export async function fetchAtasHistoryFills(options = {}, signal) {
    const queryString = buildQueryString({
        start: HISTORY_START_DATE,
        ...options,
    });

    const data = await fetchBridgeJson(
        `/api/atas/history/fills${queryString}`,
        signal
    );

    const accountRef = canonicalizeAccountRef(options.accountId || options.account || "");

    const fills = toArray(data?.fills)
        .map((row, index) => normalizeFill(row, index, accountRef || row?.accountId || ""))
        .filter((fill) => isAllowedCurrentApexAccountRef(fill.accountId));

    return {
        ok: Boolean(data?.ok),
        provider: "atas",
        source: data?.source || "MyTrade.cdb",
        filePath: data?.filePath || "",
        readAt: data?.readAt || "",
        columns: toArray(data?.columns),
        count: fills.length,
        fills,
        range: data?.range || {},
        raw: data,
    };
}

export async function fetchAtasHistoryOrders(options = {}, signal) {
    const queryString = buildQueryString({
        start: HISTORY_START_DATE,
        ...options,
    });

    const data = await fetchBridgeJson(
        `/api/atas/history/orders${queryString}`,
        signal
    );

    const accountRef = canonicalizeAccountRef(options.accountId || options.account || "");

    const orders = toArray(data?.orders)
        .map((row, index) => normalizeHistoryOrder(row, index, accountRef || row?.accountId || ""))
        .filter((order) => isAllowedCurrentApexAccountRef(order.accountId));

    return {
        ok: Boolean(data?.ok),
        provider: "atas",
        source: data?.source || "Orders.cdb",
        filePath: data?.filePath || "",
        readAt: data?.readAt || "",
        columns: toArray(data?.columns),
        count: orders.length,
        orders,
        range: data?.range || {},
        raw: data,
    };
}

export function getAtasHistoryStartDate() {
    return HISTORY_START_DATE;
}

export function isAllowedAtasDashboardAccountRef(value) {
    return isAllowedCurrentApexAccountRef(value);
}