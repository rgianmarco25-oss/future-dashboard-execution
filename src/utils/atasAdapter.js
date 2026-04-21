function nowIso() {
    return new Date().toISOString()
}

function cleanString(value) {
    if (value === null || value === undefined) {
        return ""
    }

    return String(value).trim()
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function toArray(value) {
    return Array.isArray(value) ? value : []
}

function normalizeSide(value) {
    const side = cleanString(value).toLowerCase()

    if (side === "short" || side === "sell") {
        return "short"
    }

    return "long"
}

function getPointValue(symbol) {
    const safeSymbol = cleanString(symbol).toUpperCase()

    if (safeSymbol.startsWith("MNQ")) {
        return 2
    }

    if (safeSymbol.startsWith("MES")) {
        return 5
    }

    if (safeSymbol.startsWith("NQ")) {
        return 20
    }

    if (safeSymbol.startsWith("ES")) {
        return 50
    }

    return 2
}

function calculateGrossPnl(trade) {
    const qty = toNumber(trade?.qty, 0)
    const entryPrice = toNumber(trade?.entryPrice, 0)
    const exitPrice = toNumber(trade?.exitPrice, 0)
    const pointValue = getPointValue(trade?.symbol)
    const side = normalizeSide(trade?.side)

    if (side === "short") {
        return (entryPrice - exitPrice) * pointValue * qty
    }

    return (exitPrice - entryPrice) * pointValue * qty
}

function resolveMeta(account = {}, options = {}) {
    const atasAccountId = cleanString(
        options.atasAccountId ||
        options.accountId ||
        account?.atasAccountId ||
        account?.dataProviderAccountId ||
        account?.tradingAccountId ||
        account?.id
    )

    const atasAccountName = cleanString(
        options.atasAccountName ||
        options.accountName ||
        account?.atasAccountName ||
        account?.dataProviderAccountName ||
        account?.displayName ||
        account?.tradingAccountName ||
        atasAccountId
    )

    const tradingAccountId = cleanString(
        options.tradingAccountId ||
        account?.tradingAccountId ||
        atasAccountId
    )

    const tradingAccountName = cleanString(
        options.tradingAccountName ||
        account?.tradingAccountName ||
        atasAccountName ||
        tradingAccountId
    )

    const accountSize = toNumber(
        options.accountSize,
        toNumber(account?.accountSize, 0) ||
        toNumber(account?.startingBalance, 0) ||
        toNumber(account?.currentBalance, 0) ||
        25000
    )

    const startingBalance = toNumber(
        options.startingBalance,
        toNumber(account?.startingBalance, 0) || accountSize
    )

    return {
        atasAccountId,
        atasAccountName,
        tradingAccountId,
        tradingAccountName,
        accountSize,
        startingBalance,
    }
}

function buildMockTrades(account = {}, options = {}) {
    const meta = resolveMeta(account, options)
    const symbol = cleanString(options.symbol || "MNQM6")
    const basePrice = toNumber(options.basePrice, 18100)
    const tradingDate = cleanString(options.tradingDate || "2026-04-11")

    return [
        {
            tradeId: `${meta.atasAccountId}-MOCK-T1`,
            symbol,
            side: "long",
            qty: 1,
            entryPrice: basePrice,
            exitPrice: basePrice + 18,
            entryAt: `${tradingDate}T09:32:00`,
            exitAt: `${tradingDate}T09:46:00`,
        },
        {
            tradeId: `${meta.atasAccountId}-MOCK-T2`,
            symbol,
            side: "short",
            qty: 1,
            entryPrice: basePrice + 25,
            exitPrice: basePrice + 10,
            entryAt: `${tradingDate}T10:08:00`,
            exitAt: `${tradingDate}T10:19:00`,
        },
    ]
}

function buildOrders(meta, trades, options = {}) {
    const workingOrderCount = Math.max(toNumber(options.workingOrderCount, 1), 0)
    const workingTimestamp = cleanString(
        options.workingTimestamp ||
        `${cleanString(options.tradingDate || "2026-04-11")}T14:20:00`
    )
    const symbol = cleanString(options.symbol || "MNQM6")

    const filledOrders = trades.flatMap((trade, index) => {
        const entrySide = normalizeSide(trade.side) === "short" ? "Sell" : "Buy"
        const exitSide = normalizeSide(trade.side) === "short" ? "Buy" : "Sell"

        return [
            {
                "Order ID": `${meta.atasAccountId}-ENTRY-${index + 1}`,
                Contract: trade.symbol,
                Quantity: trade.qty,
                "Filled Qty": trade.qty,
                "Avg Fill Price": trade.entryPrice,
                "Account ID": meta.atasAccountId,
                "Account Name": meta.atasAccountName,
                Type: "Market",
                Status: "Filled",
                Timestamp: trade.entryAt,
                "B/S": entrySide,
            },
            {
                "Order ID": `${meta.atasAccountId}-EXIT-${index + 1}`,
                Contract: trade.symbol,
                Quantity: trade.qty,
                "Filled Qty": trade.qty,
                "Avg Fill Price": trade.exitPrice,
                "Account ID": meta.atasAccountId,
                "Account Name": meta.atasAccountName,
                Type: "Market",
                Status: "Filled",
                Timestamp: trade.exitAt,
                "B/S": exitSide,
            },
        ]
    })

    const workingOrders = Array.from({ length: workingOrderCount }).map((_, index) => ({
        "Order ID": `${meta.atasAccountId}-WORKING-${index + 1}`,
        Contract: symbol,
        Quantity: 1,
        "Filled Qty": 0,
        "Avg Fill Price": "",
        "Account ID": meta.atasAccountId,
        "Account Name": meta.atasAccountName,
        Type: "Limit",
        Status: "Working",
        Timestamp: workingTimestamp,
        "B/S": "Buy",
    }))

    return [...filledOrders, ...workingOrders]
}

function buildFills(meta, trades) {
    return trades.flatMap((trade, index) => {
        const entrySide = normalizeSide(trade.side) === "short" ? "Sell" : "Buy"
        const exitSide = normalizeSide(trade.side) === "short" ? "Buy" : "Sell"

        return [
            {
                "Fill ID": `${meta.atasAccountId}-ENTRYFILL-${index + 1}`,
                "Order ID": `${meta.atasAccountId}-ENTRY-${index + 1}`,
                Contract: trade.symbol,
                "B/S": entrySide,
                Quantity: trade.qty,
                Price: trade.entryPrice,
                commission: 1,
                Timestamp: trade.entryAt,
                "Account ID": meta.atasAccountId,
                "Account Name": meta.atasAccountName,
            },
            {
                "Fill ID": `${meta.atasAccountId}-EXITFILL-${index + 1}`,
                "Order ID": `${meta.atasAccountId}-EXIT-${index + 1}`,
                Contract: trade.symbol,
                "B/S": exitSide,
                Quantity: trade.qty,
                Price: trade.exitPrice,
                commission: 1,
                Timestamp: trade.exitAt,
                "Account ID": meta.atasAccountId,
                "Account Name": meta.atasAccountName,
            },
        ]
    })
}

function buildBalanceHistory(meta, trades) {
    let runningBalance = meta.startingBalance

    return trades.map((trade, index) => {
        const grossPnl = calculateGrossPnl(trade)
        runningBalance += grossPnl

        return {
            "Trade Date": trade.exitAt,
            "Transaction Type": "Trade",
            Description: `ATAS Trade ${index + 1}`,
            Amount: grossPnl.toFixed(2),
            "Total Amount": runningBalance.toFixed(2),
            "Starting Balance": index === 0 ? meta.startingBalance.toFixed(2) : "",
            "Account Size": index === 0 ? meta.accountSize.toFixed(2) : "",
            "Account ID": meta.atasAccountId,
            "Account Name": meta.atasAccountName,
        }
    })
}

function buildFromRawTrades(account = {}, options = {}) {
    const meta = resolveMeta(account, options)
    const trades = toArray(options.trades).length
        ? toArray(options.trades)
        : buildMockTrades(account, options)

    const orders = Array.isArray(options.orders)
        ? options.orders
        : buildOrders(meta, trades, options)

    const fills = Array.isArray(options.fills)
        ? options.fills
        : buildFills(meta, trades)

    const balanceHistory = Array.isArray(options.balanceHistory)
        ? options.balanceHistory
        : Array.isArray(options.cashHistory)
            ? options.cashHistory
            : buildBalanceHistory(meta, trades)

    const realizedPnL = trades.reduce((sum, trade) => sum + calculateGrossPnl(trade), 0)
    const currentBalance = toNumber(
        options.currentBalance ?? options.balance,
        meta.startingBalance + realizedPnL
    )
    const drawdownLimit = toNumber(
        options.drawdownLimit,
        Math.max(meta.startingBalance - 1000, 0)
    )
    const maxDailyLoss = toNumber(options.maxDailyLoss, 500)
    const openPositionCount = Math.max(toNumber(options.openPositionCount, 0), 0)
    const openOrderCount = Math.max(
        toNumber(
            options.openOrderCount,
            orders.filter((row) => cleanString(row?.Status).toLowerCase() === "working").length
        ),
        0
    )
    const tradingDate = cleanString(options.tradingDate || nowIso().slice(0, 10))
    const lastSyncAt = cleanString(options.lastSyncAt || nowIso())

    return {
        dataProvider: "atas",
        dataProviderType: cleanString(options.dataProviderType || "desktop"),
        dataProviderStatus: cleanString(options.dataProviderStatus || "connected"),
        lastSyncAt,
        atasAccountId: meta.atasAccountId,
        atasAccountName: meta.atasAccountName,
        dataProviderAccountId: meta.atasAccountId,
        dataProviderAccountName: meta.atasAccountName,
        tradingAccountId: meta.tradingAccountId,
        tradingAccountName: meta.tradingAccountName,
        accountSize: meta.accountSize,
        startingBalance: meta.startingBalance,
        currentBalance,
        balance: currentBalance,
        dailyPnL: toNumber(options.dailyPnL, realizedPnL),
        realizedPnL: toNumber(options.realizedPnL, realizedPnL),
        unrealizedPnL: toNumber(options.unrealizedPnL, 0),
        drawdownLimit,
        maxDailyLoss,
        liquidationPrice: toNumber(options.liquidationPrice, drawdownLimit),
        liquidationPriceBreached: Boolean(options.liquidationPriceBreached),
        stopRiskViolation: Boolean(options.stopRiskViolation),
        trailingDrawdownViolation: Boolean(options.trailingDrawdownViolation),
        isLocked: Boolean(options.isLocked),
        openPositionCount,
        openOrderCount,
        sessionKey: cleanString(options.sessionKey || tradingDate),
        tradingDate,
        lastResetAt: cleanString(options.lastResetAt || lastSyncAt),
        orders,
        fills,
        balanceHistory,
        dailyState: {
            sessionKey: cleanString(options.sessionKey || tradingDate),
            tradingDate,
            lastResetAt: cleanString(options.lastResetAt || lastSyncAt),
            dailyPnL: toNumber(options.dailyPnL, realizedPnL),
            realizedPnL: toNumber(options.realizedPnL, realizedPnL),
            unrealizedPnL: toNumber(options.unrealizedPnL, 0),
            startingBalance: meta.startingBalance,
            currentBalance,
            liquidationPrice: toNumber(options.liquidationPrice, drawdownLimit),
            liquidationPriceBreached: Boolean(options.liquidationPriceBreached),
            stopRiskViolation: Boolean(options.stopRiskViolation),
            trailingDrawdownViolation: Boolean(options.trailingDrawdownViolation),
            isLocked: Boolean(options.isLocked),
            drawdownLimit,
            maxDailyLoss,
            openPositionCount,
            openOrderCount,
        },
        source: {
            provider: "atas",
            type: cleanString(options.dataProviderType || "desktop"),
            status: cleanString(options.dataProviderStatus || "connected"),
            accountId: meta.atasAccountId,
            accountName: meta.atasAccountName,
            lastSyncAt,
        },
    }
}

function readInjectedSnapshot(account = {}, options = {}) {
    if (options.injectedSnapshot && typeof options.injectedSnapshot === "object") {
        return options.injectedSnapshot
    }

    if (options.rawSnapshot && typeof options.rawSnapshot === "object") {
        return options.rawSnapshot
    }

    if (typeof window === "undefined") {
        return null
    }

    const meta = resolveMeta(account, options)
    const store = window.__FUTURE_DASHBOARD_ATAS__

    if (!store || typeof store !== "object") {
        return null
    }

    return (
        store[meta.atasAccountId] ||
        store[meta.tradingAccountId] ||
        store.default ||
        null
    )
}

export function buildMockSnapshot(account = {}, options = {}) {
    return buildFromRawTrades(account, {
        ...options,
        dataProviderStatus: cleanString(options.dataProviderStatus || "connected"),
        dataProviderType: cleanString(options.dataProviderType || "desktop"),
    })
}

export function getMockSnapshot(account = {}, options = {}) {
    return buildMockSnapshot(account, options)
}

export async function getAccountSnapshot(account = {}, options = {}) {
    const injected = readInjectedSnapshot(account, options)

    if (injected && typeof injected === "object") {
        return buildFromRawTrades(account, {
            ...options,
            ...injected,
            trades: Array.isArray(injected.trades)
                ? injected.trades
                : options.trades,
            orders: Array.isArray(injected.orders)
                ? injected.orders
                : options.orders,
            fills: Array.isArray(injected.fills)
                ? injected.fills
                : options.fills,
            balanceHistory: Array.isArray(injected.balanceHistory)
                ? injected.balanceHistory
                : injected.cashHistory,
        })
    }

    return buildMockSnapshot(account, options)
}

export async function readAccountSnapshot(account = {}, options = {}) {
    return getAccountSnapshot(account, options)
}

export async function syncAccount(account = {}, options = {}) {
    return getAccountSnapshot(account, options)
}

export async function fetchAccountSnapshot(account = {}, options = {}) {
    return getAccountSnapshot(account, options)
}

export default {
    buildMockSnapshot,
    getMockSnapshot,
    getAccountSnapshot,
    readAccountSnapshot,
    syncAccount,
    fetchAccountSnapshot,
}