import * as atasAdapter from "./atasAdapter"
import {
    getAccountById,
    getLiveAccountSnapshot,
    saveProviderSyncSnapshot,
    updateAccount,
} from "./storage"

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

function formatMoney(value) {
    return `$ ${toNumber(value, 0).toLocaleString("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function buildFlexibleSource(source) {
    const map = {}

    if (!source || typeof source !== "object") {
        return map
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = cleanString(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")

        if (!normalizedKey) {
            return
        }

        if (map[normalizedKey] === undefined) {
            map[normalizedKey] = source[key]
        }
    })

    return map
}

function pickFlexibleValue(source, keys, fallback = "") {
    const flexible = buildFlexibleSource(source)

    for (const key of keys) {
        const normalizedKey = cleanString(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")

        if (!normalizedKey) {
            continue
        }

        const value = flexible[normalizedKey]

        if (value !== undefined && value !== null && value !== "") {
            return value
        }
    }

    return fallback
}

function getLatestBalanceFromHistory(rows) {
    const safeRows = toArray(rows)

    for (let index = safeRows.length - 1; index >= 0; index -= 1) {
        const row = safeRows[index]
        const value = pickFlexibleValue(row, [
            "totalAmount",
            "currentBalance",
            "balance",
            "netLiq",
            "netLiquidity",
            "endingBalance",
            "endingEquity",
        ])

        const parsed = toNumber(value, NaN)

        if (Number.isFinite(parsed)) {
            return parsed
        }
    }

    return 0
}

function getStartingBalanceFromHistory(rows) {
    const safeRows = toArray(rows)

    for (let index = 0; index < safeRows.length; index += 1) {
        const row = safeRows[index]
        const startValue = pickFlexibleValue(row, [
            "startingBalance",
            "startBalance",
            "accountSize",
            "initialBalance",
            "beginningBalance",
        ])

        const parsedStart = toNumber(startValue, NaN)

        if (Number.isFinite(parsedStart) && parsedStart > 0) {
            return parsedStart
        }

        const totalValue = pickFlexibleValue(row, [
            "totalAmount",
            "currentBalance",
            "balance",
            "endingBalance",
        ])

        const parsedTotal = toNumber(totalValue, NaN)

        if (Number.isFinite(parsedTotal) && parsedTotal > 0) {
            return parsedTotal
        }
    }

    return 0
}

function normalizeAccountText(value) {
    return cleanString(value).toUpperCase().replace(/\s+/g, "")
}

function isReplayAccountText(value) {
    return normalizeAccountText(value).includes("REPLAY")
}

function isPaAccountText(value) {
    const text = normalizeAccountText(value)

    return (
        text.startsWith("PA-APEX") ||
        text.startsWith("PA_APEX") ||
        text.startsWith("PAAPEX")
    )
}

function isEvalAccountText(value) {
    const text = normalizeAccountText(value)

    return (
        text.startsWith("APEX-") ||
        text.startsWith("APEX_") ||
        text.startsWith("APEX")
    )
}

function hasIntradayText(value) {
    const text = normalizeAccountText(value)

    return (
        text.includes("INTRADAY") ||
        text.includes("INTRA") ||
        text.includes("PAINTRADAY") ||
        text.includes("EVALINTRADAY")
    )
}

function hasEodText(value) {
    const text = normalizeAccountText(value)

    return (
        text.includes("EOD") ||
        text.includes("ENDOFDAY") ||
        text.includes("END_OF_DAY")
    )
}

function detectAccountSizeFromText(value) {
    const text = normalizeAccountText(value)

    if (!text) {
        return 0
    }

    if (/(^|[^0-9])150K([^0-9]|$)/i.test(text) || text.includes("150000")) {
        return 150000
    }

    if (/(^|[^0-9])100K([^0-9]|$)/i.test(text) || text.includes("100000")) {
        return 100000
    }

    if (/(^|[^0-9])50K([^0-9]|$)/i.test(text) || text.includes("50000")) {
        return 50000
    }

    if (/(^|[^0-9])25K([^0-9]|$)/i.test(text) || text.includes("25000")) {
        return 25000
    }

    return 0
}

function detectAccountSizeFromBalance(value) {
    const balance = toNumber(value, 0)

    if (balance <= 0) {
        return 0
    }

    const sizes = [25000, 50000, 100000, 150000]

    let bestSize = 0
    let bestDistance = Number.POSITIVE_INFINITY

    sizes.forEach((size) => {
        const distance = Math.abs(balance - size)

        if (distance < bestDistance) {
            bestDistance = distance
            bestSize = size
        }
    })

    return bestSize
}

function resolveAccountSize(account, snapshot, accountRef, startingBalance, currentBalance) {
    const textSize = detectAccountSizeFromText(
        [
            accountRef,
            account?.displayName,
            account?.tradingAccountId,
            account?.tradingAccountName,
            account?.dataProviderAccountId,
            account?.dataProviderAccountName,
            account?.atasAccountId,
            account?.atasAccountName,
            snapshot?.accountSize,
            snapshot?.accountName,
            snapshot?.accountId,
        ].join(" ")
    )

    if (textSize > 0) {
        return textSize
    }

    const directSize = toNumber(snapshot?.accountSize || account?.accountSize, 0)

    if ([25000, 50000, 100000, 150000].includes(directSize)) {
        return directSize
    }

    const balanceSize = detectAccountSizeFromBalance(
        currentBalance || startingBalance || snapshot?.balance || account?.currentBalance
    )

    if (balanceSize > 0) {
        return balanceSize
    }

    return 50000
}

function resolveProviderAccountRef(account, snapshot = {}, options = {}) {
    return cleanString(
        snapshot.atasAccountId ||
        snapshot.dataProviderAccountId ||
        snapshot.accountId ||
        snapshot.accountName ||
        options.atasAccountId ||
        options.atasAccountName ||
        account?.atasAccountId ||
        account?.dataProviderAccountId ||
        account?.tradingAccountId ||
        account?.displayName ||
        account?.id
    )
}

function resolveProviderAccountName(account, snapshot = {}, options = {}) {
    return cleanString(
        snapshot.atasAccountName ||
        snapshot.dataProviderAccountName ||
        snapshot.accountName ||
        snapshot.accountId ||
        options.atasAccountName ||
        options.atasAccountId ||
        account?.atasAccountName ||
        account?.dataProviderAccountName ||
        account?.tradingAccountName ||
        account?.displayName ||
        account?.id
    )
}

function resolveAccountStatus(account, accountPhase, isReplay) {
    const currentStatus = cleanString(account?.accountStatus).toLowerCase()

    if (
        currentStatus === "passed" ||
        currentStatus === "failed" ||
        currentStatus === "archived"
    ) {
        return currentStatus
    }

    if (isReplay) {
        return currentStatus || "open"
    }

    if (accountPhase === "pa") {
        return currentStatus || "active"
    }

    return currentStatus || "open"
}

function inferAtasAccountProfile(account, snapshot = {}, options = {}) {
    const providerRef = resolveProviderAccountRef(account, snapshot, options)
    const providerName = resolveProviderAccountName(account, snapshot, options)
    const fallbackRef = providerRef || providerName || cleanString(account?.id)
    const joinedText = [
        providerRef,
        providerName,
        account?.displayName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.dataProviderAccountId,
        account?.dataProviderAccountName,
        account?.atasAccountId,
        account?.atasAccountName,
    ].join(" ")

    const replay = isReplayAccountText(joinedText)
    const pa = isPaAccountText(joinedText)
    const evalAccount = isEvalAccountText(joinedText)

    let accountPhase = cleanString(account?.accountPhase).toLowerCase()
    let productType = cleanString(account?.productType).toLowerCase()

    if (pa) {
        accountPhase = "pa"
    } else if (evalAccount || replay) {
        accountPhase = "eval"
    } else if (accountPhase !== "pa" && accountPhase !== "eval") {
        accountPhase = "eval"
    }

    if (hasIntradayText(joinedText)) {
        productType = "intraday"
    } else if (hasEodText(joinedText)) {
        productType = "eod"
    } else if (evalAccount || pa || replay) {
        productType = "eod"
    } else if (productType !== "eod" && productType !== "intraday") {
        productType = "eod"
    }

    const startingBalance = toNumber(
        snapshot.startingBalance ||
        snapshot.balance ||
        snapshot.currentBalance ||
        account?.startingBalance,
        0
    )

    const currentBalance = toNumber(
        snapshot.currentBalance ||
        snapshot.balance ||
        account?.currentBalance,
        startingBalance
    )

    const accountSize = resolveAccountSize(
        account,
        snapshot,
        fallbackRef,
        startingBalance,
        currentBalance
    )

    const tradingRef = fallbackRef
    const displayName = replay ? "Replay" : tradingRef

    return {
        replay,
        accountPhase,
        productType,
        accountStatus: resolveAccountStatus(account, accountPhase, replay),
        accountSize,
        displayName,
        providerRef: tradingRef,
        providerName: providerName || tradingRef,
        tradingAccountId: tradingRef,
        tradingAccountName: tradingRef,
    }
}

function getWorkingOrderCount(orders) {
    return toArray(orders).filter((order) => {
        const status = cleanString(
            order?.status ||
            order?.Status ||
            order?.orderStatus
        ).toLowerCase()

        return (
            status === "working" ||
            status === "open" ||
            status === "pending" ||
            status === "submitted"
        )
    }).length
}

function normalizeOrders(rows) {
    return toArray(rows).map((row, index) => {
        if (!row || typeof row !== "object") {
            return {
                id: `atas-order-${index + 1}`,
                status: "unknown",
            }
        }

        const contract = pickFlexibleValue(row, [
            "contract",
            "symbol",
            "instrument",
            "product",
        ])

        const status = pickFlexibleValue(row, [
            "status",
            "orderStatus",
        ], "unknown")

        const quantity = pickFlexibleValue(row, [
            "quantity",
            "qty",
            "orderQty",
            "filledQty",
        ], 0)

        const price = pickFlexibleValue(row, [
            "avgFillPrice",
            "price",
            "limitPrice",
            "avgPrice",
        ], "")

        const timestamp = pickFlexibleValue(row, [
            "timestamp",
            "time",
            "dateTime",
            "datetime",
            "createdAt",
            "updatedAt",
        ], "")

        return {
            ...row,
            id: cleanString(
                row.id ||
                row.orderId ||
                row["Order ID"] ||
                `atas-order-${index + 1}`
            ),
            contract: cleanString(contract),
            status: cleanString(status),
            quantity: toNumber(quantity, 0),
            price: cleanString(price),
            timestamp: cleanString(timestamp),
        }
    })
}

function normalizeFills(rows) {
    return toArray(rows).map((row, index) => {
        if (!row || typeof row !== "object") {
            return {
                id: `atas-fill-${index + 1}`,
                quantity: 0,
            }
        }

        const contract = pickFlexibleValue(row, [
            "contract",
            "symbol",
            "instrument",
            "product",
        ])

        const quantity = pickFlexibleValue(row, [
            "quantity",
            "qty",
            "fillQty",
        ], 0)

        const price = pickFlexibleValue(row, [
            "price",
            "fillPrice",
            "avgPrice",
        ], "")

        const timestamp = pickFlexibleValue(row, [
            "timestamp",
            "time",
            "dateTime",
            "datetime",
            "createdAt",
            "updatedAt",
        ], "")

        return {
            ...row,
            id: cleanString(
                row.id ||
                row.fillId ||
                row["Fill ID"] ||
                `atas-fill-${index + 1}`
            ),
            contract: cleanString(contract),
            quantity: toNumber(quantity, 0),
            price: cleanString(price),
            timestamp: cleanString(timestamp),
        }
    })
}

function normalizeBalanceHistory(rows) {
    return toArray(rows).map((row, index) => {
        if (!row || typeof row !== "object") {
            return {
                id: `atas-balance-${index + 1}`,
            }
        }

        return {
            ...row,
            id: cleanString(
                row.id ||
                row.balanceId ||
                row.rowId ||
                `atas-balance-${index + 1}`
            ),
        }
    })
}

function buildMockOrders(account) {
    const accountId = cleanString(
        account?.atasAccountId ||
        account?.dataProviderAccountId ||
        account?.displayName ||
        account?.id
    )

    return normalizeOrders([
        {
            id: `${accountId}-ORDER-1`,
            contract: "MNQM6",
            status: "Filled",
            quantity: 2,
            price: 18120,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-ORDER-2`,
            contract: "MNQM6",
            status: "Filled",
            quantity: 2,
            price: 18130,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-ORDER-3`,
            contract: "MNQM6",
            status: "Filled",
            quantity: 1,
            price: 18110,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-ORDER-4`,
            contract: "MNQM6",
            status: "Filled",
            quantity: 1,
            price: 18105,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-ORDER-5`,
            contract: "MNQM6",
            status: "Working",
            quantity: 1,
            price: 18100,
            timestamp: nowIso(),
        },
    ])
}

function buildMockFills(account) {
    const accountId = cleanString(
        account?.atasAccountId ||
        account?.dataProviderAccountId ||
        account?.displayName ||
        account?.id
    )

    return normalizeFills([
        {
            id: `${accountId}-FILL-1`,
            contract: "MNQM6",
            quantity: 2,
            price: 18120,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-FILL-2`,
            contract: "MNQM6",
            quantity: 2,
            price: 18130,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-FILL-3`,
            contract: "MNQM6",
            quantity: 1,
            price: 18110,
            timestamp: nowIso(),
        },
        {
            id: `${accountId}-FILL-4`,
            contract: "MNQM6",
            quantity: 1,
            price: 18105,
            timestamp: nowIso(),
        },
    ])
}

function buildMockBalanceHistory(account) {
    const baseBalance = toNumber(
        account?.startingBalance || account?.accountSize,
        25000
    )

    return normalizeBalanceHistory([
        {
            timestamp: "2026-04-19T15:30:00",
            startingBalance: baseBalance,
            totalAmount: baseBalance + 24.96,
        },
        {
            timestamp: "2026-04-19T16:15:00",
            totalAmount: baseBalance + 49.96,
        },
    ])
}

function buildFallbackMockSnapshot(account, options = {}) {
    const lastSyncAt = nowIso()
    const orders = buildMockOrders(account)
    const fills = buildMockFills(account)
    const balanceHistory = buildMockBalanceHistory(account)
    const startingBalance = getStartingBalanceFromHistory(balanceHistory) || 25000
    const currentBalance = getLatestBalanceFromHistory(balanceHistory) || startingBalance
    const profile = inferAtasAccountProfile(
        account,
        {
            startingBalance,
            currentBalance,
            balance: currentBalance,
        },
        options
    )

    return {
        dataProvider: "atas",
        dataProviderType: "desktop",
        dataProviderStatus: "connected",
        displayName: profile.displayName,
        accountPhase: profile.accountPhase,
        productType: profile.productType,
        accountStatus: profile.accountStatus,
        atasAccountId: profile.providerRef,
        atasAccountName: profile.providerName,
        dataProviderAccountId: profile.providerRef,
        dataProviderAccountName: profile.providerName,
        tradingAccountId: profile.tradingAccountId,
        tradingAccountName: profile.tradingAccountName,
        lastSyncAt,
        orders,
        fills,
        balanceHistory,
        startingBalance,
        currentBalance,
        balance: currentBalance,
        accountSize: profile.accountSize,
        openOrderCount: getWorkingOrderCount(orders),
        openPositionCount: 0,
        dailyState: {
            sessionKey: "atas-sync",
            tradingDate: lastSyncAt.slice(0, 10),
            lastResetAt: lastSyncAt,
            startingBalance,
            currentBalance,
            dailyPnL: currentBalance - startingBalance,
            realizedPnL: currentBalance - startingBalance,
            unrealizedPnL: 0,
            drawdownLimit: profile.accountSize - 1000,
            maxDailyLoss: 500,
            openOrderCount: getWorkingOrderCount(orders),
            openPositionCount: 0,
            stopRiskViolation: false,
            trailingDrawdownViolation: false,
            liquidationPriceBreached: false,
            isLocked: false,
        },
    }
}

function unwrapAdapterResult(result) {
    if (result && typeof result === "object" && result.snapshot) {
        return result.snapshot
    }

    return result
}

function resolveAdapterSyncFunction() {
    const candidates = [
        atasAdapter.syncAccount,
        atasAdapter.fetchAccountSnapshot,
        atasAdapter.getAccountSnapshot,
        atasAdapter.readAccountSnapshot,
        atasAdapter.getMockSnapshot,
        atasAdapter.buildMockSnapshot,
    ]

    return candidates.find((candidate) => typeof candidate === "function") || null
}

async function readSnapshotFromAdapter(account, options = {}) {
    const syncFunction = resolveAdapterSyncFunction()

    if (!syncFunction) {
        return buildFallbackMockSnapshot(account, options)
    }

    const payload = {
        account,
        accountId: cleanString(account?.id),
        atasAccountId: cleanString(
            options.atasAccountId ||
            account?.atasAccountId ||
            account?.dataProviderAccountId
        ),
        atasAccountName: cleanString(
            options.atasAccountName ||
            account?.atasAccountName ||
            account?.dataProviderAccountName ||
            account?.displayName
        ),
        forceMock: options.forceMock === true,
    }

    const result = await syncFunction(payload)
    const snapshot = unwrapAdapterResult(result)

    if (!snapshot || typeof snapshot !== "object") {
        return buildFallbackMockSnapshot(account, options)
    }

    return snapshot
}

function normalizeAtasSnapshot(account, snapshot = {}, options = {}) {
    const lastSyncAt = cleanString(
        snapshot.lastSyncAt ||
        snapshot.syncedAt ||
        snapshot.timestamp ||
        nowIso()
    )

    const orders = normalizeOrders(snapshot.orders)
    const fills = normalizeFills(snapshot.fills)
    const balanceHistory = normalizeBalanceHistory(
        snapshot.balanceHistory ||
        snapshot.cashHistory ||
        snapshot.accountBalanceHistory
    )

    const startingBalance = toNumber(
        snapshot.startingBalance,
        getStartingBalanceFromHistory(balanceHistory) ||
        account?.startingBalance ||
        account?.accountSize ||
        snapshot.balance ||
        snapshot.currentBalance ||
        0
    )

    const currentBalance = toNumber(
        snapshot.currentBalance ?? snapshot.balance,
        getLatestBalanceFromHistory(balanceHistory) ||
        account?.currentBalance ||
        startingBalance
    )

    const profile = inferAtasAccountProfile(
        account,
        {
            ...snapshot,
            startingBalance,
            currentBalance,
            balance: currentBalance,
        },
        options
    )

    const openOrderCount = toNumber(
        snapshot.openOrderCount,
        getWorkingOrderCount(orders)
    )

    const openPositionCount = toNumber(
        snapshot.openPositionCount ?? snapshot.positionQty,
        0
    )

    return {
        dataProvider: "atas",
        dataProviderType: cleanString(snapshot.dataProviderType || "desktop") || "desktop",
        dataProviderStatus: "connected",
        displayName: profile.displayName,
        accountPhase: profile.accountPhase,
        productType: profile.productType,
        accountStatus: profile.accountStatus,
        atasAccountId: profile.providerRef,
        atasAccountName: profile.providerName,
        dataProviderAccountId: profile.providerRef,
        dataProviderAccountName: profile.providerName,
        tradingAccountId: profile.tradingAccountId,
        tradingAccountName: profile.tradingAccountName,
        lastSyncAt,
        orders,
        fills,
        balanceHistory,
        performance: toArray(snapshot.performance),
        positionHistory: toArray(snapshot.positionHistory),
        startingBalance,
        currentBalance,
        balance: currentBalance,
        accountSize: profile.accountSize,
        symbol: cleanString(snapshot.symbol || snapshot.contract || snapshot.instrument),
        positionQty: toNumber(snapshot.positionQty, openPositionCount),
        avgPrice: toNumber(snapshot.avgPrice, 0),
        realizedPnL: toNumber(snapshot.realizedPnL, 0),
        unrealizedPnL: toNumber(snapshot.unrealizedPnL, 0),
        dailyState: {
            ...(snapshot.dailyState || {}),
            sessionKey: cleanString(
                snapshot?.dailyState?.sessionKey ||
                snapshot.sessionKey ||
                "atas-sync"
            ),
            tradingDate: cleanString(
                snapshot?.dailyState?.tradingDate ||
                snapshot.tradingDate ||
                lastSyncAt.slice(0, 10)
            ),
            lastResetAt: cleanString(
                snapshot?.dailyState?.lastResetAt ||
                snapshot.lastResetAt ||
                lastSyncAt
            ),
            startingBalance: toNumber(
                snapshot?.dailyState?.startingBalance,
                startingBalance
            ),
            currentBalance: toNumber(
                snapshot?.dailyState?.currentBalance,
                currentBalance
            ),
            dailyPnL: toNumber(
                snapshot?.dailyState?.dailyPnL ?? snapshot.dailyPnL,
                currentBalance - startingBalance
            ),
            realizedPnL: toNumber(
                snapshot?.dailyState?.realizedPnL ?? snapshot.realizedPnL,
                toNumber(snapshot.realizedPnL, currentBalance - startingBalance)
            ),
            unrealizedPnL: toNumber(
                snapshot?.dailyState?.unrealizedPnL ?? snapshot.unrealizedPnL,
                0
            ),
            drawdownLimit: toNumber(
                snapshot?.dailyState?.drawdownLimit ?? snapshot.drawdownLimit,
                0
            ),
            maxDailyLoss: toNumber(
                snapshot?.dailyState?.maxDailyLoss ?? snapshot.maxDailyLoss,
                0
            ),
            liquidationPrice: toNumber(
                snapshot?.dailyState?.liquidationPrice ?? snapshot.liquidationPrice,
                0
            ),
            liquidationPriceBreached: Boolean(
                snapshot?.dailyState?.liquidationPriceBreached ??
                snapshot.liquidationPriceBreached
            ),
            stopRiskViolation: Boolean(
                snapshot?.dailyState?.stopRiskViolation ??
                snapshot.stopRiskViolation
            ),
            trailingDrawdownViolation: Boolean(
                snapshot?.dailyState?.trailingDrawdownViolation ??
                snapshot.trailingDrawdownViolation
            ),
            isLocked: Boolean(
                snapshot?.dailyState?.isLocked ?? snapshot.isLocked
            ),
            openOrderCount,
            openPositionCount,
        },
        openOrderCount,
        openPositionCount,
    }
}

function buildSuccessMessage(snapshot) {
    const orderCount = toArray(snapshot?.orders).length
    const fillCount = toArray(snapshot?.fills).length
    const balance = formatMoney(snapshot?.currentBalance)

    return `ATAS Sync fertig. Orders ${orderCount}. Fills ${fillCount}. Balance ${balance}.`
}

function buildErrorMessage(error) {
    const message = cleanString(error?.message || error)

    if (message) {
        return `ATAS Sync Fehler. ${message}`
    }

    return "ATAS Sync Fehler."
}

function buildAccountUpdateFromSnapshot(snapshot) {
    return {
        displayName: snapshot.displayName,
        accountPhase: snapshot.accountPhase,
        productType: snapshot.productType,
        accountStatus: snapshot.accountStatus,
        accountSize: snapshot.accountSize,
        dataProvider: "atas",
        dataProviderType: "desktop",
        dataProviderStatus: snapshot.dataProviderStatus || "connected",
        dataProviderAccountId: snapshot.dataProviderAccountId,
        dataProviderAccountName: snapshot.dataProviderAccountName,
        atasAccountId: snapshot.atasAccountId,
        atasAccountName: snapshot.atasAccountName,
        tradingAccountId: snapshot.tradingAccountId,
        tradingAccountName: snapshot.tradingAccountName,
        currentBalance: snapshot.currentBalance,
        startingBalance: snapshot.startingBalance,
        lastSyncAt: snapshot.lastSyncAt,
    }
}

export async function syncAtasAccount(accountId, options = {}) {
    const safeAccountId = cleanString(accountId)

    if (!safeAccountId) {
        return {
            ok: false,
            status: "error",
            message: "ATAS Sync Fehler. Account fehlt.",
            snapshot: null,
        }
    }

    const account = getAccountById(safeAccountId)

    if (!account) {
        return {
            ok: false,
            status: "error",
            message: "ATAS Sync Fehler. Account wurde nicht gefunden.",
            snapshot: null,
        }
    }

    const syncStartedAt = nowIso()
    const startingProfile = inferAtasAccountProfile(account, {}, options)

    updateAccount(safeAccountId, {
        displayName: startingProfile.displayName,
        accountPhase: startingProfile.accountPhase,
        productType: startingProfile.productType,
        accountStatus: startingProfile.accountStatus,
        accountSize: startingProfile.accountSize,
        dataProvider: "atas",
        dataProviderType: "desktop",
        dataProviderStatus: "syncing",
        dataProviderAccountId: startingProfile.providerRef,
        dataProviderAccountName: startingProfile.providerName,
        atasAccountId: startingProfile.providerRef,
        atasAccountName: startingProfile.providerName,
        tradingAccountId: startingProfile.tradingAccountId,
        tradingAccountName: startingProfile.tradingAccountName,
        lastSyncAt: syncStartedAt,
    })

    try {
        const rawSnapshot = await readSnapshotFromAdapter(account, options)
        const normalizedSnapshot = normalizeAtasSnapshot(account, rawSnapshot, options)

        updateAccount(safeAccountId, buildAccountUpdateFromSnapshot(normalizedSnapshot))
        saveProviderSyncSnapshot(safeAccountId, normalizedSnapshot, "atas")
        updateAccount(safeAccountId, buildAccountUpdateFromSnapshot(normalizedSnapshot))

        const liveSnapshot = getLiveAccountSnapshot(safeAccountId)

        return {
            ok: true,
            status: "connected",
            message: buildSuccessMessage(liveSnapshot),
            snapshot: liveSnapshot,
        }
    } catch (error) {
        updateAccount(safeAccountId, {
            dataProvider: "atas",
            dataProviderType: "desktop",
            dataProviderStatus: "error",
            lastSyncAt: nowIso(),
        })

        return {
            ok: false,
            status: "error",
            message: buildErrorMessage(error),
            snapshot: getLiveAccountSnapshot(safeAccountId),
            error,
        }
    }
}

export async function runAtasSync(accountId, options = {}) {
    return syncAtasAccount(accountId, options)
}

export async function runAtasSyncTest(accountId, options = {}) {
    return syncAtasAccount(accountId, options)
}

export async function testAtasSync(accountId, options = {}) {
    return syncAtasAccount(accountId, options)
}

export default syncAtasAccount