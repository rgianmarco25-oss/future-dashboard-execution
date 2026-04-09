const STORAGE_KEY = "tradingAppData"
const STORAGE_EVENT = "future-dashboard-storage"
const DATA_VERSION = 11

const DEFAULT_ACCOUNT = {
    id: "",
    displayName: "",
    productType: "eod",
    accountPhase: "eval",
    accountStatus: "open",
    accountSize: 0,
    startingBalance: 0,
    currentBalance: 0,
    linkedEvalAccountId: "",
    linkedPaAccountIds: [],
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

function createEmptyCsvImport(type) {
    return {
        type: cleanString(type),
        fileName: "",
        importedAt: "",
        headers: [],
        rows: [],
        previewRows: [],
        rawText: "",
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

    if (normalized === "intraday") {
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
    const text = cleanString(value).toLowerCase()

    if (!text) {
        return 0
    }

    const spaced = text.replace(/[_./-]+/g, " ")

    if (/\b150\s*k\b/.test(spaced) || /\b150000\b/.test(spaced)) {
        return 150000
    }

    if (/\b100\s*k\b/.test(spaced) || /\b100000\b/.test(spaced)) {
        return 100000
    }

    if (/\b50\s*k\b/.test(spaced) || /\b50000\b/.test(spaced)) {
        return 50000
    }

    if (/\b25\s*k\b/.test(spaced) || /\b25000\b/.test(spaced)) {
        return 25000
    }

    return 0
}

function resolveDetectedAccountSizeFromAccountLike(input = {}) {
    const candidates = [
        input?.id,
        input?.displayName,
        input?.accountId,
        input?.accountName,
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
    }
}

function normalizeCsvImportsShape(value) {
    const base = getEmptyCsvImports()

    if (!value || typeof value !== "object") {
        return base
    }

    const sourceCashHistory =
        value.cashHistory ||
        value.dailySummary ||
        createEmptyCsvImport("cashHistory")

    const normalized = {
        orders: cloneCsvImportEntry("orders", value.orders || {}),
        trades: cloneCsvImportEntry("trades", value.trades || {}),
        cashHistory: cloneCsvImportEntry("cashHistory", sourceCashHistory),
        performance: cloneCsvImportEntry("performance", value.performance || {}),
        positionHistory: cloneCsvImportEntry(
            "positionHistory",
            value.positionHistory || {}
        ),
    }

    return {
        ...normalized,
        dailySummary: {
            ...normalized.cashHistory,
            type: "dailySummary",
        },
    }
}

function normalizeAccount(account) {
    const base = {
        ...DEFAULT_ACCOUNT,
        ...(account || {}),
    }

    const detectedAccountSize = resolveDetectedAccountSizeFromAccountLike(base)
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

    return {
        ...base,
        id: cleanString(base.id),
        displayName: cleanString(base.displayName),
        productType: normalizeProductType(base.productType),
        accountPhase: normalizeAccountPhase(base.accountPhase),
        accountStatus: normalizeAccountStatus(base.accountStatus),
        accountSize: normalizedAccountSize,
        startingBalance: normalizedStartingBalance,
        currentBalance: normalizedCurrentBalance,
        linkedEvalAccountId: cleanString(base.linkedEvalAccountId),
        linkedPaAccountIds: unique(base.linkedPaAccountIds),
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
    }
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

function normalizeData(data) {
    const base = {
        ...DEFAULT_DATA,
        ...(data || {}),
    }

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
        uniqueAccounts.push(account)
    }

    return {
        version: DATA_VERSION,
        accounts: uniqueAccounts,
        activeAccountId: cleanString(base.activeAccountId),
        accountProfilesById: normalizeMapSection(base.accountProfilesById),
        ordersByAccount: normalizeMapSection(base.ordersByAccount),
        positionsByAccount: normalizeMapSection(base.positionsByAccount),
        riskByAccount: normalizeMapSection(base.riskByAccount),
        journalByAccount: normalizeMapSection(base.journalByAccount),
        fillsByAccount: normalizeMapSection(base.fillsByAccount),
        importedOrdersByAccount: normalizeMapSection(base.importedOrdersByAccount),
        importedTradesByAccount: normalizeMapSection(base.importedTradesByAccount),
        dailySummaryByAccount: normalizeMapSection(base.dailySummaryByAccount),
        dailyStateByAccount: normalizeDailyStateMap(base.dailyStateByAccount),
        accountReportByAccount: normalizeMapSection(base.accountReportByAccount),
        cashHistoryByAccount: normalizeMapSection(base.cashHistoryByAccount),
        csvImportsByAccount: normalizeCsvImportsMap(base.csvImportsByAccount),
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

function pushHistory(account, entry) {
    account.history = sortHistory([...(account.history || []), entry])
    account.updatedAt = entry.createdAt
    account.lifecycleVersion = toNumber(account.lifecycleVersion, 2) + 1
}

function getLinkedPaAccounts(accounts, evalAccountId) {
    const evalId = cleanString(evalAccountId)

    if (!evalId) {
        return []
    }

    return (accounts || []).filter((account) => {
        return (
            normalizeAccountPhase(account.accountPhase) === "pa" &&
            cleanString(account.linkedEvalAccountId) === evalId
        )
    })
}

function hasLinkedPaWithStatuses(accounts, evalAccountId, statuses = []) {
    const allowedStatuses = new Set(statuses.map(normalizeAccountStatus))

    return getLinkedPaAccounts(accounts, evalAccountId).some((account) => {
        return allowedStatuses.has(normalizeAccountStatus(account.accountStatus))
    })
}

function shouldArchiveEvalDueToLinkedPa(accounts, evalAccountId) {
    return hasLinkedPaWithStatuses(accounts, evalAccountId, ["active", "passed"])
}

function resolveEvalStatusForRules(accounts, account, requestedStatus) {
    if (!account) {
        return normalizeAccountStatus(requestedStatus)
    }

    const phase = normalizeAccountPhase(account.accountPhase)
    const nextStatus = normalizeAccountStatus(requestedStatus)

    if (
        phase === "eval" &&
        shouldArchiveEvalDueToLinkedPa(accounts, account.id)
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
    })

    evalAccount.accountStatus = "archived"
    evalAccount.archivedAt = entry.createdAt
    evalAccount.statusChangedAt = entry.createdAt
    pushHistory(evalAccount, entry)
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
            archiveEvalFromPaActivation(evalAccount, account)
        }
    })

    safeAccounts.forEach((account) => {
        if (normalizeAccountPhase(account.accountPhase) !== "eval") {
            return
        }

        if (!shouldArchiveEvalDueToLinkedPa(safeAccounts, account.id)) {
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
        })
    )

    paAccount.linkedEvalAccountId = ""
}

function buildGroupStatus(evalAccount, paAccounts) {
    const normalizedPaAccounts = [...(paAccounts || [])].map(normalizeAccount)

    if (normalizedPaAccounts.some((account) => account.accountStatus === "active")) {
        return "pa_active"
    }

    if (normalizedPaAccounts.some((account) => account.accountStatus === "passed")) {
        return "pa_passed"
    }

    if (normalizedPaAccounts.some((account) => account.accountStatus === "failed")) {
        return "failed"
    }

    if (normalizedPaAccounts.some((account) => account.accountStatus === "archived")) {
        return "pa_archived"
    }

    if (evalAccount && normalizeAccountStatus(evalAccount.accountStatus) === "passed") {
        return "eval_passed"
    }

    if (evalAccount && normalizeAccountStatus(evalAccount.accountStatus) === "archived") {
        return "archived"
    }

    if (evalAccount && normalizeAccountStatus(evalAccount.accountStatus) === "failed") {
        return "failed"
    }

    return "open"
}

function buildAccountGroupsFromAccounts(accounts) {
    const normalizedAccounts = [...(accounts || [])].map(normalizeAccount)
    const byId = new Map(normalizedAccounts.map((account) => [account.id, account]))

    const evalAccounts = normalizedAccounts.filter(
        (account) => account.accountPhase === "eval"
    )
    const paAccounts = normalizedAccounts.filter(
        (account) => account.accountPhase === "pa"
    )

    const groups = []
    const consumedPaIds = new Set()

    for (const evalAccount of evalAccounts) {
        const linkedPaIds = unique([
            ...(evalAccount.linkedPaAccountIds || []),
            ...paAccounts
                .filter((account) => account.linkedEvalAccountId === evalAccount.id)
                .map((account) => account.id),
        ])

        const linkedPaAccounts = linkedPaIds
            .map((paId) => byId.get(paId))
            .filter(Boolean)
            .map(normalizeAccount)

        linkedPaAccounts.forEach((account) => consumedPaIds.add(account.id))

        groups.push({
            id: `group_${evalAccount.id}`,
            evalAccount: normalizeAccount(evalAccount),
            paAccounts: linkedPaAccounts.sort((left, right) =>
                cleanString(left.createdAt).localeCompare(cleanString(right.createdAt))
            ),
            groupStatus: buildGroupStatus(evalAccount, linkedPaAccounts),
        })
    }

    for (const paAccount of paAccounts) {
        if (consumedPaIds.has(paAccount.id)) {
            continue
        }

        groups.push({
            id: `group_${paAccount.id}`,
            evalAccount: null,
            paAccounts: [normalizeAccount(paAccount)],
            groupStatus: buildGroupStatus(null, [paAccount]),
        })
    }

    return groups.sort((left, right) => {
        const leftTime =
            cleanString(left?.evalAccount?.createdAt) ||
            cleanString(left?.paAccounts?.[0]?.createdAt)
        const rightTime =
            cleanString(right?.evalAccount?.createdAt) ||
            cleanString(right?.paAccounts?.[0]?.createdAt)

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
            : account.displayName

    const nextProductType =
        Object.prototype.hasOwnProperty.call(updates, "productType")
            ? normalizeProductType(updates.productType)
            : account.productType

    const nextPhase =
        Object.prototype.hasOwnProperty.call(updates, "accountPhase")
            ? normalizeAccountPhase(updates.accountPhase)
            : account.accountPhase

    const nextStatus =
        Object.prototype.hasOwnProperty.call(updates, "accountStatus")
            ? normalizeAccountStatus(updates.accountStatus)
            : account.accountStatus

    account.displayName = nextDisplayName
    account.productType = nextProductType

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
    return readData().accounts.map(normalizeAccount)
}

export function getAccountById(accountId) {
    const account = findAccount(readData().accounts, accountId)
    return account ? normalizeAccount(account) : null
}

export function getAccountGroups() {
    return buildAccountGroupsFromAccounts(readData().accounts)
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
        const inputPhase = normalizeAccountPhase(input.accountPhase || "eval")
        const inputStatus = resolveInitialStatusForNewAccount(
            inputPhase,
            input.accountStatus
        )

        const nextAccount = normalizeAccount({
            ...DEFAULT_ACCOUNT,
            ...input,
            id: cleanString(input.id),
            accountPhase: inputPhase,
            accountStatus: inputStatus,
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
            })
        )

        if (nextAccount.accountStatus === "active" && !nextAccount.activatedAt) {
            nextAccount.activatedAt = nextAccount.createdAt
            nextAccount.statusChangedAt = nextAccount.createdAt
        }

        data.accounts.push(nextAccount)
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
            const createdPhase = normalizeAccountPhase(input.accountPhase || "eval")
            const createdStatus = resolveInitialStatusForNewAccount(
                createdPhase,
                input.accountStatus || "open"
            )

            const created = normalizeAccount({
                ...DEFAULT_ACCOUNT,
                ...input,
                id: accountId,
                displayName: cleanString(input.displayName || input.accountName || accountId),
                accountPhase: createdPhase,
                accountStatus: createdStatus,
                productType: normalizeProductType(input.productType || "eod"),
                accountSize: normalizeAccountSize(
                    toNumber(input.accountSize, 0) ||
                    toNumber(input.startingBalance, 0) ||
                    toNumber(input.currentBalance ?? input.balance, 0),
                    detectAccountSize(accountId)
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
                })
            )

            if (created.accountStatus === "active" && !created.activatedAt) {
                created.activatedAt = created.createdAt
                created.statusChangedAt = created.createdAt
            }

            data.accounts.push(created)
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

                if (paAccount && paAccount.linkedEvalAccountId === account.id) {
                    paAccount.linkedEvalAccountId = ""
                    paAccount.unlinkedAt = nowIso()
                    pushHistory(
                        paAccount,
                        createHistoryEntry("unlinked_by_delete", {
                            fromAccountId: account.id,
                        })
                    )
                }
            })
        }

        if (account.accountPhase === "pa" && account.linkedEvalAccountId) {
            const evalAccount = findAccount(data.accounts, account.linkedEvalAccountId)

            if (evalAccount) {
                evalAccount.linkedPaAccountIds = evalAccount.linkedPaAccountIds.filter(
                    (value) => value !== account.id
                )
                evalAccount.unlinkedAt = nowIso()
                pushHistory(
                    evalAccount,
                    createHistoryEntry("unlinked_by_delete", {
                        targetAccountId: account.id,
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

        detachPaFromPreviousEval(data.accounts, paAccount, evalAccount.id)

        if (!evalAccount.linkedPaAccountIds.includes(paAccount.id)) {
            const evalEntry = createHistoryEntry("linked", {
                targetAccountId: paAccount.id,
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
            })

            paAccount.linkedEvalAccountId = evalAccount.id
            paAccount.linkedAt = paEntry.createdAt
            pushHistory(paAccount, paEntry)
        }

        enforceAccountLifecycleRules(data.accounts)

        return {
            evalAccount: normalizeAccount(evalAccount),
            paAccount: normalizeAccount(paAccount),
            groups: buildAccountGroupsFromAccounts(data.accounts),
        }
    })
}

export function unlinkEvalFromPaAccount(evalAccountId, paAccountId) {
    return updateData((data) => {
        const evalAccount = ensureAccount(data.accounts, evalAccountId)
        const paAccount = ensureAccount(data.accounts, paAccountId)

        const timestamp = nowIso()
        let changed = false

        if (evalAccount.linkedPaAccountIds.includes(paAccount.id)) {
            evalAccount.linkedPaAccountIds = evalAccount.linkedPaAccountIds.filter(
                (value) => value !== paAccount.id
            )
            evalAccount.unlinkedAt = timestamp
            pushHistory(
                evalAccount,
                createHistoryEntry("unlinked", {
                    targetAccountId: paAccount.id,
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
                })
            )
            changed = true
        }

        enforceAccountLifecycleRules(data.accounts)

        return {
            evalAccount: normalizeAccount(evalAccount),
            paAccount: normalizeAccount(paAccount),
            groups: buildAccountGroupsFromAccounts(data.accounts),
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
    return getSection("ordersByAccount", accountId, [])
}

export function saveOrders(accountId, value) {
    return saveSection("ordersByAccount", accountId, Array.isArray(value) ? value : [])
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
    return getSection("fillsByAccount", accountId, [])
}

export function getImportedFills(accountId) {
    return getFills(accountId)
}

export function saveFills(accountId, value) {
    return saveSection("fillsByAccount", accountId, Array.isArray(value) ? value : [])
}

export function saveImportedFills(accountId, value) {
    return saveFills(accountId, value)
}

export function clearImportedFills(accountId) {
    return clearSection("fillsByAccount", accountId, [])
}

export function getFillsByAccount(accountId) {
    return getFills(accountId)
}

export function saveFillsByAccount(accountId, value) {
    return saveFills(accountId, value)
}

export function syncImportedFills(accountId, fills) {
    const normalized = Array.isArray(fills) ? fills : []

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        data.fillsByAccount = {
            ...(data.fillsByAccount || {}),
            [id]: clone(normalized),
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

export function clearImportedOrders(accountId) {
    return clearSection("importedOrdersByAccount", accountId, [])
}

export function syncImportedOrders(accountId, orders) {
    const normalized = Array.isArray(orders) ? orders : []

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        data.importedOrdersByAccount = {
            ...(data.importedOrdersByAccount || {}),
            [id]: clone(normalized),
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
    return getSection("cashHistoryByAccount", accountId, [])
}

export function saveCashHistory(accountId, value) {
    return saveSection("cashHistoryByAccount", accountId, Array.isArray(value) ? value : [])
}

export function clearCashHistory(accountId) {
    return clearSection("cashHistoryByAccount", accountId, [])
}

export function syncImportedCashHistory(accountId, rows) {
    const normalized = Array.isArray(rows) ? rows : []

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return normalized
        }

        data.cashHistoryByAccount = {
            ...(data.cashHistoryByAccount || {}),
            [id]: clone(normalized),
        }

        return clone(normalized)
    })
}

export function getCsvImports(accountId) {
    return normalizeCsvImportsShape(
        getSection("csvImportsByAccount", accountId, getEmptyCsvImports())
    )
}

export function saveCsvImports(accountId, value) {
    return saveSection(
        "csvImportsByAccount",
        accountId,
        normalizeCsvImportsShape(value)
    )
}

export function clearCsvImports(accountId) {
    return clearSection("csvImportsByAccount", accountId, getEmptyCsvImports())
}

export function getParsedCsvImport(accountId, type) {
    const key = normalizeImportType(type)
    const imports = getCsvImports(accountId)

    if (!key) {
        return createEmptyCsvImport("")
    }

    if (key === "cashHistory") {
        return imports.cashHistory || createEmptyCsvImport("cashHistory")
    }

    return imports[key] || createEmptyCsvImport(key)
}

export function saveParsedCsvImport(accountId, type, value = {}) {
    const key = normalizeImportType(type)

    if (!key) {
        return createEmptyCsvImport("")
    }

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return createEmptyCsvImport(key)
        }

        const current = normalizeCsvImportsShape(data.csvImportsByAccount?.[id] || {})
        current[key] = cloneCsvImportEntry(key, value)

        if (key === "cashHistory") {
            current.dailySummary = {
                ...current.cashHistory,
                type: "dailySummary",
            }
        }

        data.csvImportsByAccount = {
            ...(data.csvImportsByAccount || {}),
            [id]: current,
        }

        if (key === "cashHistory") {
            return current.cashHistory
        }

        return current[key]
    })
}

export function clearParsedCsvImport(accountId, type) {
    const key = normalizeImportType(type)

    if (!key) {
        return createEmptyCsvImport("")
    }

    return updateData((data) => {
        const id = cleanString(accountId)

        if (!id) {
            return createEmptyCsvImport(key)
        }

        const current = normalizeCsvImportsShape(data.csvImportsByAccount?.[id] || {})
        current[key] = createEmptyCsvImport(key)

        if (key === "cashHistory") {
            current.dailySummary = {
                ...current.cashHistory,
                type: "dailySummary",
            }
        }

        data.csvImportsByAccount = {
            ...(data.csvImportsByAccount || {}),
            [id]: current,
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

export function getLiveAccountSnapshot(accountId) {
    const data = readData()
    const id = cleanString(accountId)
    const account = findAccount(data.accounts, id)
    const dailyState = normalizeDailyState(data.dailyStateByAccount?.[id] || {})
    const orders = Array.isArray(data.ordersByAccount?.[id]) ? data.ordersByAccount[id] : []
    const positions = Array.isArray(data.positionsByAccount?.[id])
        ? data.positionsByAccount[id]
        : []
    const fills = Array.isArray(data.fillsByAccount?.[id]) ? data.fillsByAccount[id] : []
    const dailySummary = Array.isArray(data.dailySummaryByAccount?.[id])
        ? data.dailySummaryByAccount[id]
        : []
    const cashHistory = Array.isArray(data.cashHistoryByAccount?.[id])
        ? data.cashHistoryByAccount[id]
        : []

    const currentBalance =
        toNumber(dailyState.currentBalance, 0) ||
        toNumber(account?.currentBalance, 0) ||
        toNumber(account?.startingBalance, 0) ||
        toNumber(account?.accountSize, 0)

    const startingBalance =
        toNumber(dailyState.startingBalance, 0) ||
        toNumber(account?.startingBalance, 0) ||
        toNumber(account?.accountSize, 0)

    const openPositionCount =
        toNumber(dailyState.openPositionCount, 0) || positions.length

    const openOrderCount =
        toNumber(dailyState.openOrderCount, 0) || orders.length

    return {
        accountId: id,
        id,
        displayName: cleanString(account?.displayName || account?.id),
        productType: cleanString(account?.productType || "eod"),
        accountPhase: cleanString(account?.accountPhase || "eval"),
        accountStatus: cleanString(account?.accountStatus || "open"),
        accountSize: normalizeAccountSize(
            account?.accountSize,
            startingBalance || currentBalance
        ),
        startingBalance,
        currentBalance,
        balance: currentBalance,
        netLiquidity: currentBalance,
        dailyPnL: toNumber(dailyState.dailyPnL, 0),
        realizedPnL: toNumber(dailyState.realizedPnL, 0),
        unrealizedPnL: toNumber(dailyState.unrealizedPnL, 0),
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

    return updateData((data) => {
        const existing = normalizeDailyState(data.dailyStateByAccount?.[id] || {})
        const nextState = normalizeDailyState({
            ...existing,
            ...snapshot,
            currentBalance:
                snapshot.currentBalance ??
                snapshot.balance ??
                existing.currentBalance,
            startingBalance:
                snapshot.startingBalance ?? existing.startingBalance,
            openPositionCount:
                snapshot.openPositionCount ?? existing.openPositionCount,
            openOrderCount:
                snapshot.openOrderCount ?? existing.openOrderCount,
        })

        data.dailyStateByAccount = {
            ...(data.dailyStateByAccount || {}),
            [id]: nextState,
        }

        const account = findAccount(data.accounts, id)

        if (account) {
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
                    account.accountSize || account.startingBalance || account.currentBalance
                )
            }

            account.updatedAt = nowIso()
        }

        return getLiveAccountSnapshot(id)
    })
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