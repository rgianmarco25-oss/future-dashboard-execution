import {
    buildEmptyProviderBucket,
    buildEmptyProviderData,
    buildProviderSourceFromAccount,
    normalizeDataProvider,
    normalizeProviderImportsShape,
} from "./providerModel"

function cleanString(value) {
    if (value === null || value === undefined) {
        return ""
    }

    return String(value).trim()
}

function toArray(value) {
    return Array.isArray(value) ? value : []
}

function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {}
}

function resolveAccountObject(account) {
    if (!account) {
        return {}
    }

    if (typeof account === "string") {
        return {
            id: cleanString(account),
        }
    }

    return account
}

function resolveAccountId(account) {
    const safeAccount = resolveAccountObject(account)

    return cleanString(
        safeAccount?.id ||
        safeAccount?.accountId ||
        safeAccount?.resolvedAccountId
    )
}

function getLegacySection(data, sectionName, accountId, fallback = []) {
    const safeData = toObject(data)
    const safeSection = toObject(safeData?.[sectionName])

    return cleanString(accountId)
        ? toArray(safeSection[accountId] ?? fallback)
        : toArray(fallback)
}

function getLegacyCsvImports(data, accountId) {
    const safeData = toObject(data)
    const safeSection = toObject(safeData?.csvImportsByAccount)
    const rawImports = cleanString(accountId)
        ? safeSection[accountId] || {}
        : {}

    return normalizeProviderImportsShape(rawImports)
}

function buildLegacyTradovateBucket(data, account) {
    const safeAccount = resolveAccountObject(account)
    const accountId = resolveAccountId(safeAccount)
    const csvImports = getLegacyCsvImports(data, accountId)
    const source = buildProviderSourceFromAccount(safeAccount, "tradovate")

    return buildEmptyProviderBucket("tradovate", {
        source,
        status:
            cleanString(safeAccount?.dataProviderStatus) ||
            "ready",
        lastSyncAt:
            cleanString(safeAccount?.lastSyncAt) ||
            cleanString(source?.lastSyncAt),
        orders: getLegacySection(data, "ordersByAccount", accountId, []),
        fills: getLegacySection(data, "fillsByAccount", accountId, []),
        balanceHistory: getLegacySection(data, "cashHistoryByAccount", accountId, []),
        performance: toArray(csvImports?.performance?.rows),
        positionHistory: toArray(csvImports?.positionHistory?.rows),
        csvImports,
    })
}

function buildProviderBucketFromStoredData(data, account, provider) {
    const safeData = toObject(data)
    const safeAccount = resolveAccountObject(account)
    const accountId = resolveAccountId(safeAccount)
    const normalizedProvider = normalizeDataProvider(provider)
    const providerDataByAccount = toObject(safeData?.providerDataByAccount)
    const storedAccountProviders = toObject(providerDataByAccount?.[accountId])
    const storedBucket = toObject(storedAccountProviders?.[normalizedProvider])

    if (!Object.keys(storedBucket).length) {
        if (normalizedProvider === "tradovate") {
            return buildLegacyTradovateBucket(safeData, safeAccount)
        }

        return buildEmptyProviderBucket("atas", {
            source: buildProviderSourceFromAccount(safeAccount, "atas"),
        })
    }

    return buildEmptyProviderBucket(normalizedProvider, {
        source: {
            ...buildProviderSourceFromAccount(safeAccount, normalizedProvider),
            ...toObject(storedBucket?.source),
        },
        status:
            cleanString(storedBucket?.status) ||
            cleanString(storedBucket?.source?.status) ||
            cleanString(safeAccount?.dataProviderStatus),
        lastSyncAt:
            cleanString(storedBucket?.lastSyncAt) ||
            cleanString(storedBucket?.source?.lastSyncAt) ||
            cleanString(safeAccount?.lastSyncAt),
        orders: toArray(storedBucket?.orders),
        fills: toArray(storedBucket?.fills),
        balanceHistory: toArray(storedBucket?.balanceHistory),
        performance: toArray(storedBucket?.performance),
        positionHistory: toArray(storedBucket?.positionHistory),
        csvImports: normalizeProviderImportsShape(storedBucket?.csvImports || {}),
    })
}

function getActiveProvider(account) {
    const safeAccount = resolveAccountObject(account)

    return normalizeDataProvider(
        safeAccount?.dataProvider ||
        safeAccount?.source?.provider ||
        "tradovate"
    )
}

export function getActiveProviderSource(account, providerOverride = "") {
    const safeAccount = resolveAccountObject(account)
    const provider = normalizeDataProvider(
        providerOverride || getActiveProvider(safeAccount)
    )

    return buildProviderSourceFromAccount(safeAccount, provider)
}

export function getActiveProviderAccountId(account, providerOverride = "") {
    return cleanString(
        getActiveProviderSource(account, providerOverride)?.accountId
    )
}

export function getActiveProviderAccountName(account, providerOverride = "") {
    return cleanString(
        getActiveProviderSource(account, providerOverride)?.accountName
    )
}

export function getProviderDataForAccount(data, account, providerOverride = "") {
    const safeAccount = resolveAccountObject(account)
    const provider = normalizeDataProvider(
        providerOverride || getActiveProvider(safeAccount)
    )

    return buildProviderBucketFromStoredData(data, safeAccount, provider)
}

export function getProviderOrders(data, account, providerOverride = "") {
    return getProviderDataForAccount(data, account, providerOverride).orders
}

export function getProviderFills(data, account, providerOverride = "") {
    return getProviderDataForAccount(data, account, providerOverride).fills
}

export function getProviderBalanceHistory(data, account, providerOverride = "") {
    return getProviderDataForAccount(data, account, providerOverride).balanceHistory
}

export function getProviderPerformance(data, account, providerOverride = "") {
    return getProviderDataForAccount(data, account, providerOverride).performance
}

export function getProviderPositionHistory(data, account, providerOverride = "") {
    return getProviderDataForAccount(data, account, providerOverride).positionHistory
}

export function getProviderCsvImports(data, account, providerOverride = "") {
    return getProviderDataForAccount(data, account, providerOverride).csvImports
}

export function getProviderStatus(data, account, providerOverride = "") {
    return cleanString(
        getProviderDataForAccount(data, account, providerOverride).status
    )
}

export function getProviderLastSyncAt(data, account, providerOverride = "") {
    return cleanString(
        getProviderDataForAccount(data, account, providerOverride).lastSyncAt
    )
}

export function getAllProviderDataForAccount(data, account) {
    const safeAccount = resolveAccountObject(account)
    const emptyData = buildEmptyProviderData()

    return {
        tradovate: getProviderDataForAccount(data, safeAccount, "tradovate") || emptyData.tradovate,
        atas: getProviderDataForAccount(data, safeAccount, "atas") || emptyData.atas,
    }
}