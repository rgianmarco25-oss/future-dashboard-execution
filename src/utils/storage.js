import {
    buildEmptyProviderBucket,
    buildEmptyProviderData,
    buildProviderSourceFromAccount,
    normalizeDataProvider,
    normalizeDataProviderStatus,
    normalizeDataProviderType,
    normalizeProviderImportsShape,
} from "./providerModel"

const STORAGE_KEY = "tradingAppData"
const STORAGE_EVENT = "future-dashboard-storage"
const DATA_VERSION = 13

const DEFAULT_SLOT_STATE = {
    rules: [],
    ruleViolations: [],
    status: "neutral",
    color: "neutral",
}

const DEFAULT_SOURCE = {
    provider: "tradovate",
    type: "csv",
    status: "ready",
    accountId: "",
    accountName: "",
    lastSyncAt: "",
}

const DEFAULT_ACCOUNT = {
    id: "",
    displayName: "",
    tradingAccountId: "",
    tradingAccountName: "",
    tradingAccountKey: "",
    tradovateAccountId: "",
    tradovateAccountName: "",
    atasAccountId: "",
    atasAccountName: "",
    dataProvider: "tradovate",
    dataProviderType: "csv",
    dataProviderStatus: "ready",
    dataProviderAccountId: "",
    dataProviderAccountName: "",
    lastSyncAt: "",
    source: DEFAULT_SOURCE,
    productType: "eod",
    accountPhase: "eval",
    accountStatus: "open",
    accountSize: 0,
    startingBalance: 0,
    currentBalance: 0,
    riskStatus: null,
    accountGroupId: "",
    linkedEvalAccountId: "",
    linkedPaAccountIds: [],
    slotState: DEFAULT_SLOT_STATE,
    createdAt: "",
    updatedAt: "",
    statusChangedAt: "",
    phaseChangedAt: "",
    linkedAt: "",
    unlinkedAt: "",
    activatedAt: "",
    passedAt: "",
    failedAt: "",
    archivedAt: "",
    lifecycleVersion: 2,
    history: [],
}

const DEFAULT_RISK = {
    takeProfit: "",
    stopLoss: "",
    breakEven: "",
}

const DEFAULT_DAILY_STATE = {
    sessionKey: "",
    tradingDate: "",
    lastResetAt: "",
    dailyPnL: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    startingBalance: 0,
    currentBalance: 0,
    liquidationPrice: 0,
    liquidationPriceBreached: false,
    stopRiskViolation: false,
    trailingDrawdownViolation: false,
    isLocked: false,
    drawdownLimit: 0,
    maxDailyLoss: 0,
    openPositionCount: 0,
    openOrderCount: 0,
}

const CSV_IMPORT_KEYS = [
    "orders",
    "trades",
    "cashHistory",
    "performance",
    "positionHistory",
]

const STANDARD_ACCOUNT_SIZES = [25000, 50000, 100000, 150000]

const DEFAULT_DATA = {
    version: DATA_VERSION,
    accounts: [],
    activeAccountId: "",
    accountProfilesById: {},
    ordersByAccount: {},
    positionsByAccount: {},
    riskByAccount: {},
    journalByAccount: {},
    fillsByAccount: {},
    importedOrdersByAccount: {},
    importedTradesByAccount: {},
    dailySummaryByAccount: {},
    dailyStateByAccount: {},
    accountReportByAccount: {},
    cashHistoryByAccount: {},
    csvImportsByAccount: {},
    providerDataByAccount: {},
}

function nowIso() {
    return new Date().toISOString()
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function cleanString(value) {
    if (value === null || value === undefined) {
        return ""
    }

    return String(value).trim()
}

function toArrayRows(value) {
    return Array.isArray(value) ? value : []
}

function looksLikeInternalAccountId(value) {
    const text = cleanString(value)

    if (!text) {
        return false
    }

    return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ||
        /^acc-\d+-[a-z0-9]+$/i.test(text)
    )
}

function normalizeAccountLookup(value) {
    return cleanString(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "")
}

function resolveTradingAccountIdFromAccountLike(input = {}) {
    const candidates = [
        input?.tradingAccountId,
        input?.tradovateAccountId,
        input?.dataProviderAccountId,
        input?.source?.accountId,
        input?.apexId,
        input?.accountId,
        input?.displayName,
        input?.accountName,
        input?.name,
        input?.label,
        looksLikeInternalAccountId(input?.id) ? "" : input?.id,
    ]

    for (const candidate of candidates) {
        const value = cleanString(candidate)

        if (!value) {
            continue
        }

        if (looksLikeInternalAccountId(value)) {
            continue
        }

        return value
    }

    return ""
}

function resolveTradingAccountNameFromAccountLike(input = {}, fallbackId = "") {
    const candidates = [
        input?.tradingAccountName,
        input?.tradovateAccountName,
        input?.dataProviderAccountName,
        input?.source?.accountName,
        input?.displayName,
        input?.accountName,
        input?.name,
        input?.label,
        input?.apexId,
        input?.accountId,
        fallbackId,
        looksLikeInternalAccountId(input?.id) ? "" : input?.id,
    ]

    for (const candidate of candidates) {
        const value = cleanString(candidate)

        if (!value) {
            continue
        }

        if (looksLikeInternalAccountId(value) && value !== cleanString(fallbackId)) {
            continue
        }

        return value
    }

    return cleanString(fallbackId)
}

function createEmptyCsvImport(type) {
    return {
        type: cleanString(type),
        fileName: "",
        importedAt: "",
        headers: [],
        rows: [],
        previewRows: [],
        rawText: "",
        appAccountId: "",
        appAccountName: "",
        tradingAccountId: "",
        tradingAccountName: "",
        tradingAccountKey: "",
        csvAccountRaw: "",
    }
}

function getEmptyCsvImports() {
    const cashHistory = createEmptyCsvImport("cashHistory")

    return {
        orders: createEmptyCsvImport("orders"),
        trades: createEmptyCsvImport("trades"),
        cashHistory,
        dailySummary: {
            ...cashHistory,
            type: "dailySummary",
        },
        performance: createEmptyCsvImport("performance"),
        positionHistory: createEmptyCsvImport("positionHistory"),
    }
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function toBoolean(value) {
    return Boolean(value)
}

function formatMoney(value) {
    return new Intl.NumberFormat("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(toNumber(value, 0))
}

function getMoneyLine(label, value, options = {}) {
    const allowZero = options.allowZero ?? true
    const emptyText = options.emptyText ?? "offen"
    const numeric = Number(value)

    if (!Number.isFinite(numeric)) {
        return `${label}: ${emptyText}`
    }

    if (!allowZero && numeric === 0) {
        return `${label}: ${emptyText}`
    }

    return `${label}: ${formatMoney(numeric)}`
}

function unique(values) {
    return Array.from(new Set((values || []).map(cleanString).filter(Boolean)))
}

function sortHistory(history) {
    return [...(history || [])].sort((a, b) => {
        const left = cleanString(a?.createdAt)
        const right = cleanString(b?.createdAt)
        return left.localeCompare(right)
    })
}

function createHistoryEntry(type, payload = {}) {
    return {
        id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: cleanString(type),
        createdAt: nowIso(),
        ...payload,
    }
}

function normalizeProductType(value) {
    const normalized = cleanString(value).toLowerCase()

    if (normalized === "intraday" || normalized === "intra") {
        return "intraday"
    }

    return "eod"
}

function normalizeAccountPhase(value) {
    const normalized = cleanString(value).toLowerCase()

    if (normalized === "pa") {
        return "pa"
    }

    return "eval"
}

function normalizeAccountStatus(value) {
    const normalized = cleanString(value).toLowerCase()

    if (normalized === "active") {
        return "active"
    }

    if (normalized === "passed") {
        return "passed"
    }

    if (normalized === "failed") {
        return "failed"
    }

    if (normalized === "archived" || normalized === "archive") {
        return "archived"
    }

    return "open"
}

function getDefaultDataProviderStatus(provider) {
    return normalizeDataProvider(provider) === "atas" ? "disconnected" : "ready"
}

function getAccountDataProvider(account) {
    return normalizeDataProvider(
        account?.dataProvider ||
        account?.source?.provider ||
        "tradovate"
    )
}

function normalizeSlotState(value) {
    const base = {
        ...DEFAULT_SLOT_STATE,
        ...(value || {}),
    }

    return {
        rules: Array.isArray(base.rules) ? [...base.rules] : [],
        ruleViolations: Array.isArray(base.ruleViolations)
            ? [...base.ruleViolations]
            : [],
        status: cleanString(base.status || "neutral").toLowerCase() || "neutral",
        color: cleanString(base.color || base.status || "neutral").toLowerCase() || "neutral",
    }
}

function getSlotKeyFromPhaseAndProductType(phase, productType) {
    const normalizedPhase = normalizeAccountPhase(phase)
    const normalizedProductType = normalizeProductType(productType)

    if (normalizedPhase === "eval" && normalizedProductType === "eod") {
        return "evalEod"
    }

    if (normalizedPhase === "pa" && normalizedProductType === "eod") {
        return "paEod"
    }

    if (normalizedPhase === "eval" && normalizedProductType === "intraday") {
        return "evalIntraday"
    }

    return "paIntraday"
}

function createEmptyGroupSlots() {
    return {
        evalEod: null,
        paEod: null,
        evalIntraday: null,
        paIntraday: null,
    }
}

function getAccountProvider(account) {
    const provider = cleanString(
        account?.provider ||
        account?.accountProvider ||
        account?.broker ||
        "APEX"
    ).toUpperCase()

    return provider || "APEX"
}

function getRuntimeGroupSizeKey(account) {
    return normalizeAccountSize(
        account?.accountSize ||
        account?.startingBalance ||
        account?.currentBalance ||
        detectAccountSize(
            account?.displayName ||
            account?.tradingAccountName ||
            account?.tradingAccountId ||
            account?.name ||
            account?.accountName ||
            account?.id
        ),
        0
    )
}

function getCompatibleRuntimeGroup(groups, account) {
    const slotKey = getSlotKeyFromPhaseAndProductType(
        account?.accountPhase,
        account?.productType
    )
    const providerKey = getAccountProvider(account)
    const sizeKey = getRuntimeGroupSizeKey(account)
    const explicitGroupId = cleanString(account?.accountGroupId)

    if (explicitGroupId) {
        const directGroup = groups.find(
            (group) => cleanString(group.id) === explicitGroupId
        )

        if (directGroup && !directGroup.slots?.[slotKey]) {
            return directGroup
        }
    }

    return (
        groups.find((group) => {
            if (group?.slots?.[slotKey]) {
                return false
            }

            const providerMatches = cleanString(group.providerKey) === providerKey

            if (!providerMatches) {
                return false
            }

            if (sizeKey > 0 && toNumber(group.sizeKey, 0) > 0) {
                return toNumber(group.sizeKey, 0) === sizeKey
            }

            return true
        }) || null
    )
}

function buildEvalEodRules(dailyState) {
    const maxDailyLoss = Math.abs(toNumber(dailyState?.maxDailyLoss, 0))
    const drawdownLimit = toNumber(dailyState?.drawdownLimit, 0)
    const currentBalance = toNumber(dailyState?.currentBalance, 0)
    const dailyPnL = toNumber(dailyState?.dailyPnL, 0)
    const liquidationPrice = toNumber(dailyState?.liquidationPrice, 0)
    const openPositions = toNumber(dailyState?.openPositionCount, 0)
    const openOrders = toNumber(dailyState?.openOrderCount, 0)

    return unique([
        "EVAL EOD aktiv überwachen",
        getMoneyLine("Max Daily Loss", maxDailyLoss, { allowZero: false }),
        getMoneyLine("Trailing Drawdown Limit", drawdownLimit, { allowZero: false }),
        getMoneyLine("Aktuelle Balance", currentBalance),
        getMoneyLine("Tages PnL", dailyPnL),
        getMoneyLine("Liquidationspreis", liquidationPrice, { allowZero: false }),
        `Offene Positionen: ${openPositions}`,
        `Offene Orders: ${openOrders}`,
        "Vor Sessionende offene Positionen prüfen",
        "EOD Setup sauber abschließen",
    ])
}

function buildPaEodRules(dailyState) {
    const maxDailyLoss = Math.abs(toNumber(dailyState?.maxDailyLoss, 0))
    const drawdownLimit = toNumber(dailyState?.drawdownLimit, 0)
    const currentBalance = toNumber(dailyState?.currentBalance, 0)
    const dailyPnL = toNumber(dailyState?.dailyPnL, 0)
    const liquidationPrice = toNumber(dailyState?.liquidationPrice, 0)
    const openPositions = toNumber(dailyState?.openPositionCount, 0)
    const openOrders = toNumber(dailyState?.openOrderCount, 0)

    return unique([
        "PA EOD aktiv überwachen",
        getMoneyLine("Max Daily Loss", maxDailyLoss, { allowZero: false }),
        getMoneyLine("Trailing Drawdown Limit", drawdownLimit, { allowZero: false }),
        getMoneyLine("Aktuelle Balance", currentBalance),
        getMoneyLine("Tages PnL", dailyPnL),
        getMoneyLine("Liquidationspreis", liquidationPrice, { allowZero: false }),
        `Offene Positionen: ${openPositions}`,
        `Offene Orders: ${openOrders}`,
        "Vor Sessionende offene Positionen prüfen",
        "PA EOD sauber abschließen",
    ])
}

function buildEvalIntradayRules(dailyState) {
    const maxDailyLoss = Math.abs(toNumber(dailyState?.maxDailyLoss, 0))
    const drawdownLimit = toNumber(dailyState?.drawdownLimit, 0)
    const currentBalance = toNumber(dailyState?.currentBalance, 0)
    const dailyPnL = toNumber(dailyState?.dailyPnL, 0)
    const liquidationPrice = toNumber(dailyState?.liquidationPrice, 0)
    const openPositions = toNumber(dailyState?.openPositionCount, 0)
    const openOrders = toNumber(dailyState?.openOrderCount, 0)

    return unique([
        "EVAL Intraday aktiv überwachen",
        getMoneyLine("Max Daily Loss", maxDailyLoss, { allowZero: false }),
        getMoneyLine("Trailing Drawdown Limit", drawdownLimit, { allowZero: false }),
        getMoneyLine("Aktuelle Balance", currentBalance),
        getMoneyLine("Tages PnL", dailyPnL),
        getMoneyLine("Liquidationspreis", liquidationPrice, { allowZero: false }),
        `Offene Positionen: ${openPositions}`,
        `Offene Orders: ${openOrders}`,
        "Intraday Bewegungen eng überwachen",
        "Stop Risk laufend prüfen",
    ])
}

function buildPaIntradayRules(dailyState) {
    const maxDailyLoss = Math.abs(toNumber(dailyState?.maxDailyLoss, 0))
    const drawdownLimit = toNumber(dailyState?.drawdownLimit, 0)
    const currentBalance = toNumber(dailyState?.currentBalance, 0)
    const dailyPnL = toNumber(dailyState?.dailyPnL, 0)
    const liquidationPrice = toNumber(dailyState?.liquidationPrice, 0)
    const openPositions = toNumber(dailyState?.openPositionCount, 0)
    const openOrders = toNumber(dailyState?.openOrderCount, 0)

    return unique([
        "PA Intraday aktiv überwachen",
        getMoneyLine("Max Daily Loss", maxDailyLoss, { allowZero: false }),
        getMoneyLine("Trailing Drawdown Limit", drawdownLimit, { allowZero: false }),
        getMoneyLine("Aktuelle Balance", currentBalance),
        getMoneyLine("Tages PnL", dailyPnL),
        getMoneyLine("Liquidationspreis", liquidationPrice, { allowZero: false }),
        `Offene Positionen: ${openPositions}`,
        `Offene Orders: ${openOrders}`,
        "Intraday Bewegungen eng überwachen",
        "Stop Risk laufend prüfen",
    ])
}

function buildBaseRulesForAccount(account, dailyState = null) {
    if (!account) {
        return []
    }

    const phase = normalizeAccountPhase(account.accountPhase)
    const productType = normalizeProductType(account.productType)
    const status = normalizeAccountStatus(account.accountStatus)

    if (status !== "active") {
        return []
    }

    if (phase === "eval" && productType === "eod") {
        return buildEvalEodRules(dailyState)
    }

    if (phase === "pa" && productType === "eod") {
        return buildPaEodRules(dailyState)
    }

    if (phase === "eval" && productType === "intraday") {
        return buildEvalIntradayRules(dailyState)
    }

    return buildPaIntradayRules(dailyState)
}

function buildDerivedRuleViolations(account, dailyState = null) {
    if (!account) {
        return []
    }

    const phase = normalizeAccountPhase(account.accountPhase)
    const productType = normalizeProductType(account.productType)
    const violations = []

    const currentBalance = toNumber(dailyState?.currentBalance, 0)
    const dailyPnL = toNumber(dailyState?.dailyPnL, 0)
    const drawdownLimit = toNumber(dailyState?.drawdownLimit, 0)
    const maxDailyLoss = Math.abs(toNumber(dailyState?.maxDailyLoss, 0))
    const liquidationPrice = toNumber(dailyState?.liquidationPrice, 0)
    const openPositions = toNumber(dailyState?.openPositionCount, 0)

    if (normalizeAccountStatus(account.accountStatus) === "failed") {
        violations.push(
            `Account Status ist Failed. Balance: ${formatMoney(currentBalance)}`
        )
    }

    if (toBoolean(dailyState?.stopRiskViolation)) {
        violations.push(
            `Stop Risk verletzt. Tages PnL: ${formatMoney(dailyPnL)}`
        )
    }

    if (toBoolean(dailyState?.trailingDrawdownViolation)) {
        violations.push(
            `Trailing Drawdown verletzt. Limit: ${drawdownLimit > 0 ? formatMoney(drawdownLimit) : "offen"}. Balance: ${formatMoney(currentBalance)}`
        )
    }

    if (toBoolean(dailyState?.liquidationPriceBreached)) {
        violations.push(
            `Liquidationspreis verletzt. Preis: ${liquidationPrice > 0 ? formatMoney(liquidationPrice) : "offen"}`
        )
    }

    if (toBoolean(dailyState?.isLocked)) {
        violations.push(
            `Account ist gesperrt. Tages PnL: ${formatMoney(dailyPnL)}`
        )
    }

    if (maxDailyLoss > 0 && dailyPnL <= -maxDailyLoss) {
        violations.push(
            `${phase === "eval" ? "EVAL" : "PA"} Max Daily Loss verletzt. PnL: ${formatMoney(dailyPnL)}. Limit: ${formatMoney(-maxDailyLoss)}`
        )
    }

    if (
        productType === "eod" &&
        openPositions > 0 &&
        normalizeAccountStatus(account.accountStatus) === "archived"
    ) {
        violations.push(
            `EOD Slot archiviert mit offener Position. Offene Positionen: ${openPositions}`
        )
    }

    return unique(violations)
}

function buildDerivedSlotState(account, dailyState = null) {
    const existing = normalizeSlotState(account?.slotState)
    const derivedRules = buildBaseRulesForAccount(account, dailyState)
    const derivedViolations = buildDerivedRuleViolations(account, dailyState)

    const rules = existing.rules.length
        ? unique([...existing.rules, ...derivedRules])
        : derivedRules

    const ruleViolations = unique([
        ...existing.ruleViolations,
        ...derivedViolations,
    ])

    let status = existing.status || "neutral"
    let color = existing.color || "neutral"
    const lifecycleStatus = normalizeAccountStatus(account?.accountStatus)

    if (ruleViolations.length > 0) {
        status = "red"
        color = "red"
    } else if (lifecycleStatus === "active" && rules.length > 0) {
        status = "green"
        color = "green"
    } else if (lifecycleStatus === "passed") {
        status = "green"
        color = "green"
    } else if (lifecycleStatus === "archived") {
        status = "neutral"
        color = "neutral"
    }

    return normalizeSlotState({
        rules,
        ruleViolations,
        status,
        color,
    })
}

function decorateAccountWithDerivedSlotState(account, dailyState = null) {
    const normalizedAccount = normalizeAccount(account)

    return {
        ...normalizedAccount,
        slotState: buildDerivedSlotState(normalizedAccount, dailyState),
    }
}

function findClosestStandardAccountSize(value) {
    const numeric = toNumber(value, 0)

    if (numeric <= 0) {
        return 0
    }

    let closest = STANDARD_ACCOUNT_SIZES[0]
    let smallestDistance = Math.abs(numeric - closest)

    for (const size of STANDARD_ACCOUNT_SIZES) {
        const distance = Math.abs(numeric - size)

        if (distance < smallestDistance) {
            smallestDistance = distance
            closest = size
        }
    }

    return closest
}

export function normalizeAccountSize(value, fallback = 0) {
    const numeric = toNumber(value, 0)

    if (numeric > 0) {
        const closest = findClosestStandardAccountSize(numeric)
        const tolerance = Math.max(closest * 0.15, 1000)

        if (closest > 0 && Math.abs(numeric - closest) <= tolerance) {
            return closest
        }

        return Math.round(numeric)
    }

    const fallbackNumeric = toNumber(fallback, 0)

    if (fallbackNumeric > 0) {
        return normalizeAccountSize(fallbackNumeric, 0)
    }

    return 0
}

export function formatAccountSizeLabel(value) {
    const normalized = normalizeAccountSize(value, 0)

    if (!normalized) {
        return ""
    }

    if (normalized >= 1000) {
        return `${Math.round(normalized / 1000)}K`
    }

    return String(normalized)
}

export function detectAccountSize(value) {
    const rawText = cleanString(value).toLowerCase()

    if (!rawText) {
        return 0
    }

    const normalized = rawText
        .replace(/[$()]/g, " ")
        .replace(/[_./-]+/g, " ")
        .replace(/,/g, "")
        .replace(/\s+/g, " ")
        .trim()

    const compact = normalized.replace(/\s+/g, "")

    if (
        compact.includes("150k") ||
        compact.includes("150000") ||
        /\b150\s*k\b/.test(normalized) ||
        /\b150\s*000\b/.test(normalized) ||
        /\b150000\b/.test(normalized)
    ) {
        return 150000
    }

    if (
        compact.includes("100k") ||
        compact.includes("100000") ||
        /\b100\s*k\b/.test(normalized) ||
        /\b100\s*000\b/.test(normalized) ||
        /\b100000\b/.test(normalized)
    ) {
        return 100000
    }

    if (
        compact.includes("50k") ||
        compact.includes("50000") ||
        /\b50\s*k\b/.test(normalized) ||
        /\b50\s*000\b/.test(normalized) ||
        /\b50000\b/.test(normalized)
    ) {
        return 50000
    }

    if (
        compact.includes("25k") ||
        compact.includes("25000") ||
        /\b25\s*k\b/.test(normalized) ||
        /\b25\s*000\b/.test(normalized) ||
        /\b25000\b/.test(normalized)
    ) {
        return 25000
    }

    return 0
}

function resolveDetectedAccountSizeFromAccountLike(input = {}) {
    const candidates = [
        input?.tradingAccountId,
        input?.tradingAccountName,
        input?.tradovateAccountId,
        input?.tradovateAccountName,
        input?.atasAccountId,
        input?.atasAccountName,
        input?.id,
        input?.displayName,
        input?.accountId,
        input?.accountName,
        input?.name,
        input?.label,
    ]

    for (const candidate of candidates) {
        const detected = detectAccountSize(candidate)

        if (detected > 0) {
            return detected
        }
    }

    return 0
}

function resolveInitialStatusForNewAccount(phase, status) {
    const normalizedPhase = normalizeAccountPhase(phase)
    const normalizedStatus = normalizeAccountStatus(status)

    if (normalizedPhase === "eval" && normalizedStatus === "open") {
        return "active"
    }

    return normalizedStatus
}

function normalizeImportType(type) {
    const safeType = cleanString(type)

    if (safeType === "dailySummary") {
        return "cashHistory"
    }

    if (CSV_IMPORT_KEYS.includes(safeType)) {
        return safeType
    }

    return ""
}

function cloneCsvImportEntry(type, source = {}) {
    return {
        ...createEmptyCsvImport(type),
        ...(source || {}),
        type,
        fileName: cleanString(source?.fileName),
        importedAt: cleanString(source?.importedAt),
        headers: Array.isArray(source?.headers) ? source.headers : [],
        rows: Array.isArray(source?.rows) ? source.rows : [],
        previewRows: Array.isArray(source?.previewRows) ? source.previewRows : [],
        rawText: String(source?.rawText || ""),
        appAccountId: cleanString(source?.appAccountId),
        appAccountName: cleanString(source?.appAccountName),
        tradingAccountId: cleanString(source?.tradingAccountId),
        tradingAccountName: cleanString(source?.tradingAccountName),
        tradingAccountKey: cleanString(source?.tradingAccountKey),
        csvAccountRaw: cleanString(source?.csvAccountRaw),
    }
}

function normalizeCsvImportsShape(value) {
    return normalizeProviderImportsShape(value)
}

function getPreferredCsvImportMeta(value) {
    const normalizedImports = normalizeCsvImportsShape(value)

    const candidates = [
        normalizedImports.cashHistory,
        normalizedImports.trades,
        normalizedImports.orders,
        normalizedImports.performance,
        normalizedImports.positionHistory,
    ]

    for (const entry of candidates) {
        const tradingAccountId = cleanString(entry?.tradingAccountId || entry?.csvAccountRaw)
        const tradingAccountName = cleanString(entry?.tradingAccountName || tradingAccountId)
        const tradingAccountKey = cleanString(
            entry?.tradingAccountKey ||
            normalizeAccountLookup(tradingAccountId || tradingAccountName)
        )

        if (tradingAccountId || tradingAccountName) {
            return {
                appAccountId: cleanString(entry?.appAccountId),
                appAccountName: cleanString(entry?.appAccountName),
                tradingAccountId,
                tradingAccountName,
                tradingAccountKey,
                csvAccountRaw: cleanString(entry?.csvAccountRaw),
            }
        }
    }

    return {
        appAccountId: "",
        appAccountName: "",
        tradingAccountId: "",
        tradingAccountName: "",
        tradingAccountKey: "",
        csvAccountRaw: "",
    }
}
function resolveLegacyGroupId(account) {
    return cleanString(
        account?.accountGroupId ||
        account?.groupId ||
        account?.linkedGroupId ||
        account?.pairId ||
        account?.linkId
    )
}

function buildFallbackGroupId(account) {
    const mode = normalizeProductType(
        account?.productType ||
        account?.mode ||
        account?.challengeMode
    )
    const phase = normalizeAccountPhase(
        account?.accountPhase ||
        account?.phase
    )
    const displaySeed = cleanString(
        account?.tradingAccountId ||
        account?.displayName ||
        account?.name ||
        account?.accountName ||
        account?.id
    )

    const numberMatch = displaySeed.match(/\d{5,}/g)
    const suffix = numberMatch?.[numberMatch.length - 1] || cleanString(account?.id)

    if (phase === "eval" && suffix) {
        return `group_${mode}_${suffix}`
    }

    if (phase === "pa" && cleanString(account?.linkedEvalAccountId)) {
        return `group_${mode}_${cleanString(account.linkedEvalAccountId)}`
    }

    return suffix ? `group_${mode}_${suffix}` : ""
}

function resolveAccountGroupId(account) {
    return resolveLegacyGroupId(account) || buildFallbackGroupId(account)
}

function buildTradovateSourcePayloadFromAccount(base = {}, defaults = {}) {
    return {
        ...base,
        tradovateAccountId: cleanString(
            defaults.tradovateAccountId ||
            base.tradovateAccountId ||
            base.tradingAccountId
        ),
        tradovateAccountName: cleanString(
            defaults.tradovateAccountName ||
            base.tradovateAccountName ||
            base.tradingAccountName ||
            base.displayName
        ),
        tradingAccountId: cleanString(
            defaults.tradingAccountId ||
            base.tradingAccountId ||
            base.tradovateAccountId
        ),
        tradingAccountName: cleanString(
            defaults.tradingAccountName ||
            base.tradingAccountName ||
            base.tradovateAccountName ||
            base.displayName
        ),
    }
}

function normalizeAccount(account) {
    const base = {
        ...DEFAULT_ACCOUNT,
        ...(account || {}),
    }

    const normalizedDisplayName = cleanString(
        base.displayName ||
        base.name ||
        base.accountName ||
        base.label ||
        base.id
    )

    const normalizedProductType = normalizeProductType(
        base.productType || base.mode || base.challengeMode
    )

    const normalizedPhase = normalizeAccountPhase(
        base.accountPhase || base.phase
    )

    const normalizedTradingAccountId = cleanString(
        base.tradingAccountId ||
        resolveTradingAccountIdFromAccountLike({
            ...base,
            displayName: normalizedDisplayName,
        })
    )

    const normalizedTradingAccountName = cleanString(
        base.tradingAccountName ||
        resolveTradingAccountNameFromAccountLike(
            {
                ...base,
                displayName: normalizedDisplayName,
                tradingAccountId: normalizedTradingAccountId,
            },
            normalizedTradingAccountId
        )
    )

    const normalizedTradingAccountKey = normalizeAccountLookup(
        base.tradingAccountKey ||
        normalizedTradingAccountId ||
        normalizedTradingAccountName
    )

    const normalizedTradovateAccountId = cleanString(
        base.tradovateAccountId ||
        normalizedTradingAccountId
    )

    const normalizedTradovateAccountName = cleanString(
        base.tradovateAccountName ||
        normalizedTradingAccountName ||
        normalizedDisplayName
    )

    const incomingProvider = normalizeDataProvider(
        base.dataProvider ||
        base.source?.provider ||
        "tradovate"
    )

    const normalizedAtasAccountId = cleanString(
        base.atasAccountId ||
        (incomingProvider === "atas"
            ? base.dataProviderAccountId || base.source?.accountId
            : "")
    )

    const normalizedAtasAccountName = cleanString(
        base.atasAccountName ||
        (incomingProvider === "atas"
            ? base.dataProviderAccountName || base.source?.accountName || normalizedDisplayName
            : "")
    )

    const normalizedLastSyncAt = cleanString(
        base.lastSyncAt ||
        base.source?.lastSyncAt
    )

    const normalizedDataProvider = incomingProvider
    const normalizedDataProviderType = normalizeDataProviderType(
        base.dataProviderType || base.source?.type || "",
        normalizedDataProvider
    )
    const normalizedDataProviderStatus = normalizeDataProviderStatus(
        base.dataProviderStatus || base.source?.status || "",
        getDefaultDataProviderStatus(normalizedDataProvider)
    )

    const normalizedDataProviderAccountId = cleanString(
        base.dataProviderAccountId ||
        base.source?.accountId ||
        (normalizedDataProvider === "atas"
            ? normalizedAtasAccountId
            : normalizedTradovateAccountId)
    )

    const normalizedDataProviderAccountName = cleanString(
        base.dataProviderAccountName ||
        base.source?.accountName ||
        (normalizedDataProvider === "atas"
            ? normalizedAtasAccountName
            : normalizedTradovateAccountName || normalizedDisplayName)
    )

    const detectedAccountSize = resolveDetectedAccountSizeFromAccountLike({
        ...base,
        displayName: normalizedDisplayName,
        tradingAccountId: normalizedTradingAccountId,
        tradingAccountName: normalizedTradingAccountName,
        tradovateAccountId: normalizedTradovateAccountId,
        tradovateAccountName: normalizedTradovateAccountName,
        atasAccountId: normalizedAtasAccountId,
        atasAccountName: normalizedAtasAccountName,
    })

    const normalizedAccountSize = normalizeAccountSize(
        toNumber(base.accountSize, 0) ||
        toNumber(base.startingBalance, 0) ||
        toNumber(base.currentBalance, 0),
        detectedAccountSize
    ) || detectedAccountSize

    const normalizedStartingBalance =
        toNumber(base.startingBalance, 0) || normalizedAccountSize
    const normalizedCurrentBalance =
        toNumber(base.currentBalance, 0) || normalizedStartingBalance

    const normalizedSource = {
        ...buildProviderSourceFromAccount(
            {
                ...buildTradovateSourcePayloadFromAccount(base, {
                    tradovateAccountId: normalizedTradovateAccountId,
                    tradovateAccountName: normalizedTradovateAccountName,
                    tradingAccountId: normalizedTradingAccountId,
                    tradingAccountName: normalizedTradingAccountName,
                }),
                displayName: normalizedDisplayName,
                atasAccountId: normalizedAtasAccountId,
                atasAccountName: normalizedAtasAccountName,
                dataProvider: normalizedDataProvider,
                dataProviderType: normalizedDataProviderType,
                dataProviderStatus: normalizedDataProviderStatus,
                dataProviderAccountId: normalizedDataProviderAccountId,
                dataProviderAccountName: normalizedDataProviderAccountName,
                lastSyncAt: normalizedLastSyncAt,
            },
            normalizedDataProvider
        ),
        provider: normalizedDataProvider,
        type: normalizedDataProviderType,
        status: normalizedDataProviderStatus,
        accountId: normalizedDataProviderAccountId,
        accountName: normalizedDataProviderAccountName,
        lastSyncAt: normalizedLastSyncAt,
    }

    return {
        ...base,
        id: cleanString(base.id),
        displayName: normalizedDisplayName,
        tradingAccountId: normalizedTradingAccountId,
        tradingAccountName: normalizedTradingAccountName,
        tradingAccountKey: normalizedTradingAccountKey,
        tradovateAccountId: normalizedTradovateAccountId,
        tradovateAccountName: normalizedTradovateAccountName,
        atasAccountId: normalizedAtasAccountId,
        atasAccountName: normalizedAtasAccountName,
        dataProvider: normalizedDataProvider,
        dataProviderType: normalizedDataProviderType,
        dataProviderStatus: normalizedDataProviderStatus,
        dataProviderAccountId: normalizedDataProviderAccountId,
        dataProviderAccountName: normalizedDataProviderAccountName,
        lastSyncAt: normalizedLastSyncAt,
        source: normalizedSource,
        productType: normalizedProductType,
        accountPhase: normalizedPhase,
        accountStatus: normalizeAccountStatus(base.accountStatus || base.status),
        accountSize: normalizedAccountSize,
        startingBalance: normalizedStartingBalance,
        currentBalance: normalizedCurrentBalance,
        accountGroupId: cleanString(
            resolveAccountGroupId({
                ...base,
                displayName: normalizedDisplayName,
                tradingAccountId: normalizedTradingAccountId,
                tradingAccountName: normalizedTradingAccountName,
                productType: normalizedProductType,
                accountPhase: normalizedPhase,
            })
        ),
        linkedEvalAccountId: cleanString(base.linkedEvalAccountId),
        linkedPaAccountIds: unique(base.linkedPaAccountIds),
        slotState: normalizeSlotState(base.slotState),
        createdAt: cleanString(base.createdAt),
        updatedAt: cleanString(base.updatedAt),
        statusChangedAt: cleanString(base.statusChangedAt),
        phaseChangedAt: cleanString(base.phaseChangedAt),
        linkedAt: cleanString(base.linkedAt),
        unlinkedAt: cleanString(base.unlinkedAt),
        activatedAt: cleanString(base.activatedAt),
        passedAt: cleanString(base.passedAt),
        failedAt: cleanString(base.failedAt),
        archivedAt: cleanString(base.archivedAt),
        lifecycleVersion: toNumber(base.lifecycleVersion, 2),
        history: sortHistory(base.history),
        riskStatus:
            base.riskStatus &&
                typeof base.riskStatus === "object" &&
                !Array.isArray(base.riskStatus)
                ? clone(base.riskStatus)
                : null,
    }
}

function mergeAccountWithImportMeta(account, csvImports = {}) {
    const safeAccount = normalizeAccount(account)
    const importMeta = getPreferredCsvImportMeta(csvImports)

    const tradingAccountId = cleanString(
        safeAccount.tradingAccountId ||
        importMeta.tradingAccountId ||
        importMeta.csvAccountRaw
    )

    const tradingAccountName = cleanString(
        safeAccount.tradingAccountName ||
        importMeta.tradingAccountName ||
        importMeta.csvAccountRaw ||
        tradingAccountId
    )

    const tradingAccountKey = normalizeAccountLookup(
        safeAccount.tradingAccountKey ||
        importMeta.tradingAccountKey ||
        tradingAccountId ||
        tradingAccountName
    )

    const tradovateAccountId = cleanString(
        safeAccount.tradovateAccountId ||
        tradingAccountId
    )

    const tradovateAccountName = cleanString(
        safeAccount.tradovateAccountName ||
        tradingAccountName
    )

    const isTradovateActive = getAccountDataProvider(safeAccount) === "tradovate"

    return normalizeAccount({
        ...safeAccount,
        tradingAccountId,
        tradingAccountName,
        tradingAccountKey,
        tradovateAccountId,
        tradovateAccountName,
        dataProviderAccountId: isTradovateActive
            ? cleanString(safeAccount.dataProviderAccountId || tradovateAccountId)
            : cleanString(safeAccount.dataProviderAccountId),
        dataProviderAccountName: isTradovateActive
            ? cleanString(safeAccount.dataProviderAccountName || tradovateAccountName)
            : cleanString(safeAccount.dataProviderAccountName),
        source: isTradovateActive
            ? {
                ...(safeAccount.source || {}),
                accountId: cleanString(
                    safeAccount.source?.accountId || tradovateAccountId
                ),
                accountName: cleanString(
                    safeAccount.source?.accountName || tradovateAccountName
                ),
            }
            : safeAccount.source,
    })
}

function normalizeDailyState(state) {
    const base = {
        ...DEFAULT_DAILY_STATE,
        ...(state || {}),
    }

    return {
        ...base,
        sessionKey: cleanString(base.sessionKey),
        tradingDate: cleanString(base.tradingDate),
        lastResetAt: cleanString(base.lastResetAt),
        dailyPnL: toNumber(base.dailyPnL, 0),
        realizedPnL: toNumber(base.realizedPnL, 0),
        unrealizedPnL: toNumber(base.unrealizedPnL, 0),
        startingBalance: toNumber(base.startingBalance, 0),
        currentBalance: toNumber(base.currentBalance, 0),
        liquidationPrice: toNumber(base.liquidationPrice, 0),
        liquidationPriceBreached: toBoolean(base.liquidationPriceBreached),
        stopRiskViolation: toBoolean(base.stopRiskViolation),
        trailingDrawdownViolation: toBoolean(base.trailingDrawdownViolation),
        isLocked: toBoolean(base.isLocked),
        drawdownLimit: toNumber(base.drawdownLimit, 0),
        maxDailyLoss: toNumber(base.maxDailyLoss, 0),
        openPositionCount: toNumber(base.openPositionCount, 0),
        openOrderCount: toNumber(base.openOrderCount, 0),
    }
}

function normalizeMapSection(section) {
    if (!section || typeof section !== "object") {
        return {}
    }

    return Object.entries(section).reduce((accumulator, [key, value]) => {
        const accountId = cleanString(key)

        if (!accountId) {
            return accumulator
        }

        accumulator[accountId] = value
        return accumulator
    }, {})
}

function normalizeDailyStateMap(section) {
    if (!section || typeof section !== "object") {
        return {}
    }

    return Object.entries(section).reduce((accumulator, [key, value]) => {
        const accountId = cleanString(key)

        if (!accountId) {
            return accumulator
        }

        accumulator[accountId] = normalizeDailyState(value)
        return accumulator
    }, {})
}

function normalizeCsvImportsMap(section) {
    if (!section || typeof section !== "object") {
        return {}
    }

    return Object.entries(section).reduce((accumulator, [key, value]) => {
        const accountId = cleanString(key)

        if (!accountId) {
            return accumulator
        }

        accumulator[accountId] = normalizeCsvImportsShape(value)
        return accumulator
    }, {})
}

function buildLegacyTradovateProviderBucket(data, accountId, account = null) {
    const id = cleanString(accountId)
    const safeAccount = account || findAccount(data?.accounts, id) || null
    const legacyCsvImports = normalizeCsvImportsShape(
        data?.csvImportsByAccount?.[id] || {}
    )

    return buildEmptyProviderBucket("tradovate", {
        source: buildProviderSourceFromAccount(safeAccount || {}, "tradovate"),
        status: cleanString(
            safeAccount?.dataProviderStatus ||
            safeAccount?.source?.status ||
            "ready"
        ) || "ready",
        lastSyncAt: cleanString(
            safeAccount?.lastSyncAt ||
            safeAccount?.source?.lastSyncAt ||
            legacyCsvImports?.cashHistory?.importedAt
        ),
        orders: Array.isArray(data?.ordersByAccount?.[id]) ? data.ordersByAccount[id] : [],
        fills: Array.isArray(data?.fillsByAccount?.[id]) ? data.fillsByAccount[id] : [],
        balanceHistory: Array.isArray(data?.cashHistoryByAccount?.[id])
            ? data.cashHistoryByAccount[id]
            : [],
        performance: Array.isArray(data?.providerDataByAccount?.[id]?.tradovate?.performance) &&
            data.providerDataByAccount[id].tradovate.performance.length
            ? data.providerDataByAccount[id].tradovate.performance
            : (Array.isArray(legacyCsvImports?.performance?.rows)
                ? legacyCsvImports.performance.rows
                : []),
        positionHistory: Array.isArray(data?.providerDataByAccount?.[id]?.tradovate?.positionHistory) &&
            data.providerDataByAccount[id].tradovate.positionHistory.length
            ? data.providerDataByAccount[id].tradovate.positionHistory
            : (Array.isArray(legacyCsvImports?.positionHistory?.rows)
                ? legacyCsvImports.positionHistory.rows
                : []),
        csvImports: legacyCsvImports,
    })
}

function getProviderBucketFromData(data, accountId, providerOverride = "", accountOverride = null) {
    const id = cleanString(accountId)
    const safeData = data || DEFAULT_DATA
    const safeAccount = accountOverride || findAccount(safeData?.accounts, id) || null
    const provider = normalizeDataProvider(
        providerOverride || getAccountDataProvider(safeAccount)
    )
    const storedProviderData = safeData?.providerDataByAccount?.[id]?.[provider]

    if (storedProviderData && typeof storedProviderData === "object" && Object.keys(storedProviderData).length) {
        const legacyTradovateCsvImports = provider === "tradovate"
            ? normalizeCsvImportsShape(
                storedProviderData?.csvImports ||
                safeData?.csvImportsByAccount?.[id] ||
                {}
            )
            : normalizeCsvImportsShape(storedProviderData?.csvImports || {})

        return buildEmptyProviderBucket(provider, {
            ...storedProviderData,
            source: {
                ...buildProviderSourceFromAccount(safeAccount || {}, provider),
                ...(storedProviderData.source || {}),
            },
            status: cleanString(
                storedProviderData.status ||
                storedProviderData.source?.status ||
                safeAccount?.dataProviderStatus ||
                getDefaultDataProviderStatus(provider)
            ),
            lastSyncAt: cleanString(
                storedProviderData.lastSyncAt ||
                storedProviderData.source?.lastSyncAt ||
                safeAccount?.lastSyncAt
            ),
            orders: Array.isArray(storedProviderData.orders) ? storedProviderData.orders : [],
            fills: Array.isArray(storedProviderData.fills) ? storedProviderData.fills : [],
            balanceHistory: Array.isArray(storedProviderData.balanceHistory) ? storedProviderData.balanceHistory : [],
            performance:
                Array.isArray(storedProviderData.performance) && storedProviderData.performance.length
                    ? storedProviderData.performance
                    : (provider === "tradovate"
                        ? toArrayRows(legacyTradovateCsvImports?.performance?.rows)
                        : []),
            positionHistory:
                Array.isArray(storedProviderData.positionHistory) && storedProviderData.positionHistory.length
                    ? storedProviderData.positionHistory
                    : (provider === "tradovate"
                        ? toArrayRows(legacyTradovateCsvImports?.positionHistory?.rows)
                        : []),
            csvImports: legacyTradovateCsvImports,
        })
    }

    if (provider === "tradovate") {
        return buildLegacyTradovateProviderBucket(safeData, id, safeAccount)
    }

    return buildEmptyProviderBucket("atas", {
        source: buildProviderSourceFromAccount(safeAccount || {}, "atas"),
        status: cleanString(
            safeAccount?.dataProviderStatus ||
            safeAccount?.source?.status ||
            "disconnected"
        ) || "disconnected",
        lastSyncAt: cleanString(
            safeAccount?.lastSyncAt ||
            safeAccount?.source?.lastSyncAt
        ),
    })
}

function ensureProviderBucketForAccount(data, accountId, providerOverride = "", accountOverride = null) {
    const id = cleanString(accountId)

    if (!id) {
        return buildEmptyProviderBucket("tradovate")
    }

    if (!data.providerDataByAccount || typeof data.providerDataByAccount !== "object") {
        data.providerDataByAccount = {}
    }

    if (!data.providerDataByAccount[id] || typeof data.providerDataByAccount[id] !== "object") {
        data.providerDataByAccount[id] = buildEmptyProviderData()
    }

    const bucket = getProviderBucketFromData(data, id, providerOverride, accountOverride)
    const provider = normalizeDataProvider(
        providerOverride ||
        getAccountDataProvider(accountOverride || findAccount(data.accounts, id))
    )

    data.providerDataByAccount[id] = {
        ...buildEmptyProviderData(),
        ...(data.providerDataByAccount[id] || {}),
        [provider]: bucket,
    }

    return data.providerDataByAccount[id][provider]
}

function ensureAllProviderBucketsForAccount(data, accountId, accountOverride = null) {
    const id = cleanString(accountId)

    if (!id) {
        return buildEmptyProviderData()
    }

    if (!data.providerDataByAccount || typeof data.providerDataByAccount !== "object") {
        data.providerDataByAccount = {}
    }

    const tradovate = ensureProviderBucketForAccount(
        data,
        id,
        "tradovate",
        accountOverride
    )
    const atas = ensureProviderBucketForAccount(
        data,
        id,
        "atas",
        accountOverride
    )

    data.providerDataByAccount[id] = {
        tradovate,
        atas,
    }

    return data.providerDataByAccount[id]
}

function syncLegacySectionsFromTradovateBucket(data, accountId) {
    const id = cleanString(accountId)

    if (!id) {
        return
    }

    const tradovateBucket = getProviderBucketFromData(data, id, "tradovate")

    data.ordersByAccount = {
        ...(data.ordersByAccount || {}),
        [id]: clone(tradovateBucket.orders || []),
    }

    data.fillsByAccount = {
        ...(data.fillsByAccount || {}),
        [id]: clone(tradovateBucket.fills || []),
    }

    data.cashHistoryByAccount = {
        ...(data.cashHistoryByAccount || {}),
        [id]: clone(tradovateBucket.balanceHistory || []),
    }

    data.csvImportsByAccount = {
        ...(data.csvImportsByAccount || {}),
        [id]: normalizeCsvImportsShape(tradovateBucket.csvImports || {}),
    }
}
function resolveProviderForAccountWrite(data, accountId, providerOverride = "") {
    const id = cleanString(accountId)
    const account = findAccount(data?.accounts, id)
    return normalizeDataProvider(
        providerOverride || getAccountDataProvider(account)
    )
}

function setProviderSectionData(data, accountId, sectionName, value, providerOverride = "") {
    const id = cleanString(accountId)

    if (!id) {
        return clone(value)
    }

    const provider = resolveProviderForAccountWrite(data, id, providerOverride)
    const account = findAccount(data.accounts, id)
    const bucket = ensureProviderBucketForAccount(data, id, provider, account)

    bucket[sectionName] = clone(value)

    if (provider === "tradovate") {
        syncLegacySectionsFromTradovateBucket(data, id)
    }

    return clone(value)
}

function getProviderSectionData(data, accountId, sectionName, fallback = [], providerOverride = "") {
    const id = cleanString(accountId)

    if (!id) {
        return clone(fallback)
    }

    const bucket = getProviderBucketFromData(data, id, providerOverride)

    if (Array.isArray(bucket?.[sectionName])) {
        return clone(bucket[sectionName])
    }

    return clone(fallback)
}

function normalizeProviderDataByAccountMap(baseData, accounts) {
    const result = {}
    const ids = new Set()

        ; (accounts || []).forEach((account) => {
            const id = cleanString(account?.id)

            if (id) {
                ids.add(id)
            }
        })

    Object.keys(baseData?.providerDataByAccount || {}).forEach((id) => {
        const safeId = cleanString(id)

        if (safeId) {
            ids.add(safeId)
        }
    })

    Object.keys(baseData?.ordersByAccount || {}).forEach((id) => {
        const safeId = cleanString(id)

        if (safeId) {
            ids.add(safeId)
        }
    })

    Object.keys(baseData?.fillsByAccount || {}).forEach((id) => {
        const safeId = cleanString(id)

        if (safeId) {
            ids.add(safeId)
        }
    })

    Object.keys(baseData?.cashHistoryByAccount || {}).forEach((id) => {
        const safeId = cleanString(id)

        if (safeId) {
            ids.add(safeId)
        }
    })

    Object.keys(baseData?.csvImportsByAccount || {}).forEach((id) => {
        const safeId = cleanString(id)

        if (safeId) {
            ids.add(safeId)
        }
    })

    ids.forEach((id) => {
        const account = findAccount(accounts, id)
        result[id] = {
            tradovate: getProviderBucketFromData(baseData, id, "tradovate", account),
            atas: getProviderBucketFromData(baseData, id, "atas", account),
        }
    })

    return result
}

function normalizeData(data) {
    const base = {
        ...DEFAULT_DATA,
        ...(data || {}),
    }

    const normalizedCsvImportsByAccount = normalizeCsvImportsMap(base.csvImportsByAccount)

    const normalizedAccounts = Array.isArray(base.accounts)
        ? base.accounts
            .map(normalizeAccount)
            .filter((account) => cleanString(account.id))
        : []

    const uniqueAccounts = []
    const seen = new Set()

    for (const account of normalizedAccounts) {
        if (seen.has(account.id)) {
            continue
        }

        seen.add(account.id)
        uniqueAccounts.push(
            mergeAccountWithImportMeta(
                account,
                normalizedCsvImportsByAccount?.[account.id] || {}
            )
        )
    }

    const normalizedProviderDataByAccount = normalizeProviderDataByAccountMap(
        {
            ...base,
            csvImportsByAccount: normalizedCsvImportsByAccount,
        },
        uniqueAccounts
    )

    const normalizedOrdersByAccount = normalizeMapSection(base.ordersByAccount)
    const normalizedFillsByAccount = normalizeMapSection(base.fillsByAccount)
    const normalizedCashHistoryByAccount = normalizeMapSection(base.cashHistoryByAccount)

    Object.entries(normalizedProviderDataByAccount).forEach(([accountId, providerData]) => {
        if (!Array.isArray(normalizedOrdersByAccount[accountId]) || !normalizedOrdersByAccount[accountId].length) {
            normalizedOrdersByAccount[accountId] = clone(providerData?.tradovate?.orders || [])
        }

        if (!Array.isArray(normalizedFillsByAccount[accountId]) || !normalizedFillsByAccount[accountId].length) {
            normalizedFillsByAccount[accountId] = clone(providerData?.tradovate?.fills || [])
        }

        if (!Array.isArray(normalizedCashHistoryByAccount[accountId]) || !normalizedCashHistoryByAccount[accountId].length) {
            normalizedCashHistoryByAccount[accountId] = clone(providerData?.tradovate?.balanceHistory || [])
        }

        if (!normalizedCsvImportsByAccount[accountId]) {
            normalizedCsvImportsByAccount[accountId] = normalizeCsvImportsShape(
                providerData?.tradovate?.csvImports || {}
            )
        }
    })

    return {
        version: DATA_VERSION,
        accounts: uniqueAccounts,
        activeAccountId: cleanString(base.activeAccountId),
        accountProfilesById: normalizeMapSection(base.accountProfilesById),
        ordersByAccount: normalizedOrdersByAccount,
        positionsByAccount: normalizeMapSection(base.positionsByAccount),
        riskByAccount: normalizeMapSection(base.riskByAccount),
        journalByAccount: normalizeMapSection(base.journalByAccount),
        fillsByAccount: normalizedFillsByAccount,
        importedOrdersByAccount: normalizeMapSection(base.importedOrdersByAccount),
        importedTradesByAccount: normalizeMapSection(base.importedTradesByAccount),
        dailySummaryByAccount: normalizeMapSection(base.dailySummaryByAccount),
        dailyStateByAccount: normalizeDailyStateMap(base.dailyStateByAccount),
        accountReportByAccount: normalizeMapSection(base.accountReportByAccount),
        cashHistoryByAccount: normalizedCashHistoryByAccount,
        csvImportsByAccount: normalizedCsvImportsByAccount,
        providerDataByAccount: normalizedProviderDataByAccount,
    }
}

function notifyStorageChange() {
    if (typeof window === "undefined") {
        return
    }

    window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
}

function readData() {
    if (typeof window === "undefined") {
        return normalizeData(DEFAULT_DATA)
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)

        if (!raw) {
            return normalizeData(DEFAULT_DATA)
        }

        return normalizeData(JSON.parse(raw))
    } catch (error) {
        console.error("storage read error", error)
        return normalizeData(DEFAULT_DATA)
    }
}

function writeData(data) {
    const normalized = normalizeData(data)

    if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    }

    notifyStorageChange()
    return normalized
}

function updateData(mutator) {
    const current = readData()
    const draft = clone(current)
    const result = mutator(draft)
    writeData(draft)
    return result
}

function findAccount(accounts, accountId) {
    const id = cleanString(accountId)
    return (accounts || []).find((account) => account.id === id) || null
}

function ensureAccount(accounts, accountId) {
    const account = findAccount(accounts, accountId)

    if (!account) {
        throw new Error(`Account not found: ${accountId}`)
    }

    return account
}

function syncAccountTradingMetaFromImports(data, accountId) {
    const id = cleanString(accountId)

    if (!id) {
        return
    }

    const account = findAccount(data?.accounts, id)

    if (!account) {
        return
    }

    const tradovateImports = normalizeCsvImportsShape(
        data?.providerDataByAccount?.[id]?.tradovate?.csvImports ||
        data?.csvImportsByAccount?.[id] ||
        {}
    )

    const merged = mergeAccountWithImportMeta(
        account,
        tradovateImports
    )

    Object.assign(account, merged)

    const tradovateBucket = ensureProviderBucketForAccount(data, id, "tradovate", account)
    tradovateBucket.source = {
        ...tradovateBucket.source,
        ...buildProviderSourceFromAccount(account, "tradovate"),
        accountId: cleanString(account.tradovateAccountId || account.tradingAccountId),
        accountName: cleanString(account.tradovateAccountName || account.tradingAccountName),
    }

    if (getAccountDataProvider(account) === "tradovate") {
        account.dataProviderAccountId = cleanString(
            account.dataProviderAccountId || account.tradovateAccountId || account.tradingAccountId
        )
        account.dataProviderAccountName = cleanString(
            account.dataProviderAccountName || account.tradovateAccountName || account.tradingAccountName
        )
        account.source = {
            ...(account.source || {}),
            accountId: account.dataProviderAccountId,
            accountName: account.dataProviderAccountName,
        }
    }
}

function pushHistory(account, entry) {
    account.history = sortHistory([...(account.history || []), entry])
    account.updatedAt = entry.createdAt
    account.lifecycleVersion = toNumber(account.lifecycleVersion, 2) + 1
}

function getLinkedPaAccounts(accounts, evalAccountId, productType = "") {
    const evalId = cleanString(evalAccountId)
    const normalizedProductType = productType
        ? normalizeProductType(productType)
        : ""

    if (!evalId) {
        return []
    }

    return (accounts || []).filter((account) => {
        if (normalizeAccountPhase(account.accountPhase) !== "pa") {
            return false
        }

        if (cleanString(account.linkedEvalAccountId) !== evalId) {
            return false
        }

        if (
            normalizedProductType &&
            normalizeProductType(account.productType) !== normalizedProductType
        ) {
            return false
        }

        return true
    })
}

function hasLinkedPaWithStatuses(accounts, evalAccountId, productType, statuses = []) {
    const allowedStatuses = new Set(statuses.map(normalizeAccountStatus))

    return getLinkedPaAccounts(accounts, evalAccountId, productType).some((account) => {
        return allowedStatuses.has(normalizeAccountStatus(account.accountStatus))
    })
}

function shouldArchiveEvalDueToLinkedPa(accounts, evalAccountId, productType) {
    return hasLinkedPaWithStatuses(
        accounts,
        evalAccountId,
        productType,
        ["active", "passed"]
    )
}

function resolveEvalStatusForRules(accounts, account, requestedStatus) {
    if (!account) {
        return normalizeAccountStatus(requestedStatus)
    }

    const phase = normalizeAccountPhase(account.accountPhase)
    const nextStatus = normalizeAccountStatus(requestedStatus)

    if (
        phase === "eval" &&
        shouldArchiveEvalDueToLinkedPa(accounts, account.id, account.productType)
    ) {
        return "archived"
    }

    return nextStatus
}

function archiveEvalFromPaActivation(evalAccount, paAccount) {
    if (!evalAccount) {
        return
    }

    if (normalizeAccountStatus(evalAccount.accountStatus) === "archived") {
        return
    }

    const entry = createHistoryEntry("auto_archived_by_pa_activation", {
        fromStatus: evalAccount.accountStatus,
        toStatus: "archived",
        triggerAccountId: cleanString(paAccount?.id),
        productType: normalizeProductType(evalAccount.productType),
    })

    evalAccount.accountStatus = "archived"
    evalAccount.archivedAt = entry.createdAt
    evalAccount.statusChangedAt = entry.createdAt
    pushHistory(evalAccount, entry)
}

function syncAccountGroupId(evalAccount, paAccount) {
    const existingEvalGroupId = cleanString(evalAccount?.accountGroupId)
    const existingPaGroupId = cleanString(paAccount?.accountGroupId)
    const nextGroupId =
        existingEvalGroupId ||
        existingPaGroupId ||
        buildFallbackGroupId(evalAccount) ||
        buildFallbackGroupId(paAccount) ||
        `group_${cleanString(evalAccount?.id || paAccount?.id)}`

    if (evalAccount) {
        evalAccount.accountGroupId = nextGroupId
    }

    if (paAccount) {
        paAccount.accountGroupId = nextGroupId
    }

    return nextGroupId
}

function enforceAccountLifecycleRules(accounts) {
    const safeAccounts = Array.isArray(accounts) ? accounts : []

    safeAccounts.forEach((account) => {
        if (normalizeAccountPhase(account.accountPhase) !== "pa") {
            return
        }

        const status = normalizeAccountStatus(account.accountStatus)

        if (
            (status === "active" || status === "passed") &&
            cleanString(account.linkedEvalAccountId)
        ) {
            const evalAccount = findAccount(safeAccounts, account.linkedEvalAccountId)

            if (
                evalAccount &&
                normalizeProductType(evalAccount.productType) ===
                normalizeProductType(account.productType)
            ) {
                syncAccountGroupId(evalAccount, account)
                archiveEvalFromPaActivation(evalAccount, account)
            }
        }
    })

    safeAccounts.forEach((account) => {
        if (normalizeAccountPhase(account.accountPhase) !== "eval") {
            return
        }

        if (
            !shouldArchiveEvalDueToLinkedPa(
                safeAccounts,
                account.id,
                account.productType
            )
        ) {
            return
        }

        archiveEvalFromPaActivation(account, null)
    })
}

function detachPaFromPreviousEval(accounts, paAccount, nextEvalId) {
    const previousEvalId = cleanString(paAccount.linkedEvalAccountId)

    if (!previousEvalId || previousEvalId === cleanString(nextEvalId)) {
        return
    }

    const previousEval = findAccount(accounts, previousEvalId)

    if (!previousEval) {
        paAccount.linkedEvalAccountId = ""
        return
    }

    const entry = createHistoryEntry("unlinked_replaced", {
        fromAccountId: previousEval.id,
        toAccountId: cleanString(nextEvalId),
        targetAccountId: paAccount.id,
        productType: normalizeProductType(paAccount.productType),
    })

    previousEval.linkedPaAccountIds = previousEval.linkedPaAccountIds.filter(
        (value) => value !== paAccount.id
    )
    previousEval.unlinkedAt = entry.createdAt
    pushHistory(previousEval, entry)

    paAccount.unlinkedAt = entry.createdAt
    pushHistory(
        paAccount,
        createHistoryEntry("unlinked_replaced", {
            fromAccountId: previousEval.id,
            toAccountId: cleanString(nextEvalId),
            targetAccountId: previousEval.id,
            productType: normalizeProductType(paAccount.productType),
        })
    )

    paAccount.linkedEvalAccountId = ""
}

function getAccountSlotStatus(account) {
    if (!account) {
        return "empty"
    }

    const slotStatus = cleanString(account?.slotState?.status).toLowerCase()

    if (slotStatus) {
        return slotStatus
    }

    return normalizeAccountStatus(account.accountStatus)
}

function buildGroupStatusFromSlots(slots) {
    const accounts = Object.values(slots).filter(Boolean)

    const slotStatuses = accounts.map((account) => getAccountSlotStatus(account))
    const lifecycleStatuses = accounts.map((account) =>
        normalizeAccountStatus(account.accountStatus)
    )

    if (slotStatuses.includes("red") || lifecycleStatuses.includes("failed")) {
        return "failed"
    }

    if (
        lifecycleStatuses.includes("active") &&
        (slots.paEod || slots.paIntraday)
    ) {
        return "pa_active"
    }

    if (lifecycleStatuses.includes("passed") && (slots.paEod || slots.paIntraday)) {
        return "pa_passed"
    }

    if (
        slots.evalEod &&
        normalizeAccountStatus(slots.evalEod.accountStatus) === "passed"
    ) {
        return "eval_eod_passed"
    }

    if (
        slots.evalIntraday &&
        normalizeAccountStatus(slots.evalIntraday.accountStatus) === "passed"
    ) {
        return "eval_intraday_passed"
    }

    if (
        lifecycleStatuses.includes("archived") &&
        !lifecycleStatuses.includes("active")
    ) {
        return "archived"
    }

    if (accounts.length === 0) {
        return "empty"
    }

    return "open"
}

function sortGroupAccounts(accounts) {
    return [...(accounts || [])].sort((left, right) => {
        const leftTime = cleanString(left?.createdAt)
        const rightTime = cleanString(right?.createdAt)
        return leftTime.localeCompare(rightTime)
    })
}

function buildAccountGroupsFromAccounts(accounts, dailyStateByAccount = {}) {
    const normalizedAccounts = [...(accounts || [])]
        .map((account) =>
            decorateAccountWithDerivedSlotState(
                account,
                dailyStateByAccount?.[cleanString(account?.id)] || {}
            )
        )
        .sort((left, right) => {
            const leftTime = cleanString(left?.createdAt)
            const rightTime = cleanString(right?.createdAt)
            return leftTime.localeCompare(rightTime)
        })

    const runtimeGroups = []

    for (const account of normalizedAccounts) {
        const slotKey = getSlotKeyFromPhaseAndProductType(
            account.accountPhase,
            account.productType
        )

        let targetGroup = getCompatibleRuntimeGroup(runtimeGroups, account)

        if (!targetGroup) {
            targetGroup = {
                id:
                    cleanString(account.accountGroupId) ||
                    buildFallbackGroupId(account) ||
                    `group_${cleanString(account.id)}`,
                accounts: [],
                slots: createEmptyGroupSlots(),
                providerKey: getAccountProvider(account),
                sizeKey: getRuntimeGroupSizeKey(account),
            }

            runtimeGroups.push(targetGroup)
        }

        targetGroup.accounts.push(account)

        if (!targetGroup.slots[slotKey]) {
            targetGroup.slots[slotKey] = account
        } else {
            const existing = targetGroup.slots[slotKey]
            const existingTime = cleanString(existing?.createdAt)
            const incomingTime = cleanString(account?.createdAt)

            if (!existingTime || incomingTime > existingTime) {
                targetGroup.slots[slotKey] = account
            }
        }
    }
    const groups = runtimeGroups.map((group) => {
        const sortedAccounts = sortGroupAccounts(group.accounts)
        const decoratedAccounts = sortedAccounts.map((account) =>
            decorateAccountWithDerivedSlotState(
                account,
                dailyStateByAccount?.[account.id] || {}
            )
        )

        const slots = {
            evalEod: group.slots.evalEod
                ? decorateAccountWithDerivedSlotState(
                    group.slots.evalEod,
                    dailyStateByAccount?.[group.slots.evalEod.id] || {}
                )
                : null,
            paEod: group.slots.paEod
                ? decorateAccountWithDerivedSlotState(
                    group.slots.paEod,
                    dailyStateByAccount?.[group.slots.paEod.id] || {}
                )
                : null,
            evalIntraday: group.slots.evalIntraday
                ? decorateAccountWithDerivedSlotState(
                    group.slots.evalIntraday,
                    dailyStateByAccount?.[group.slots.evalIntraday.id] || {}
                )
                : null,
            paIntraday: group.slots.paIntraday
                ? decorateAccountWithDerivedSlotState(
                    group.slots.paIntraday,
                    dailyStateByAccount?.[group.slots.paIntraday.id] || {}
                )
                : null,
        }

        const primaryAccount =
            slots.evalEod ||
            slots.paEod ||
            slots.evalIntraday ||
            slots.paIntraday ||
            decoratedAccounts[0] ||
            null

        return {
            id: group.id,
            title:
                cleanString(primaryAccount?.tradingAccountName) ||
                cleanString(primaryAccount?.displayName) ||
                cleanString(primaryAccount?.id) ||
                cleanString(group.id),
            accounts: decoratedAccounts,
            slots,
            evalAccount: slots.evalEod || slots.evalIntraday || null,
            paAccount: slots.paEod || slots.paIntraday || null,
            groupStatus: buildGroupStatusFromSlots(slots),
        }
    })

    return groups.sort((left, right) => {
        const leftTime =
            cleanString(left?.slots?.evalEod?.createdAt) ||
            cleanString(left?.slots?.paEod?.createdAt) ||
            cleanString(left?.slots?.evalIntraday?.createdAt) ||
            cleanString(left?.slots?.paIntraday?.createdAt)

        const rightTime =
            cleanString(right?.slots?.evalEod?.createdAt) ||
            cleanString(right?.slots?.paEod?.createdAt) ||
            cleanString(right?.slots?.evalIntraday?.createdAt) ||
            cleanString(right?.slots?.paIntraday?.createdAt)

        return rightTime.localeCompare(leftTime)
    })
}

function getSection(sectionName, accountId, fallback) {
    const data = readData()
    const id = cleanString(accountId)

    if (!id) {
        return clone(fallback)
    }

    const section = data[sectionName] || {}
    return clone(section[id] ?? fallback)
}

function saveSection(sectionName, accountId, value) {
    const id = cleanString(accountId)

    if (!id) {
        return clone(value)
    }

    return updateData((data) => {
        data[sectionName] = {
            ...(data[sectionName] || {}),
            [id]: clone(value),
        }

        return clone(value)
    })
}

function clearSection(sectionName, accountId, fallbackValue) {
    const id = cleanString(accountId)

    if (!id) {
        return clone(fallbackValue)
    }

    return updateData((data) => {
        data[sectionName] = {
            ...(data[sectionName] || {}),
            [id]: clone(fallbackValue),
        }

        return clone(fallbackValue)
    })
}

function removeSectionAccount(sectionName, accountId, data) {
    const id = cleanString(accountId)

    if (!id) {
        return
    }

    if (!data[sectionName] || typeof data[sectionName] !== "object") {
        return
    }

    delete data[sectionName][id]
}

function applyAccountUpdates(account, updates = {}) {
    const timestamp = nowIso()

    const nextDisplayName =
        Object.prototype.hasOwnProperty.call(updates, "displayName")
            ? cleanString(updates.displayName)
            : Object.prototype.hasOwnProperty.call(updates, "name")
                ? cleanString(updates.name)
                : account.displayName

    const nextProductType =
        Object.prototype.hasOwnProperty.call(updates, "productType")
            ? normalizeProductType(updates.productType)
            : Object.prototype.hasOwnProperty.call(updates, "mode")
                ? normalizeProductType(updates.mode)
                : account.productType

    const nextPhase =
        Object.prototype.hasOwnProperty.call(updates, "accountPhase")
            ? normalizeAccountPhase(updates.accountPhase)
            : Object.prototype.hasOwnProperty.call(updates, "phase")
                ? normalizeAccountPhase(updates.phase)
                : account.accountPhase

    const nextStatus =
        Object.prototype.hasOwnProperty.call(updates, "accountStatus")
            ? normalizeAccountStatus(updates.accountStatus)
            : account.accountStatus

    account.displayName = nextDisplayName
    account.productType = nextProductType
    account.accountGroupId = cleanString(
        updates.accountGroupId ||
        account.accountGroupId ||
        buildFallbackGroupId({
            ...account,
            displayName: nextDisplayName,
            productType: nextProductType,
            accountPhase: nextPhase,
        })
    )

    if (Object.prototype.hasOwnProperty.call(updates, "tradingAccountId")) {
        account.tradingAccountId = cleanString(updates.tradingAccountId)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "tradingAccountName")) {
        account.tradingAccountName = cleanString(updates.tradingAccountName)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "tradingAccountKey")) {
        account.tradingAccountKey = cleanString(updates.tradingAccountKey)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "tradovateAccountId")) {
        account.tradovateAccountId = cleanString(updates.tradovateAccountId)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "tradovateAccountName")) {
        account.tradovateAccountName = cleanString(updates.tradovateAccountName)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "atasAccountId")) {
        account.atasAccountId = cleanString(updates.atasAccountId)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "atasAccountName")) {
        account.atasAccountName = cleanString(updates.atasAccountName)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "dataProvider")) {
        account.dataProvider = normalizeDataProvider(updates.dataProvider)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "dataProviderType")) {
        account.dataProviderType = normalizeDataProviderType(
            updates.dataProviderType,
            account.dataProvider
        )
    }

    if (Object.prototype.hasOwnProperty.call(updates, "dataProviderStatus")) {
        account.dataProviderStatus = normalizeDataProviderStatus(
            updates.dataProviderStatus,
            getDefaultDataProviderStatus(account.dataProvider)
        )
    }

    if (Object.prototype.hasOwnProperty.call(updates, "dataProviderAccountId")) {
        account.dataProviderAccountId = cleanString(updates.dataProviderAccountId)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "dataProviderAccountName")) {
        account.dataProviderAccountName = cleanString(updates.dataProviderAccountName)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "lastSyncAt")) {
        account.lastSyncAt = cleanString(updates.lastSyncAt)
    }

    if (
        Object.prototype.hasOwnProperty.call(updates, "source") &&
        updates.source &&
        typeof updates.source === "object"
    ) {
        account.source = {
            ...(account.source || {}),
            ...updates.source,
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "accountSize")) {
        account.accountSize = toNumber(updates.accountSize, account.accountSize)
    }

    if (Object.prototype.hasOwnProperty.call(updates, "startingBalance")) {
        account.startingBalance = toNumber(
            updates.startingBalance,
            account.startingBalance
        )
    }

    if (
        Object.prototype.hasOwnProperty.call(updates, "currentBalance") ||
        Object.prototype.hasOwnProperty.call(updates, "balance")
    ) {
        account.currentBalance = toNumber(
            updates.currentBalance ?? updates.balance,
            account.currentBalance
        )
    }

    if (Object.prototype.hasOwnProperty.call(updates, "riskStatus")) {
        account.riskStatus =
            updates.riskStatus &&
                typeof updates.riskStatus === "object" &&
                !Array.isArray(updates.riskStatus)
                ? clone(updates.riskStatus)
                : null
    }

    if (Object.prototype.hasOwnProperty.call(updates, "slotState")) {
        account.slotState = normalizeSlotState(updates.slotState)
    }

    const detectedAccountSize = resolveDetectedAccountSizeFromAccountLike({
        ...account,
        ...updates,
        displayName: nextDisplayName,
        accountId: updates.accountId || account.id,
        accountName: updates.accountName || nextDisplayName,
        name: updates.name || nextDisplayName,
        label: updates.label || nextDisplayName,
        tradingAccountId:
            updates.tradingAccountId ??
            account.tradingAccountId,
        tradingAccountName:
            updates.tradingAccountName ??
            account.tradingAccountName,
        tradovateAccountId:
            updates.tradovateAccountId ??
            account.tradovateAccountId,
        tradovateAccountName:
            updates.tradovateAccountName ??
            account.tradovateAccountName,
        atasAccountId:
            updates.atasAccountId ??
            account.atasAccountId,
        atasAccountName:
            updates.atasAccountName ??
            account.atasAccountName,
    })

    const repairedAccountSize = normalizeAccountSize(
        account.accountSize || account.startingBalance || account.currentBalance,
        detectedAccountSize ||
        account.accountSize ||
        account.startingBalance ||
        account.currentBalance
    )

    if (repairedAccountSize > 0) {
        account.accountSize = repairedAccountSize
    }

    if (!toNumber(account.startingBalance, 0) && account.accountSize > 0) {
        account.startingBalance = account.accountSize
    }

    if (!toNumber(account.currentBalance, 0) && account.startingBalance > 0) {
        account.currentBalance = account.startingBalance
    }

    if (account.accountPhase !== nextPhase) {
        const phaseEntry = createHistoryEntry("phase_changed", {
            fromPhase: account.accountPhase,
            toPhase: nextPhase,
        })

        account.accountPhase = nextPhase
        account.phaseChangedAt = phaseEntry.createdAt
        pushHistory(account, phaseEntry)
    }

    if (account.accountStatus !== nextStatus) {
        const statusEntry = createHistoryEntry("status_changed", {
            fromStatus: account.accountStatus,
            toStatus: nextStatus,
        })

        account.accountStatus = nextStatus
        account.statusChangedAt = statusEntry.createdAt

        if (nextStatus === "active") {
            account.activatedAt = statusEntry.createdAt
        }

        if (nextStatus === "passed") {
            account.passedAt = statusEntry.createdAt
        }

        if (nextStatus === "failed") {
            account.failedAt = statusEntry.createdAt
        }

        if (nextStatus === "archived") {
            account.archivedAt = statusEntry.createdAt
        }

        pushHistory(account, statusEntry)
    }

    const normalizedAccount = normalizeAccount(account)
    Object.assign(account, normalizedAccount, {
        updatedAt: timestamp,
    })
}

export function subscribeStorage(callback) {
    if (typeof window === "undefined") {
        return () => { }
    }

    const handler = () => {
        callback(readData())
    }

    window.addEventListener(STORAGE_EVENT, handler)
    window.addEventListener("storage", handler)

    return () => {
        window.removeEventListener(STORAGE_EVENT, handler)
        window.removeEventListener("storage", handler)
    }
}

export function getAccounts() {
    const data = readData()

    return data.accounts.map((account) =>
        decorateAccountWithDerivedSlotState(
            account,
            data.dailyStateByAccount?.[account.id] || {}
        )
    )
}

export function getAccountById(accountId) {
    const data = readData()
    const account = findAccount(data.accounts, accountId)

    if (!account) {
        return null
    }

    return decorateAccountWithDerivedSlotState(
        account,
        data.dailyStateByAccount?.[account.id] || {}
    )
}

export function getAccountGroups() {
    const data = readData()
    return buildAccountGroupsFromAccounts(
        data.accounts,
        data.dailyStateByAccount || {}
    )
}

export function getAccountHistory(accountId) {
    const account = findAccount(readData().accounts, accountId)
    return sortHistory(account?.history || [])
}

export function getActiveAccountId() {
    return cleanString(readData().activeAccountId)
}

export function setActiveAccountId(accountId) {
    return updateData((data) => {
        data.activeAccountId = cleanString(accountId)
        return data.activeAccountId
    })
}

export function addAccount(input = {}) {
    return updateData((data) => {
        const timestamp = nowIso()
        const inputPhase = normalizeAccountPhase(
            input.accountPhase || input.phase || "eval"
        )
        const inputProductType = normalizeProductType(
            input.productType || input.mode || "eod"
        )
        const inputStatus = resolveInitialStatusForNewAccount(
            inputPhase,
            input.accountStatus
        )

        const inputDataProvider = normalizeDataProvider(
            input.dataProvider || input.source?.provider || "tradovate"
        )
        const inputDataProviderType = normalizeDataProviderType(
            input.dataProviderType || input.source?.type || "",
            inputDataProvider
        )
        const inputDataProviderStatus = normalizeDataProviderStatus(
            input.dataProviderStatus || input.source?.status || "",
            getDefaultDataProviderStatus(inputDataProvider)
        )

        const nextAccount = normalizeAccount({
            ...DEFAULT_ACCOUNT,
            ...input,
            id: cleanString(input.id),
            displayName: cleanString(
                input.displayName ||
                input.name ||
                input.accountName ||
                input.label ||
                input.id
            ),
            tradingAccountId: cleanString(
                input.tradingAccountId ||
                resolveTradingAccountIdFromAccountLike(input)
            ),
            tradingAccountName: cleanString(
                input.tradingAccountName ||
                resolveTradingAccountNameFromAccountLike(
                    input,
                    cleanString(
                        input.tradingAccountId ||
                        resolveTradingAccountIdFromAccountLike(input)
                    )
                )
            ),
            tradovateAccountId: cleanString(
                input.tradovateAccountId ||
                input.tradingAccountId ||
                resolveTradingAccountIdFromAccountLike(input)
            ),
            tradovateAccountName: cleanString(
                input.tradovateAccountName ||
                input.tradingAccountName ||
                resolveTradingAccountNameFromAccountLike(
                    input,
                    cleanString(
                        input.tradovateAccountId ||
                        input.tradingAccountId ||
                        resolveTradingAccountIdFromAccountLike(input)
                    )
                )
            ),
            atasAccountId: cleanString(input.atasAccountId),
            atasAccountName: cleanString(input.atasAccountName),
            dataProvider: inputDataProvider,
            dataProviderType: inputDataProviderType,
            dataProviderStatus: inputDataProviderStatus,
            dataProviderAccountId: cleanString(
                input.dataProviderAccountId ||
                input.source?.accountId ||
                (inputDataProvider === "atas"
                    ? input.atasAccountId
                    : input.tradovateAccountId || input.tradingAccountId)
            ),
            dataProviderAccountName: cleanString(
                input.dataProviderAccountName ||
                input.source?.accountName ||
                (inputDataProvider === "atas"
                    ? input.atasAccountName
                    : input.tradovateAccountName || input.tradingAccountName || input.displayName)
            ),
            lastSyncAt: cleanString(input.lastSyncAt || input.source?.lastSyncAt),
            productType: inputProductType,
            accountPhase: inputPhase,
            accountStatus: inputStatus,
            accountGroupId: cleanString(
                input.accountGroupId ||
                buildFallbackGroupId({
                    ...input,
                    productType: inputProductType,
                    accountPhase: inputPhase,
                })
            ),
            createdAt: cleanString(input.createdAt) || timestamp,
            updatedAt: timestamp,
        })

        if (!nextAccount.id) {
            throw new Error("Account id is required")
        }

        const existing = findAccount(data.accounts, nextAccount.id)

        if (existing) {
            return normalizeAccount(existing)
        }

        pushHistory(
            nextAccount,
            createHistoryEntry("created", {
                accountPhase: nextAccount.accountPhase,
                accountStatus: nextAccount.accountStatus,
                productType: nextAccount.productType,
                accountGroupId: nextAccount.accountGroupId,
            })
        )

        if (nextAccount.accountStatus === "active" && !nextAccount.activatedAt) {
            nextAccount.activatedAt = nextAccount.createdAt
            nextAccount.statusChangedAt = nextAccount.createdAt
        }

        data.accounts.push(nextAccount)
        ensureAllProviderBucketsForAccount(data, nextAccount.id, nextAccount)
        syncAccountTradingMetaFromImports(data, nextAccount.id)
        enforceAccountLifecycleRules(data.accounts)

        if (!data.activeAccountId) {
            data.activeAccountId = nextAccount.id
        }

        return normalizeAccount(findAccount(data.accounts, nextAccount.id))
    })
}

export function upsertDetectedAccount(input = {}) {
    const accountId = cleanString(input.id || input.accountId || input.accountName)

    if (!accountId) {
        return null
    }

    return updateData((data) => {
        const existing = findAccount(data.accounts, accountId)

        if (!existing) {
            const createdPhase = normalizeAccountPhase(
                input.accountPhase || input.phase || "eval"
            )
            const createdProductType = normalizeProductType(
                input.productType || input.mode || "eod"
            )
            const createdStatus = resolveInitialStatusForNewAccount(
                createdPhase,
                input.accountStatus || "open"
            )
            const createdDataProvider = normalizeDataProvider(
                input.dataProvider || "tradovate"
            )

            const created = normalizeAccount({
                ...DEFAULT_ACCOUNT,
                ...input,
                id: accountId,
                displayName: cleanString(
                    input.displayName ||
                    input.name ||
                    input.accountName ||
                    accountId
                ),
                tradingAccountId: cleanString(
                    input.tradingAccountId ||
                    resolveTradingAccountIdFromAccountLike(input)
                ),
                tradingAccountName: cleanString(
                    input.tradingAccountName ||
                    resolveTradingAccountNameFromAccountLike(
                        input,
                        cleanString(
                            input.tradingAccountId ||
                            resolveTradingAccountIdFromAccountLike(input)
                        )
                    )
                ),
                tradovateAccountId: cleanString(
                    input.tradovateAccountId ||
                    input.tradingAccountId ||
                    resolveTradingAccountIdFromAccountLike(input)
                ),
                tradovateAccountName: cleanString(
                    input.tradovateAccountName ||
                    input.tradingAccountName ||
                    resolveTradingAccountNameFromAccountLike(
                        input,
                        cleanString(
                            input.tradovateAccountId ||
                            input.tradingAccountId ||
                            resolveTradingAccountIdFromAccountLike(input)
                        )
                    )
                ),
                atasAccountId: cleanString(input.atasAccountId),
                atasAccountName: cleanString(input.atasAccountName),
                dataProvider: createdDataProvider,
                dataProviderType: normalizeDataProviderType(
                    input.dataProviderType,
                    createdDataProvider
                ),
                dataProviderStatus: normalizeDataProviderStatus(
                    input.dataProviderStatus,
                    getDefaultDataProviderStatus(createdDataProvider)
                ),
                dataProviderAccountId: cleanString(
                    input.dataProviderAccountId ||
                    (createdDataProvider === "atas"
                        ? input.atasAccountId
                        : input.tradovateAccountId || input.tradingAccountId)
                ),
                dataProviderAccountName: cleanString(
                    input.dataProviderAccountName ||
                    (createdDataProvider === "atas"
                        ? input.atasAccountName
                        : input.tradovateAccountName || input.tradingAccountName || input.displayName)
                ),
                lastSyncAt: cleanString(input.lastSyncAt),
                accountPhase: createdPhase,
                accountStatus: createdStatus,
                productType: createdProductType,
                accountGroupId: cleanString(
                    input.accountGroupId ||
                    buildFallbackGroupId({
                        ...input,
                        id: accountId,
                        accountPhase: createdPhase,
                        productType: createdProductType,
                    })
                ),
                accountSize: normalizeAccountSize(
                    toNumber(input.accountSize, 0) ||
                    toNumber(input.startingBalance, 0) ||
                    toNumber(input.currentBalance ?? input.balance, 0),
                    detectAccountSize(
                        cleanString(
                            input.tradingAccountId ||
                            input.displayName ||
                            input.accountName ||
                            accountId
                        )
                    )
                ),
                startingBalance: toNumber(input.startingBalance, 0),
                currentBalance: toNumber(
                    input.currentBalance ?? input.balance ?? input.startingBalance,
                    0
                ),
                createdAt: nowIso(),
                updatedAt: nowIso(),
            })

            pushHistory(
                created,
                createHistoryEntry("created_detected", {
                    accountPhase: created.accountPhase,
                    accountStatus: created.accountStatus,
                    productType: created.productType,
                    accountGroupId: created.accountGroupId,
                })
            )

            if (created.accountStatus === "active" && !created.activatedAt) {
                created.activatedAt = created.createdAt
                created.statusChangedAt = created.createdAt
            }

            data.accounts.push(created)
            ensureAllProviderBucketsForAccount(data, created.id, created)
            syncAccountTradingMetaFromImports(data, created.id)
            enforceAccountLifecycleRules(data.accounts)
            return normalizeAccount(findAccount(data.accounts, created.id))
        }

        const preparedInput = { ...(input || {}) }

        if (Object.prototype.hasOwnProperty.call(preparedInput, "accountStatus")) {
            preparedInput.accountStatus = resolveEvalStatusForRules(
                data.accounts,
                existing,
                preparedInput.accountStatus
            )
        }

        applyAccountUpdates(existing, preparedInput)
        ensureAllProviderBucketsForAccount(data, existing.id, existing)
        syncAccountTradingMetaFromImports(data, existing.id)
        enforceAccountLifecycleRules(data.accounts)

        return normalizeAccount(existing)
    })
}

export function updateAccount(accountId, updates = {}) {
    return updateData((data) => {
        const account = ensureAccount(data.accounts, accountId)
        const preparedUpdates = { ...(updates || {}) }

        if (Object.prototype.hasOwnProperty.call(preparedUpdates, "accountStatus")) {
            preparedUpdates.accountStatus = resolveEvalStatusForRules(
                data.accounts,
                account,
                preparedUpdates.accountStatus
            )
        }

        applyAccountUpdates(account, preparedUpdates)
        ensureAllProviderBucketsForAccount(data, account.id, account)
        syncAccountTradingMetaFromImports(data, account.id)
        enforceAccountLifecycleRules(data.accounts)

        return normalizeAccount(account)
    })
}

export function deleteAccount(accountId) {
    return updateData((data) => {
        const id = cleanString(accountId)
        const account = findAccount(data.accounts, id)

        if (!account) {
            return false
        }

        if (account.accountPhase === "eval") {
            const linkedPaIds = unique(account.linkedPaAccountIds)

            linkedPaIds.forEach((paId) => {
                const paAccount = findAccount(data.accounts, paId)

                if (
                    paAccount &&
                    paAccount.linkedEvalAccountId === account.id &&
                    normalizeProductType(paAccount.productType) ===
                    normalizeProductType(account.productType)
                ) {
                    paAccount.linkedEvalAccountId = ""
                    paAccount.unlinkedAt = nowIso()
                    pushHistory(
                        paAccount,
                        createHistoryEntry("unlinked_by_delete", {
                            fromAccountId: account.id,
                            productType: normalizeProductType(paAccount.productType),
                        })
                    )
                }
            })
        }

        if (account.accountPhase === "pa" && account.linkedEvalAccountId) {
            const evalAccount = findAccount(data.accounts, account.linkedEvalAccountId)

            if (
                evalAccount &&
                normalizeProductType(evalAccount.productType) ===
                normalizeProductType(account.productType)
            ) {
                evalAccount.linkedPaAccountIds = evalAccount.linkedPaAccountIds.filter(
                    (value) => value !== account.id
                )
                evalAccount.unlinkedAt = nowIso()
                pushHistory(
                    evalAccount,
                    createHistoryEntry("unlinked_by_delete", {
                        targetAccountId: account.id,
                        productType: normalizeProductType(account.productType),
                    })
                )
            }
        }

        data.accounts = data.accounts.filter((entry) => entry.id !== id)

        removeSectionAccount("accountProfilesById", id, data)
        removeSectionAccount("ordersByAccount", id, data)
        removeSectionAccount("positionsByAccount", id, data)
        removeSectionAccount("riskByAccount", id, data)
        removeSectionAccount("journalByAccount", id, data)
        removeSectionAccount("fillsByAccount", id, data)
        removeSectionAccount("importedOrdersByAccount", id, data)
        removeSectionAccount("importedTradesByAccount", id, data)
        removeSectionAccount("dailySummaryByAccount", id, data)
        removeSectionAccount("dailyStateByAccount", id, data)
        removeSectionAccount("accountReportByAccount", id, data)
        removeSectionAccount("cashHistoryByAccount", id, data)
        removeSectionAccount("csvImportsByAccount", id, data)
        removeSectionAccount("providerDataByAccount", id, data)

        if (cleanString(data.activeAccountId) === id) {
            data.activeAccountId = cleanString(data.accounts[0]?.id)
        }

        enforceAccountLifecycleRules(data.accounts)

        return true
    })
}

export function setAccountPhase(accountId, nextPhase) {
    return updateData((data) => {
        const account = ensureAccount(data.accounts, accountId)
        const phase = normalizeAccountPhase(nextPhase)

        if (account.accountPhase === phase) {
            return normalizeAccount(account)
        }

        const entry = createHistoryEntry("phase_changed", {
            fromPhase: account.accountPhase,
            toPhase: phase,
        })

        account.accountPhase = phase
        account.phaseChangedAt = entry.createdAt
        pushHistory(account, entry)

        enforceAccountLifecycleRules(data.accounts)

        return normalizeAccount(account)
    })
}

export function setAccountStatus(accountId, nextStatus) {
    return updateData((data) => {
        const account = ensureAccount(data.accounts, accountId)
        const status = resolveEvalStatusForRules(data.accounts, account, nextStatus)

        if (account.accountStatus === status) {
            return normalizeAccount(account)
        }

        const entry = createHistoryEntry("status_changed", {
            fromStatus: account.accountStatus,
            toStatus: status,
        })

        account.accountStatus = status
        account.statusChangedAt = entry.createdAt

        if (status === "active") {
            account.activatedAt = entry.createdAt
        }

        if (status === "passed") {
            account.passedAt = entry.createdAt
        }

        if (status === "failed") {
            account.failedAt = entry.createdAt
        }

        if (status === "archived") {
            account.archivedAt = entry.createdAt
        }

        pushHistory(account, entry)
        enforceAccountLifecycleRules(data.accounts)

        return normalizeAccount(account)
    })
}

export function linkEvalToPaAccount(evalAccountId, paAccountId) {
    return updateData((data) => {
        const evalAccount = ensureAccount(data.accounts, evalAccountId)
        const paAccount = ensureAccount(data.accounts, paAccountId)

        evalAccount.accountPhase = "eval"
        paAccount.accountPhase = "pa"

        const evalProductType = normalizeProductType(evalAccount.productType)
        const paProductType = normalizeProductType(paAccount.productType)

        if (evalProductType !== paProductType) {
            throw new Error("EVAL and PA productType must match")
        }

        detachPaFromPreviousEval(data.accounts, paAccount, evalAccount.id)
        syncAccountGroupId(evalAccount, paAccount)

        if (!evalAccount.linkedPaAccountIds.includes(paAccount.id)) {
            const evalEntry = createHistoryEntry("linked", {
                targetAccountId: paAccount.id,
                productType: evalProductType,
                accountGroupId: evalAccount.accountGroupId,
            })

            evalAccount.linkedPaAccountIds = unique([
                ...evalAccount.linkedPaAccountIds,
                paAccount.id,
            ])
            evalAccount.linkedAt = evalEntry.createdAt
            pushHistory(evalAccount, evalEntry)
        }

        if (paAccount.linkedEvalAccountId !== evalAccount.id) {
            const paEntry = createHistoryEntry("linked", {
                targetAccountId: evalAccount.id,
                productType: paProductType,
                accountGroupId: paAccount.accountGroupId,
            })

            paAccount.linkedEvalAccountId = evalAccount.id
            paAccount.linkedAt = paEntry.createdAt
            pushHistory(paAccount, paEntry)
        }

        enforceAccountLifecycleRules(data.accounts)

        return {
            evalAccount: normalizeAccount(evalAccount),
            paAccount: normalizeAccount(paAccount),
            groups: buildAccountGroupsFromAccounts(data.accounts, data.dailyStateByAccount || {}),
        }
    })
}

export function unlinkEvalFromPaAccount(evalAccountId, paAccountId) {
    return updateData((data) => {
        const evalAccount = ensureAccount(data.accounts, evalAccountId)
        const paAccount = ensureAccount(data.accounts, paAccountId)

        const timestamp = nowIso()
        let changed = false

        if (
            evalAccount.linkedPaAccountIds.includes(paAccount.id) &&
            normalizeProductType(evalAccount.productType) ===
            normalizeProductType(paAccount.productType)
        ) {
            evalAccount.linkedPaAccountIds = evalAccount.linkedPaAccountIds.filter(
                (value) => value !== paAccount.id
            )
            evalAccount.unlinkedAt = timestamp
            pushHistory(
                evalAccount,
                createHistoryEntry("unlinked", {
                    targetAccountId: paAccount.id,
                    productType: normalizeProductType(evalAccount.productType),
                })
            )
            changed = true
        }

        if (paAccount.linkedEvalAccountId === evalAccount.id) {
            paAccount.linkedEvalAccountId = ""
            paAccount.unlinkedAt = timestamp
            pushHistory(
                paAccount,
                createHistoryEntry("unlinked", {
                    targetAccountId: evalAccount.id,
                    productType: normalizeProductType(paAccount.productType),
                })
            )
            changed = true
        }

        enforceAccountLifecycleRules(data.accounts)

        return {
            evalAccount: normalizeAccount(evalAccount),
            paAccount: normalizeAccount(paAccount),
            groups: buildAccountGroupsFromAccounts(data.accounts, data.dailyStateByAccount || {}),
            changed,
        }
    })
}

export function getAccountProfile(accountId) {
    return getSection("accountProfilesById", accountId, {})
}

export function saveAccountProfile(accountId, value) {
    return saveSection("accountProfilesById", accountId, value || {})
}

export function getOrders(accountId) {
    const data = readData()
    return getProviderSectionData(data, accountId, "orders", [])
}

export function saveOrders(accountId, value) {
    const normalized = Array.isArray(value) ? value : []

    return updateData((data) => {
        return setProviderSectionData(data, accountId, "orders", normalized)
    })
}

export function getPositions(accountId) {
    return getSection("positionsByAccount", accountId, [])
}

export function savePositions(accountId, value) {
    return saveSection("positionsByAccount", accountId, Array.isArray(value) ? value : [])
}

export function getRisk(accountId) {
    return getSection("riskByAccount", accountId, DEFAULT_RISK)
}

export function saveRisk(accountId, value) {
    return saveSection("riskByAccount", accountId, {
        ...DEFAULT_RISK,
        ...(value || {}),
    })
}

export function getJournalEntries(accountId) {
    return getSection("journalByAccount", accountId, [])
}

export function saveJournalEntries(accountId, value) {
    return saveSection("journalByAccount", accountId, Array.isArray(value) ? value : [])
}

export function getJournal(accountId) {
    return getJournalEntries(accountId)
}

export function saveJournal(accountId, value) {
    return saveJournalEntries(accountId, value)
}

export function getFills(accountId) {
    const data = readData()
    return getProviderSectionData(data, accountId, "fills", [])
}

export function getImportedFills(accountId) {
    return getFills(accountId)
}

export function saveFills(accountId, value) {
    const normalized = Array.isArray(value) ? value : []

    return updateData((data) => {
        return setProviderSectionData(data, accountId, "fills", normalized)
    })
}

export function saveImportedFills(accountId, value) {
    return saveFills(accountId, value)
}

export function clearImportedFills(accountId, provider = "tradovate") {
    const id = cleanString(accountId)
    const normalizedProvider = normalizeDataProvider(provider)

    if (!id) {
        return []
    }

    return updateData((data) => {
        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        bucket.fills = []

        if (normalizedProvider === "tradovate") {
            data.fillsByAccount = {
                ...(data.fillsByAccount || {}),
                [id]: [],
            }

            data.importedTradesByAccount = {
                ...(data.importedTradesByAccount || {}),
                [id]: [],
            }

            syncLegacySectionsFromTradovateBucket(data, id)
        }

        return []
    })
}

export function getFillsByAccount(accountId) {
    return getFills(accountId)
}

export function saveFillsByAccount(accountId, value) {
    return saveFills(accountId, value)
}

export function syncImportedFills(accountId, fills, provider = "tradovate") {
    const normalized = Array.isArray(fills) ? fills : []
    const normalizedProvider = normalizeDataProvider(provider)

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        bucket.fills = clone(normalized)

        if (normalizedProvider === "tradovate") {
            data.fillsByAccount = {
                ...(data.fillsByAccount || {}),
                [id]: clone(normalized),
            }

            data.importedTradesByAccount = {
                ...(data.importedTradesByAccount || {}),
                [id]: clone(normalized),
            }

            syncLegacySectionsFromTradovateBucket(data, id)
        }

        return clone(normalized)
    })
}

export function getImportedOrders(accountId) {
    return getSection("importedOrdersByAccount", accountId, [])
}

export function saveImportedOrders(accountId, value) {
    return saveSection(
        "importedOrdersByAccount",
        accountId,
        Array.isArray(value) ? value : []
    )
}

export function clearImportedOrders(accountId, provider = "tradovate") {
    const id = cleanString(accountId)
    const normalizedProvider = normalizeDataProvider(provider)

    if (!id) {
        return []
    }

    return updateData((data) => {
        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        bucket.orders = []

        if (normalizedProvider === "tradovate") {
            data.ordersByAccount = {
                ...(data.ordersByAccount || {}),
                [id]: [],
            }

            data.importedOrdersByAccount = {
                ...(data.importedOrdersByAccount || {}),
                [id]: [],
            }

            syncLegacySectionsFromTradovateBucket(data, id)
        }

        return []
    })
}

export function syncImportedOrders(accountId, orders, provider = "tradovate") {
    const normalized = Array.isArray(orders) ? orders : []
    const normalizedProvider = normalizeDataProvider(provider)

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        bucket.orders = clone(normalized)

        if (normalizedProvider === "tradovate") {
            data.ordersByAccount = {
                ...(data.ordersByAccount || {}),
                [id]: clone(normalized),
            }

            data.importedOrdersByAccount = {
                ...(data.importedOrdersByAccount || {}),
                [id]: clone(normalized),
            }

            syncLegacySectionsFromTradovateBucket(data, id)
        }

        return clone(normalized)
    })
}

export function getImportedTrades(accountId) {
    return getSection("importedTradesByAccount", accountId, [])
}

export function saveImportedTrades(accountId, value) {
    return saveSection(
        "importedTradesByAccount",
        accountId,
        Array.isArray(value) ? value : []
    )
}

export function clearImportedTrades(accountId) {
    return clearSection("importedTradesByAccount", accountId, [])
}

export function syncImportedTrades(accountId, trades) {
    const normalized = Array.isArray(trades) ? trades : []

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        data.importedTradesByAccount = {
            ...(data.importedTradesByAccount || {}),
            [id]: clone(normalized),
        }

        return clone(normalized)
    })
}

export function getDailySummary(accountId) {
    return getSection("dailySummaryByAccount", accountId, [])
}

export function saveDailySummary(accountId, value) {
    return saveSection("dailySummaryByAccount", accountId, Array.isArray(value) ? value : [])
}

export function clearDailySummary(accountId) {
    return clearSection("dailySummaryByAccount", accountId, [])
}

export function getDailyState(accountId) {
    return normalizeDailyState(
        getSection("dailyStateByAccount", accountId, DEFAULT_DAILY_STATE)
    )
}

export function saveDailyState(accountId, value) {
    return saveSection("dailyStateByAccount", accountId, normalizeDailyState(value))
}

export function clearDailyState(accountId) {
    return clearSection("dailyStateByAccount", accountId, DEFAULT_DAILY_STATE)
}

export function getAccountReport(accountId) {
    return getSection("accountReportByAccount", accountId, {})
}

export function saveAccountReport(accountId, value) {
    return saveSection("accountReportByAccount", accountId, value || {})
}

export function clearAccountReport(accountId) {
    return clearSection("accountReportByAccount", accountId, {})
}

export function getCashHistory(accountId) {
    const data = readData()
    return getProviderSectionData(data, accountId, "balanceHistory", [])
}

export function saveCashHistory(accountId, value) {
    const normalized = Array.isArray(value) ? value : []

    return updateData((data) => {
        return setProviderSectionData(data, accountId, "balanceHistory", normalized)
    })
}

export function clearCashHistory(accountId) {
    const id = cleanString(accountId)

    if (!id) {
        return []
    }

    return updateData((data) => {
        return setProviderSectionData(data, id, "balanceHistory", [])
    })
}

export function syncImportedCashHistory(accountId, rows, provider = "tradovate") {
    const normalized = Array.isArray(rows) ? rows : []
    const normalizedProvider = normalizeDataProvider(provider)

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        bucket.balanceHistory = clone(normalized)

        if (normalizedProvider === "tradovate") {
            data.cashHistoryByAccount = {
                ...(data.cashHistoryByAccount || {}),
                [id]: clone(normalized),
            }

            syncLegacySectionsFromTradovateBucket(data, id)
        }

        return clone(normalized)
    })
}

export function getCsvImports(accountId, provider = "tradovate") {
    const data = readData()
    const id = cleanString(accountId)

    if (!id) {
        return normalizeCsvImportsShape(getEmptyCsvImports())
    }

    const bucket = getProviderBucketFromData(data, id, normalizeDataProvider(provider))
    return normalizeCsvImportsShape(bucket?.csvImports || getEmptyCsvImports())
}

export function saveCsvImports(accountId, value, provider = "tradovate") {
    const normalized = normalizeCsvImportsShape(value)
    const id = cleanString(accountId)
    const normalizedProvider = normalizeDataProvider(provider)

    if (!id) {
        return normalized
    }

    return updateData((data) => {
        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        bucket.csvImports = normalizeCsvImportsShape(normalized)
        bucket.performance = Array.isArray(bucket.csvImports?.performance?.rows)
            ? clone(bucket.csvImports.performance.rows)
            : []
        bucket.positionHistory = Array.isArray(bucket.csvImports?.positionHistory?.rows)
            ? clone(bucket.csvImports.positionHistory.rows)
            : []
        bucket.lastSyncAt = cleanString(
            bucket.csvImports?.cashHistory?.importedAt ||
            bucket.lastSyncAt
        )

        if (normalizedProvider === "tradovate") {
            data.csvImportsByAccount = {
                ...(data.csvImportsByAccount || {}),
                [id]: normalizeCsvImportsShape(normalized),
            }

            syncAccountTradingMetaFromImports(data, id)
            syncLegacySectionsFromTradovateBucket(data, id)
        }

        return normalizeCsvImportsShape(bucket.csvImports)
    })
}

export function clearCsvImports(accountId, provider = "tradovate") {
    return saveCsvImports(accountId, getEmptyCsvImports(), provider)
}

export function getParsedCsvImport(accountId, type, provider = "tradovate") {
    const key = normalizeImportType(type)
    const imports = getCsvImports(accountId, provider)

    if (!key) {
        return createEmptyCsvImport("")
    }

    if (key === "cashHistory") {
        return imports.cashHistory || createEmptyCsvImport("cashHistory")
    }

    return imports[key] || createEmptyCsvImport(key)
}

export function saveParsedCsvImport(accountId, type, value = {}, provider = "tradovate") {
    const key = normalizeImportType(type)
    const normalizedProvider = normalizeDataProvider(provider)

    if (!key) {
        return createEmptyCsvImport("")
    }

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return createEmptyCsvImport(key)
        }

        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        const current = normalizeCsvImportsShape(
            bucket.csvImports ||
            (normalizedProvider === "tradovate" ? data.csvImportsByAccount?.[id] : null) ||
            {}
        )
        current[key] = cloneCsvImportEntry(key, value)

        if (key === "cashHistory") {
            current.dailySummary = {
                ...current.cashHistory,
                type: "dailySummary",
            }
        }

        bucket.csvImports = current
        bucket.lastSyncAt = cleanString(
            current?.cashHistory?.importedAt ||
            current?.trades?.importedAt ||
            current?.orders?.importedAt ||
            bucket.lastSyncAt
        )
        bucket.source = {
            ...bucket.source,
            accountId: cleanString(
                current?.cashHistory?.tradingAccountId ||
                current?.trades?.tradingAccountId ||
                current?.orders?.tradingAccountId ||
                bucket.source?.accountId
            ),
            accountName: cleanString(
                current?.cashHistory?.tradingAccountName ||
                current?.trades?.tradingAccountName ||
                current?.orders?.tradingAccountName ||
                bucket.source?.accountName
            ),
            lastSyncAt: bucket.lastSyncAt,
        }

        if (key === "performance") {
            bucket.performance = clone(current.performance.rows || [])
        }

        if (key === "positionHistory") {
            bucket.positionHistory = clone(current.positionHistory.rows || [])
        }

        if (normalizedProvider === "tradovate") {
            data.csvImportsByAccount = {
                ...(data.csvImportsByAccount || {}),
                [id]: current,
            }

            syncAccountTradingMetaFromImports(data, id)
            syncLegacySectionsFromTradovateBucket(data, id)
        }

        if (key === "cashHistory") {
            return current.cashHistory
        }

        return current[key]
    })
}

export function clearParsedCsvImport(accountId, type, provider = "tradovate") {
    const key = normalizeImportType(type)
    const normalizedProvider = normalizeDataProvider(provider)

    if (!key) {
        return createEmptyCsvImport("")
    }

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return createEmptyCsvImport(key)
        }

        const bucket = ensureProviderBucketForAccount(data, id, normalizedProvider)
        const current = normalizeCsvImportsShape(
            bucket.csvImports ||
            (normalizedProvider === "tradovate" ? data.csvImportsByAccount?.[id] : null) ||
            {}
        )
        current[key] = createEmptyCsvImport(key)

        if (key === "cashHistory") {
            current.dailySummary = {
                ...current.cashHistory,
                type: "dailySummary",
            }
        }

        if (key === "performance") {
            bucket.performance = []
        }

        if (key === "positionHistory") {
            bucket.positionHistory = []
        }

        bucket.csvImports = current

        if (normalizedProvider === "tradovate") {
            data.csvImportsByAccount = {
                ...(data.csvImportsByAccount || {}),
                [id]: current,
            }

            syncAccountTradingMetaFromImports(data, id)
            syncLegacySectionsFromTradovateBucket(data, id)
        }

        if (key === "cashHistory") {
            return current.cashHistory
        }

        return current[key]
    })
}

export function getAccountBalanceHistory(accountId) {
    return getCashHistory(accountId)
}

export function saveAccountBalanceHistory(accountId, value) {
    return saveCashHistory(accountId, value)
}

export function clearAccountBalanceHistory(accountId) {
    return clearCashHistory(accountId)
}

function getProviderSnapshotMeta(account = {}, snapshot = {}, provider = "tradovate") {
    const normalizedProvider = normalizeDataProvider(provider)

    const providerAccountId = cleanString(
        snapshot.dataProviderAccountId ||
        snapshot.providerAccountId ||
        snapshot.source?.accountId ||
        (normalizedProvider === "atas"
            ? snapshot.atasAccountId || account?.atasAccountId
            : snapshot.tradovateAccountId ||
            snapshot.tradingAccountId ||
            account?.tradovateAccountId ||
            account?.tradingAccountId)
    )

    const providerAccountName = cleanString(
        snapshot.dataProviderAccountName ||
        snapshot.providerAccountName ||
        snapshot.source?.accountName ||
        (normalizedProvider === "atas"
            ? snapshot.atasAccountName ||
            account?.atasAccountName ||
            account?.displayName
            : snapshot.tradovateAccountName ||
            snapshot.tradingAccountName ||
            account?.tradovateAccountName ||
            account?.tradingAccountName ||
            account?.displayName)
    )

    const tradingAccountId = cleanString(
        snapshot.tradingAccountId ||
        snapshot.tradovateAccountId ||
        account?.tradingAccountId ||
        account?.tradovateAccountId ||
        (normalizedProvider === "tradovate" ? providerAccountId : "")
    )

    const tradingAccountName = cleanString(
        snapshot.tradingAccountName ||
        snapshot.tradovateAccountName ||
        account?.tradingAccountName ||
        account?.tradovateAccountName ||
        (normalizedProvider === "tradovate"
            ? providerAccountName || tradingAccountId
            : account?.tradingAccountName || tradingAccountId)
    )

    return {
        providerAccountId,
        providerAccountName,
        tradingAccountId,
        tradingAccountName,
    }
}

export function saveProviderSyncSnapshot(accountId, snapshot = {}, providerOverride = "") {
    const id = cleanString(accountId)

    if (!id) {
        return getLiveAccountSnapshot("")
    }

    updateData((data) => {
        const account = ensureAccount(data.accounts, id)
        const provider = normalizeDataProvider(
            providerOverride ||
            snapshot.dataProvider ||
            getAccountDataProvider(account)
        )

        const providerType = normalizeDataProviderType(
            snapshot.dataProviderType ||
            snapshot.source?.type ||
            account.dataProviderType ||
            "",
            provider
        )

        const providerStatus = normalizeDataProviderStatus(
            snapshot.dataProviderStatus ||
            snapshot.status ||
            snapshot.source?.status ||
            "",
            getDefaultDataProviderStatus(provider)
        )

        const lastSyncAt = cleanString(
            snapshot.lastSyncAt ||
            snapshot.syncedAt ||
            nowIso()
        )

        const meta = getProviderSnapshotMeta(account, snapshot, provider)
        const bucket = ensureProviderBucketForAccount(data, id, provider, account)

        if (Object.prototype.hasOwnProperty.call(snapshot, "orders")) {
            bucket.orders = Array.isArray(snapshot.orders)
                ? clone(snapshot.orders)
                : []
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, "fills")) {
            bucket.fills = Array.isArray(snapshot.fills)
                ? clone(snapshot.fills)
                : []
        }

        const nextBalanceHistory = Array.isArray(snapshot.balanceHistory)
            ? snapshot.balanceHistory
            : Array.isArray(snapshot.cashHistory)
                ? snapshot.cashHistory
                : Array.isArray(snapshot.accountBalanceHistory)
                    ? snapshot.accountBalanceHistory
                    : null

        if (Array.isArray(nextBalanceHistory)) {
            bucket.balanceHistory = clone(nextBalanceHistory)
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, "performance")) {
            bucket.performance = Array.isArray(snapshot.performance)
                ? clone(snapshot.performance)
                : []
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, "positionHistory")) {
            bucket.positionHistory = Array.isArray(snapshot.positionHistory)
                ? clone(snapshot.positionHistory)
                : []
        }

        bucket.status = providerStatus
        bucket.lastSyncAt = lastSyncAt
        bucket.source = {
            ...bucket.source,
            ...buildProviderSourceFromAccount(
                {
                    ...account,
                    dataProvider: provider,
                    dataProviderType: providerType,
                    dataProviderStatus: providerStatus,
                    dataProviderAccountId:
                        meta.providerAccountId || account.dataProviderAccountId,
                    dataProviderAccountName:
                        meta.providerAccountName ||
                        account.dataProviderAccountName,
                    lastSyncAt,
                    atasAccountId:
                        provider === "atas"
                            ? meta.providerAccountId || account.atasAccountId
                            : account.atasAccountId,
                    atasAccountName:
                        provider === "atas"
                            ? meta.providerAccountName ||
                            account.atasAccountName ||
                            account.displayName
                            : account.atasAccountName,
                    tradovateAccountId:
                        meta.tradingAccountId || account.tradovateAccountId,
                    tradovateAccountName:
                        meta.tradingAccountName || account.tradovateAccountName,
                    tradingAccountId:
                        meta.tradingAccountId || account.tradingAccountId,
                    tradingAccountName:
                        meta.tradingAccountName || account.tradingAccountName,
                },
                provider
            ),
            provider,
            type: providerType,
            status: providerStatus,
            accountId:
                meta.providerAccountId ||
                bucket.source?.accountId ||
                account.dataProviderAccountId,
            accountName:
                meta.providerAccountName ||
                bucket.source?.accountName ||
                account.dataProviderAccountName,
            lastSyncAt,
        }

        account.dataProvider = provider
        account.dataProviderType = providerType
        account.dataProviderStatus = providerStatus
        account.dataProviderAccountId = cleanString(
            meta.providerAccountId || account.dataProviderAccountId
        )
        account.dataProviderAccountName = cleanString(
            meta.providerAccountName ||
            account.dataProviderAccountName ||
            account.displayName
        )
        account.lastSyncAt = lastSyncAt
        account.source = {
            ...(account.source || {}),
            ...bucket.source,
        }

        if (provider === "atas") {
            account.atasAccountId = cleanString(
                meta.providerAccountId || account.atasAccountId
            )
            account.atasAccountName = cleanString(
                meta.providerAccountName ||
                account.atasAccountName ||
                account.displayName
            )
        } else {
            account.tradovateAccountId = cleanString(
                meta.providerAccountId ||
                meta.tradingAccountId ||
                account.tradovateAccountId ||
                account.tradingAccountId
            )
            account.tradovateAccountName = cleanString(
                meta.providerAccountName ||
                meta.tradingAccountName ||
                account.tradovateAccountName ||
                account.tradingAccountName ||
                account.displayName
            )

            if (meta.tradingAccountId) {
                account.tradingAccountId = meta.tradingAccountId
            }

            if (meta.tradingAccountName) {
                account.tradingAccountName = meta.tradingAccountName
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(snapshot, "tradingAccountId") &&
            cleanString(snapshot.tradingAccountId)
        ) {
            account.tradingAccountId = cleanString(snapshot.tradingAccountId)
        }

        if (
            Object.prototype.hasOwnProperty.call(snapshot, "tradingAccountName") &&
            cleanString(snapshot.tradingAccountName)
        ) {
            account.tradingAccountName = cleanString(snapshot.tradingAccountName)
        }

        const currentDailyState = normalizeDailyState(
            data.dailyStateByAccount?.[id] || {}
        )

        const nextDailyState = normalizeDailyState({
            ...currentDailyState,
            ...(snapshot.dailyState || {}),
            currentBalance:
                snapshot.currentBalance ??
                snapshot.balance ??
                currentDailyState.currentBalance,
            startingBalance:
                snapshot.startingBalance ?? currentDailyState.startingBalance,
            openOrderCount:
                snapshot.openOrderCount ?? currentDailyState.openOrderCount,
            openPositionCount:
                snapshot.openPositionCount ?? currentDailyState.openPositionCount,
            dailyPnL:
                snapshot.dailyPnL ?? currentDailyState.dailyPnL,
            realizedPnL:
                snapshot.realizedPnL ?? currentDailyState.realizedPnL,
            unrealizedPnL:
                snapshot.unrealizedPnL ?? currentDailyState.unrealizedPnL,
            liquidationPrice:
                snapshot.liquidationPrice ?? currentDailyState.liquidationPrice,
            liquidationPriceBreached:
                snapshot.liquidationPriceBreached ??
                currentDailyState.liquidationPriceBreached,
            stopRiskViolation:
                snapshot.stopRiskViolation ??
                currentDailyState.stopRiskViolation,
            trailingDrawdownViolation:
                snapshot.trailingDrawdownViolation ??
                currentDailyState.trailingDrawdownViolation,
            isLocked:
                snapshot.isLocked ?? currentDailyState.isLocked,
            drawdownLimit:
                snapshot.drawdownLimit ?? currentDailyState.drawdownLimit,
            maxDailyLoss:
                snapshot.maxDailyLoss ?? currentDailyState.maxDailyLoss,
            sessionKey: cleanString(
                snapshot.sessionKey || currentDailyState.sessionKey
            ),
            tradingDate: cleanString(
                snapshot.tradingDate || currentDailyState.tradingDate
            ),
            lastResetAt: cleanString(
                snapshot.lastResetAt || currentDailyState.lastResetAt
            ),
        })

        data.dailyStateByAccount = {
            ...(data.dailyStateByAccount || {}),
            [id]: nextDailyState,
        }

        if (
            Object.prototype.hasOwnProperty.call(snapshot, "currentBalance") ||
            Object.prototype.hasOwnProperty.call(snapshot, "balance")
        ) {
            account.currentBalance = toNumber(
                snapshot.currentBalance ?? snapshot.balance,
                account.currentBalance
            )
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, "startingBalance")) {
            account.startingBalance = toNumber(
                snapshot.startingBalance,
                account.startingBalance
            )
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, "accountSize")) {
            account.accountSize = normalizeAccountSize(
                snapshot.accountSize,
                account.accountSize ||
                account.startingBalance ||
                account.currentBalance
            )
        }

        if (
            !toNumber(account.startingBalance, 0) &&
            toNumber(nextDailyState.startingBalance, 0) > 0
        ) {
            account.startingBalance = nextDailyState.startingBalance
        }

        if (
            !toNumber(account.currentBalance, 0) &&
            toNumber(nextDailyState.currentBalance, 0) > 0
        ) {
            account.currentBalance = nextDailyState.currentBalance
        }

        if (!toNumber(account.accountSize, 0)) {
            account.accountSize = normalizeAccountSize(
                account.startingBalance || account.currentBalance,
                resolveDetectedAccountSizeFromAccountLike(account)
            )
        }

        account.tradingAccountKey = normalizeAccountLookup(
            account.tradingAccountId ||
            account.tradingAccountName ||
            account.dataProviderAccountId ||
            account.dataProviderAccountName
        )

        account.updatedAt = nowIso()

        ensureAllProviderBucketsForAccount(data, id, account)

        if (provider === "tradovate") {
            syncAccountTradingMetaFromImports(data, id)
            syncLegacySectionsFromTradovateBucket(data, id)
        }
    })

    return getLiveAccountSnapshot(id)
}

export function getLiveAccountSnapshot(accountId) {
    const data = readData()
    const id = cleanString(accountId)
    const account = findAccount(data.accounts, id)
    const activeProvider = getAccountDataProvider(account)
    const providerBucket = getProviderBucketFromData(data, id, activeProvider, account)
    const dailyState = normalizeDailyState(data.dailyStateByAccount?.[id] || {})
    const orders = Array.isArray(providerBucket?.orders) ? providerBucket.orders : []
    const positions = Array.isArray(data.positionsByAccount?.[id])
        ? data.positionsByAccount[id]
        : []
    const fills = Array.isArray(providerBucket?.fills) ? providerBucket.fills : []
    const dailySummary = Array.isArray(data.dailySummaryByAccount?.[id])
        ? data.dailySummaryByAccount[id]
        : []
    const cashHistory = Array.isArray(providerBucket?.balanceHistory)
        ? providerBucket.balanceHistory
        : []

    const currentBalance = activeProvider === "atas"
        ? toNumber(dailyState.currentBalance, 0)
        : (
            toNumber(dailyState.currentBalance, 0) ||
            toNumber(account?.currentBalance, 0) ||
            toNumber(account?.startingBalance, 0) ||
            toNumber(account?.accountSize, 0)
        )

    const startingBalance = activeProvider === "atas"
        ? toNumber(dailyState.startingBalance, 0)
        : (
            toNumber(dailyState.startingBalance, 0) ||
            toNumber(account?.startingBalance, 0) ||
            toNumber(account?.accountSize, 0)
        )

    const openPositionCount =
        toNumber(dailyState.openPositionCount, 0) || positions.length

    const openOrderCount =
        toNumber(dailyState.openOrderCount, 0) || orders.length

    const normalizedAccount = account ? normalizeAccount(account) : null
    const slotState = buildDerivedSlotState(normalizedAccount, dailyState)

    return {
        accountId: id,
        id,
        displayName: cleanString(normalizedAccount?.displayName || normalizedAccount?.id),
        tradingAccountId: cleanString(normalizedAccount?.tradingAccountId),
        tradingAccountName: cleanString(
            normalizedAccount?.tradingAccountName ||
            normalizedAccount?.tradingAccountId
        ),
        tradingAccountKey: cleanString(normalizedAccount?.tradingAccountKey),
        dataProvider: cleanString(normalizedAccount?.dataProvider || activeProvider),
        dataProviderType: cleanString(normalizedAccount?.dataProviderType),
        dataProviderStatus: cleanString(normalizedAccount?.dataProviderStatus),
        dataProviderAccountId: cleanString(normalizedAccount?.dataProviderAccountId),
        dataProviderAccountName: cleanString(normalizedAccount?.dataProviderAccountName),
        lastSyncAt: cleanString(normalizedAccount?.lastSyncAt),
        productType: cleanString(normalizedAccount?.productType || "eod"),
        accountPhase: cleanString(normalizedAccount?.accountPhase || "eval"),
        accountStatus: cleanString(normalizedAccount?.accountStatus || "open"),
        accountGroupId: cleanString(normalizedAccount?.accountGroupId),
        slotState,
        accountSize: normalizeAccountSize(
            normalizedAccount?.accountSize,
            startingBalance || currentBalance
        ),
        startingBalance,
        currentBalance,
        balance: currentBalance,
        netLiquidity: currentBalance,
        dailyPnL: toNumber(dailyState.dailyPnL, 0),
        realizedPnL: toNumber(dailyState.realizedPnL, 0),
        unrealizedPnL: toNumber(dailyState.unrealizedPnL, 0),
        liquidationPrice: toNumber(dailyState.liquidationPrice, 0),
        liquidationPriceBreached: toBoolean(dailyState.liquidationPriceBreached),
        sessionKey: cleanString(dailyState.sessionKey),
        tradingDate: cleanString(dailyState.tradingDate),
        lastResetAt: cleanString(dailyState.lastResetAt),
        stopRiskViolation: toBoolean(dailyState.stopRiskViolation),
        trailingDrawdownViolation: toBoolean(dailyState.trailingDrawdownViolation),
        isLocked: toBoolean(dailyState.isLocked),
        drawdownLimit: toNumber(dailyState.drawdownLimit, 0),
        maxDailyLoss: toNumber(dailyState.maxDailyLoss, 0),
        openPositionCount,
        openOrderCount,
        positions,
        orders,
        fills,
        dailySummary,
        cashHistory,
    }
}

export function saveLiveAccountSnapshot(accountId, snapshot = {}) {
    const id = cleanString(accountId)

    if (!id) {
        return getLiveAccountSnapshot("")
    }

    const account = getAccountById(id)
    const provider = normalizeDataProvider(
        snapshot.dataProvider || getAccountDataProvider(account)
    )

    return saveProviderSyncSnapshot(id, snapshot, provider)
}

export function getMockStatus(accountId) {
    return getLiveAccountSnapshot(accountId)
}

export function resetStorage() {
    if (typeof window === "undefined") {
        return
    }

    window.localStorage.removeItem(STORAGE_KEY)
    notifyStorageChange()
}