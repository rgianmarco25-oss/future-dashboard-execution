export const CSV_IMPORT_STORAGE_KEY = "tradovateCsvImports"

export const CSV_TYPES = {
    ACCOUNT_BALANCE_HISTORY: "accountBalanceHistory",
    POSITION_HISTORY: "positionHistory",
    ORDERS: "orders",
    FILLS: "fills",
    PERFORMANCE: "performance",
    UNKNOWN: "unknown",
}

function createEmptyImportStore() {
    return {
        accountBalanceHistory: null,
        positionHistory: null,
        orders: null,
        fills: null,
        performance: null,

        trades: null,
        daily: null,
        account: null,
    }
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value))
}

function cleanBom(value) {
    return String(value || "").replace(/^\uFEFF/, "")
}

function cleanString(value) {
    return String(value ?? "").trim()
}

function cleanLooseString(value) {
    return String(value ?? "").replace(/\r/g, "").trim()
}

function normalizeHeader(value) {
    return cleanBom(value)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
        return fallback
    }

    const raw = String(value).trim()

    if (!raw) {
        return fallback
    }

    const negativeByParens = raw.startsWith("(") && raw.endsWith(")")
    const normalized = raw
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .replace(/[()]/g, "")
        .trim()

    const parsed = Number(normalized)

    if (!Number.isFinite(parsed)) {
        return fallback
    }

    return negativeByParens ? -parsed : parsed
}

function parseInteger(value, fallback = 0) {
    const parsed = parseInt(String(value ?? "").replace(/,/g, "").trim(), 10)
    return Number.isFinite(parsed) ? parsed : fallback
}

function parseDateTime(value) {
    const raw = cleanString(value)

    if (!raw) {
        return null
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return new Date(`${raw}T00:00:00`)
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
        const parsed = new Date(raw)
        return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const match = raw.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    )

    if (match) {
        const [, mm, dd, yyyyRaw, hh = "0", mi = "0", ss = "0"] = match
        const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw
        const parsed = new Date(
            Number(yyyy),
            Number(mm) - 1,
            Number(dd),
            Number(hh),
            Number(mi),
            Number(ss)
        )

        return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function toIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return ""
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")

    return `${year}-${month}-${day}`
}

export function toIsoDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return ""
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    const seconds = String(date.getSeconds()).padStart(2, "0")

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function inferCsvType(fileName = "") {
    const normalized = cleanString(fileName).toLowerCase()

    if (normalized.includes("account balance history")) {
        return CSV_TYPES.ACCOUNT_BALANCE_HISTORY
    }

    if (normalized.includes("position history")) {
        return CSV_TYPES.POSITION_HISTORY
    }

    if (normalized.includes("orders")) {
        return CSV_TYPES.ORDERS
    }

    if (normalized.includes("fills")) {
        return CSV_TYPES.FILLS
    }

    if (normalized.includes("performance")) {
        return CSV_TYPES.PERFORMANCE
    }

    return CSV_TYPES.UNKNOWN
}

function splitCsvLine(line) {
    const result = []
    let current = ""
    let insideQuotes = false

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                current += '"'
                i += 1
            } else {
                insideQuotes = !insideQuotes
            }
            continue
        }

        if (char === "," && !insideQuotes) {
            result.push(current)
            current = ""
            continue
        }

        current += char
    }

    result.push(current)
    return result
}

export function parseCsvText(text) {
    const safeText = cleanBom(String(text || "")).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const lines = safeText.split("\n").filter((line) => line.trim() !== "")

    if (!lines.length) {
        return {
            headers: [],
            rows: [],
        }
    }

    const headers = splitCsvLine(lines[0]).map((header, index) => {
        const value = cleanLooseString(header)
        return value || `column_${index + 1}`
    })

    const rows = []

    for (let i = 1; i < lines.length; i += 1) {
        const parts = splitCsvLine(lines[i])
        const row = {}

        headers.forEach((header, index) => {
            row[header] = cleanLooseString(parts[index] ?? "")
        })

        rows.push(row)
    }

    return {
        headers,
        rows,
    }
}

function getValue(row, keys, fallback = "") {
    for (const key of keys) {
        const exact = row[key]
        if (exact !== undefined && exact !== null && String(exact).trim() !== "") {
            return String(exact).trim()
        }

        const normalizedKey = normalizeHeader(key)
        const found = Object.keys(row).find(
            (rowKey) => normalizeHeader(rowKey) === normalizedKey
        )

        if (found && String(row[found]).trim() !== "") {
            return String(row[found]).trim()
        }
    }

    return fallback
}

function trimEnum(value) {
    return cleanString(value).replace(/\s+/g, " ")
}

function normalizeAccountKey({ accountName = "", accountId = "" }) {
    const primary = cleanString(accountName)
    const fallback = cleanString(accountId)

    return primary || fallback || ""
}

function createImportMeta(fileName, type, size = 0, lineCount = 0) {
    const importedAt = new Date().toISOString()

    return {
        fileName: cleanString(fileName),
        type,
        importedAt,
        uploadedAt: importedAt,
        size,
        lineCount,
    }
}

function groupByAccount(rows, getAccountKey) {
    return rows.reduce((acc, row) => {
        const accountKey = cleanString(getAccountKey(row))

        if (!accountKey) {
            return acc
        }

        if (!acc[accountKey]) {
            acc[accountKey] = []
        }

        acc[accountKey].push(row)
        return acc
    }, {})
}

function groupByOrderId(rows = [], getOrderId = (row) => row?.orderId) {
    return rows.reduce((acc, row) => {
        const orderId = cleanString(getOrderId(row))

        if (!orderId) {
            return acc
        }

        if (!acc[orderId]) {
            acc[orderId] = []
        }

        acc[orderId].push(row)
        return acc
    }, {})
}

function sortByDateDesc(rows, getDateValue) {
    return [...rows].sort((a, b) => {
        const aDate = parseDateTime(getDateValue(a))
        const bDate = parseDateTime(getDateValue(b))

        const aTime = aDate ? aDate.getTime() : 0
        const bTime = bDate ? bDate.getTime() : 0

        return bTime - aTime
    })
}

function summarizePositionHistory(rows) {
    const totalPnL = rows.reduce((sum, row) => sum + parseNumber(row.result, 0), 0)
    const winners = rows.filter((row) => parseNumber(row.result, 0) > 0).length
    const losers = rows.filter((row) => parseNumber(row.result, 0) < 0).length
    const contracts = rows.reduce((sum, row) => sum + parseInteger(row.contracts, 0), 0)

    return {
        trades: rows.length,
        totalPnL,
        winners,
        losers,
        contracts,
    }
}

function summarizeOrders(rows) {
    return {
        total: rows.length,
        filled: rows.filter((row) => trimEnum(row.status) === "Filled").length,
        canceled: rows.filter((row) => trimEnum(row.status) === "Canceled").length,
        working: rows.filter((row) => trimEnum(row.status) === "Working").length,
        rejected: rows.filter((row) => trimEnum(row.status) === "Rejected").length,
    }
}

function summarizeFills(rows) {
    const totalCommission = rows.reduce(
        (sum, row) => sum + parseNumber(row.commission, 0),
        0
    )

    return {
        total: rows.length,
        totalCommission,
    }
}

function summarizePerformance(rows) {
    const totalPnL = rows.reduce((sum, row) => sum + parseNumber(row.pnl, 0), 0)
    const bestTrade = rows.reduce(
        (best, row) => Math.max(best, parseNumber(row.pnl, Number.NEGATIVE_INFINITY)),
        Number.NEGATIVE_INFINITY
    )
    const worstTrade = rows.reduce(
        (worst, row) => Math.min(worst, parseNumber(row.pnl, Number.POSITIVE_INFINITY)),
        Number.POSITIVE_INFINITY
    )

    return {
        total: rows.length,
        totalPnL,
        bestTrade: Number.isFinite(bestTrade) ? bestTrade : 0,
        worstTrade: Number.isFinite(worstTrade) ? worstTrade : 0,
    }
}

function summarizeOrderFills(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {
            fillCount: 0,
            fillContracts: 0,
            avgFillPrice: 0,
            firstFillTime: "",
            lastFillTime: "",
            totalCommission: 0,
            side: "",
            instrument: "",
        }
    }

    const sortedAsc = [...rows].sort((a, b) => {
        const aTime = parseDateTime(a?.date)?.getTime() || 0
        const bTime = parseDateTime(b?.date)?.getTime() || 0
        return aTime - bTime
    })

    const fillContracts = rows.reduce(
        (sum, row) => sum + parseInteger(row.contracts, 0),
        0
    )

    const weightedPriceSum = rows.reduce((sum, row) => {
        const qty = parseInteger(row.contracts, 0)
        const price = parseNumber(row.price, 0)
        return sum + qty * price
    }, 0)

    const avgFillPrice =
        fillContracts > 0 ? weightedPriceSum / fillContracts : parseNumber(rows[0]?.price, 0)

    const totalCommission = rows.reduce(
        (sum, row) => sum + parseNumber(row.commission, 0),
        0
    )

    return {
        fillCount: rows.length,
        fillContracts,
        avgFillPrice,
        firstFillTime: sortedAsc[0]?.date || "",
        lastFillTime: sortedAsc[sortedAsc.length - 1]?.date || "",
        totalCommission,
        side: sortedAsc[0]?.side || "",
        instrument: sortedAsc[0]?.instrument || sortedAsc[0]?.contract || sortedAsc[0]?.product || "",
    }
}

export function parseAccountBalanceHistoryCsv(text, fileName, fileSize = 0) {
    const parsed = parseCsvText(text)
    const rawRows = parsed.rows

    const rows = rawRows.map((row, index) => {
        const accountId = getValue(row, ["Account ID"])
        const accountName = getValue(row, ["Account Name"])
        const tradeDate = getValue(row, ["Trade Date"])
        const totalAmount = parseNumber(getValue(row, ["Total Amount"]))
        const totalRealizedPnL = parseNumber(getValue(row, ["Total Realized PNL"]))
        const startBalance = totalAmount - totalRealizedPnL
        const accountKey = normalizeAccountKey({ accountName, accountId })

        return {
            id: `${accountKey || "account"}-${tradeDate || index}`,
            accountId,
            accountName,
            accountKey,
            tradeDate,
            date: tradeDate,
            totalAmount,
            totalRealizedPnL,
            startBalance,
            realizedBalance: totalAmount,
            liveBalance: totalAmount,
            unrealizedPnL: 0,
            raw: row,
        }
    })

    const sorted = sortByDateDesc(rows, (row) => row.tradeDate)
    const byAccount = groupByAccount(sorted, (row) => row.accountKey)

    const latestByAccount = Object.keys(byAccount).reduce((acc, accountKey) => {
        acc[accountKey] = byAccount[accountKey][0]
        return acc
    }, {})

    return {
        meta: createImportMeta(fileName, CSV_TYPES.ACCOUNT_BALANCE_HISTORY, fileSize, rawRows.length),
        headers: parsed.headers,
        rows: sorted,
        byAccount,
        latestByAccount,
        rawText: text,
    }
}

export function parsePositionHistoryCsv(text, fileName, fileSize = 0) {
    const parsed = parseCsvText(text)
    const rawRows = parsed.rows

    const rows = rawRows.map((row, index) => {
        const positionId = getValue(row, ["Position ID"])
        const tradeDate = getValue(row, ["Trade Date"])
        const soldTimestamp = getValue(row, ["Sold Timestamp"])
        const boughtTimestamp = getValue(row, ["Bought Timestamp"])
        const account = getValue(row, ["Account"])
        const contract = getValue(row, ["Contract"])
        const product = getValue(row, ["Product"])
        const productDescription = getValue(row, ["Product Description"])
        const pairedQty = parseInteger(getValue(row, ["Paired Qty"]))
        const buyPrice = parseNumber(getValue(row, ["Buy Price"]))
        const sellPrice = parseNumber(getValue(row, ["Sell Price"]))
        const pnl = parseNumber(getValue(row, ["P/L"]))
        const titleBase = contract || product || "Trade"

        return {
            id: positionId || `position-${index}`,
            positionId,
            account,
            accountKey: account,
            tradeDate,
            date: soldTimestamp || tradeDate || boughtTimestamp,
            entryTime: boughtTimestamp,
            exitTime: soldTimestamp,
            title: `${titleBase} Trade`,
            result: pnl,
            instrument: contract || product,
            contract,
            product,
            productDescription,
            contracts: pairedQty,
            buyPrice,
            sellPrice,
            note: "",
            raw: row,
        }
    })

    const sorted = sortByDateDesc(rows, (row) => row.date)
    const byAccount = groupByAccount(sorted, (row) => row.accountKey)

    const summaryByAccount = Object.keys(byAccount).reduce((acc, accountKey) => {
        acc[accountKey] = summarizePositionHistory(byAccount[accountKey])
        return acc
    }, {})

    return {
        meta: createImportMeta(fileName, CSV_TYPES.POSITION_HISTORY, fileSize, rawRows.length),
        headers: parsed.headers,
        rows: sorted,
        byAccount,
        summaryByAccount,
        rawText: text,
    }
}

export function parseOrdersCsv(text, fileName, fileSize = 0) {
    const parsed = parseCsvText(text)
    const rawRows = parsed.rows

    const rows = rawRows.map((row, index) => {
        const orderId = getValue(row, ["Order ID", "orderId"])
        const account = getValue(row, ["Account"])
        const timestamp = getValue(row, ["Timestamp"])
        const date = getValue(row, ["Date"])
        const side = trimEnum(getValue(row, ["B/S"]))
        const contract = getValue(row, ["Contract"])
        const product = getValue(row, ["Product"])
        const productDescription = getValue(row, ["Product Description"])
        const quantity = parseInteger(getValue(row, ["Quantity"]))
        const type = trimEnum(getValue(row, ["Type"]))
        const status = trimEnum(getValue(row, ["Status"]))
        const limitPrice = parseNumber(getValue(row, ["Limit Price", "decimalLimit"]))
        const stopPrice = parseNumber(getValue(row, ["Stop Price", "decimalStop"]))
        const filledQty = parseInteger(getValue(row, ["Filled Qty", "filledQty"]))
        const avgFillPrice = parseNumber(getValue(row, ["Avg Fill Price", "avgPrice"]))
        const fillTime = getValue(row, ["Fill Time"])
        const textLabel = getValue(row, ["Text"])
        const venue = getValue(row, ["Venue"])
        const notionalValue = parseNumber(getValue(row, ["Notional Value"]))
        const currency = getValue(row, ["Currency"], "USD")

        return {
            id: orderId || `order-${index}`,
            orderId,
            account,
            accountKey: account,
            date: timestamp || date,
            timestamp,
            orderDate: date,
            side,
            instrument: contract || product,
            contract,
            product,
            productDescription,
            contracts: quantity,
            type,
            status,
            limitPrice,
            stopPrice,
            filledQty,
            avgFillPrice,
            fillTime,
            text: textLabel,
            venue,
            notionalValue,
            currency,
            raw: row,
        }
    })

    const sorted = sortByDateDesc(rows, (row) => row.date)
    const byAccount = groupByAccount(sorted, (row) => row.accountKey)

    const summaryByAccount = Object.keys(byAccount).reduce((acc, accountKey) => {
        acc[accountKey] = summarizeOrders(byAccount[accountKey])
        return acc
    }, {})

    return {
        meta: createImportMeta(fileName, CSV_TYPES.ORDERS, fileSize, rawRows.length),
        headers: parsed.headers,
        rows: sorted,
        byAccount,
        summaryByAccount,
        rawText: text,
    }
}

export function parseFillsCsv(text, fileName, fileSize = 0) {
    const parsed = parseCsvText(text)
    const rawRows = parsed.rows

    const rows = rawRows.map((row, index) => {
        const fillId = getValue(row, ["Fill ID", "_id"])
        const orderId = getValue(row, ["Order ID", "_orderId"])
        const account = getValue(row, ["Account"])
        const accountId = getValue(row, ["_accountId"])
        const timestamp = getValue(row, ["Timestamp", "_timestamp"])
        const date = getValue(row, ["Date", "_tradeDate"])
        const side = trimEnum(getValue(row, ["B/S"]))
        const quantity = parseInteger(getValue(row, ["Quantity", "_qty"]))
        const price = parseNumber(getValue(row, ["Price", "_price"]))
        const contract = getValue(row, ["Contract"])
        const product = getValue(row, ["Product"])
        const productDescription = getValue(row, ["Product Description"])
        const commission = parseNumber(getValue(row, ["commission"]))
        const accountKey = normalizeAccountKey({ accountName: account, accountId })

        return {
            id: fillId || `fill-${index}`,
            fillId,
            orderId,
            account,
            accountId,
            accountKey,
            date: timestamp || date,
            timestamp,
            tradeDate: date,
            side,
            contracts: quantity,
            price,
            instrument: contract || product,
            contract,
            product,
            productDescription,
            commission,
            raw: row,
        }
    })

    const sorted = sortByDateDesc(rows, (row) => row.date)
    const byAccount = groupByAccount(sorted, (row) => row.accountKey)

    const summaryByAccount = Object.keys(byAccount).reduce((acc, accountKey) => {
        acc[accountKey] = summarizeFills(byAccount[accountKey])
        return acc
    }, {})

    return {
        meta: createImportMeta(fileName, CSV_TYPES.FILLS, fileSize, rawRows.length),
        headers: parsed.headers,
        rows: sorted,
        byAccount,
        summaryByAccount,
        rawText: text,
    }
}

export function parsePerformanceCsv(text, fileName, fileSize = 0) {
    const parsed = parseCsvText(text)
    const rawRows = parsed.rows

    const rows = rawRows.map((row, index) => {
        const symbol = getValue(row, ["symbol"])
        const qty = parseInteger(getValue(row, ["qty"]))
        const buyPrice = parseNumber(getValue(row, ["buyPrice"]))
        const sellPrice = parseNumber(getValue(row, ["sellPrice"]))
        const pnl = parseNumber(getValue(row, ["pnl"]))
        const boughtTimestamp = getValue(row, ["boughtTimestamp"])
        const soldTimestamp = getValue(row, ["soldTimestamp"])
        const duration = getValue(row, ["duration"])

        return {
            id: `performance-${index}`,
            instrument: symbol,
            contract: symbol,
            contracts: qty,
            buyPrice,
            sellPrice,
            pnl,
            entryTime: boughtTimestamp,
            exitTime: soldTimestamp,
            duration,
            date: soldTimestamp || boughtTimestamp,
            raw: row,
        }
    })

    const sorted = sortByDateDesc(rows, (row) => row.date)
    const summary = summarizePerformance(sorted)

    return {
        meta: createImportMeta(fileName, CSV_TYPES.PERFORMANCE, fileSize, rawRows.length),
        headers: parsed.headers,
        rows: sorted,
        summary,
        rawText: text,
    }
}

export async function parseImportedCsv(file) {
    const type = inferCsvType(file?.name || "")

    if (!file || typeof file.text !== "function") {
        throw new Error("Ungültige Datei.")
    }

    const text = await file.text()

    switch (type) {
        case CSV_TYPES.ACCOUNT_BALANCE_HISTORY:
            return parseAccountBalanceHistoryCsv(text, file.name, file.size || 0)
        case CSV_TYPES.POSITION_HISTORY:
            return parsePositionHistoryCsv(text, file.name, file.size || 0)
        case CSV_TYPES.ORDERS:
            return parseOrdersCsv(text, file.name, file.size || 0)
        case CSV_TYPES.FILLS:
            return parseFillsCsv(text, file.name, file.size || 0)
        case CSV_TYPES.PERFORMANCE:
            return parsePerformanceCsv(text, file.name, file.size || 0)
        default:
            return {
                meta: createImportMeta(file?.name || "", CSV_TYPES.UNKNOWN, file?.size || 0, 0),
                headers: [],
                rows: [],
                rawText: text,
            }
    }
}

export async function parseImportedCsvList(files = []) {
    const parsedList = await Promise.all(files.map((file) => parseImportedCsv(file)))
    const result = createEmptyImportStore()

    parsedList.forEach((parsed) => {
        const type = parsed?.meta?.type

        if (type && type !== CSV_TYPES.UNKNOWN) {
            result[type] = parsed
        }
    })

    if (result.positionHistory) {
        result.trades = result.positionHistory
    }

    if (result.accountBalanceHistory) {
        result.account = result.accountBalanceHistory
    }

    return result
}

export function getStoredCsvImports() {
    try {
        const raw = localStorage.getItem(CSV_IMPORT_STORAGE_KEY)
        const base = createEmptyImportStore()

        if (!raw) {
            return base
        }

        const parsed = JSON.parse(raw)
        const merged = {
            ...base,
            ...parsed,
        }

        if (!merged.positionHistory && merged.trades) {
            merged.positionHistory = merged.trades
        }

        if (!merged.accountBalanceHistory && merged.account) {
            merged.accountBalanceHistory = merged.account
        }

        return merged
    } catch {
        return createEmptyImportStore()
    }
}

function saveStoredCsvImports(nextState) {
    localStorage.setItem(CSV_IMPORT_STORAGE_KEY, JSON.stringify(cloneJson(nextState)))
}

export function getAllParsedImports() {
    const stored = getStoredCsvImports()

    return {
        accountBalanceHistory: stored.accountBalanceHistory || stored.account || null,
        positionHistory: stored.positionHistory || stored.trades || null,
        orders: stored.orders || null,
        fills: stored.fills || null,
        performance: stored.performance || null,
    }
}

export function mergeStoredCsvImports(partialState = {}) {
    const current = getStoredCsvImports()
    const next = {
        ...current,
    }

    Object.keys(partialState).forEach((key) => {
        if (partialState[key] !== undefined && partialState[key] !== null) {
            next[key] = partialState[key]
        }
    })

    if (next.positionHistory) {
        next.trades = next.positionHistory
    }

    if (next.accountBalanceHistory) {
        next.account = next.accountBalanceHistory
    }

    saveStoredCsvImports(next)
    return getAllParsedImports()
}

export async function importAndStoreCsvFiles(files = []) {
    const parsedList = await Promise.all(files.map((file) => parseImportedCsv(file)))
    const partial = createEmptyImportStore()
    const savedTypes = []
    const skippedFiles = []

    parsedList.forEach((parsed) => {
        const type = parsed?.meta?.type

        if (!type || type === CSV_TYPES.UNKNOWN) {
            skippedFiles.push(parsed?.meta?.fileName || "Unbekannte Datei")
            return
        }

        partial[type] = parsed
        savedTypes.push(type)
    })

    const mergedImports = mergeStoredCsvImports(partial)

    return {
        mergedImports,
        savedTypes,
        skippedFiles,
    }
}

export function clearStoredCsvImport(type) {
    const current = getStoredCsvImports()
    const next = {
        ...current,
    }

    if (type === CSV_TYPES.POSITION_HISTORY) {
        next.positionHistory = null
        next.trades = null
    } else if (type === CSV_TYPES.ACCOUNT_BALANCE_HISTORY) {
        next.accountBalanceHistory = null
        next.account = null
    } else if (Object.prototype.hasOwnProperty.call(next, type)) {
        next[type] = null
    }

    saveStoredCsvImports(next)
    return getAllParsedImports()
}

export function clearAllStoredCsvImports() {
    const next = createEmptyImportStore()
    saveStoredCsvImports(next)
    return getAllParsedImports()
}

export function getImportedCsvByType(type) {
    const imports = getStoredCsvImports()

    if (type === "trades") {
        return imports.positionHistory || imports.trades || null
    }

    if (type === "account") {
        return imports.accountBalanceHistory || imports.account || null
    }

    return imports[type] || null
}

export function getImportedAccounts(importData = getAllParsedImports()) {
    const accountKeys = new Set()

    const pushKeys = (source) => {
        if (!source?.byAccount) {
            return
        }

        Object.keys(source.byAccount).forEach((key) => {
            if (cleanString(key)) {
                accountKeys.add(cleanString(key))
            }
        })
    }

    pushKeys(importData?.accountBalanceHistory)
    pushKeys(importData?.positionHistory)
    pushKeys(importData?.orders)
    pushKeys(importData?.fills)

    return [...accountKeys].map((accountKey) => {
        const balanceRow = importData?.accountBalanceHistory?.latestByAccount?.[accountKey]
        const accountName = balanceRow?.accountName || accountKey
        const accountId = balanceRow?.accountId || ""

        return {
            id: accountKey,
            accountKey,
            accountName,
            accountId,
        }
    })
}

export function buildLiveCardData(importData = getAllParsedImports(), selectedAccountId, fallbackProfile = {}) {
    const balanceRow =
        importData?.accountBalanceHistory?.latestByAccount?.[selectedAccountId] || null

    return {
        accountId: balanceRow?.accountName || selectedAccountId || fallbackProfile?.id || "",
        platform: fallbackProfile?.platform || "Tradovate",
        product: fallbackProfile?.productType || "EOD",
        phase: fallbackProfile?.accountPhase || "Eval",
        accountSize: fallbackProfile?.accountSize || 25000,
        startBalance:
            balanceRow?.startBalance ||
            fallbackProfile?.accountSize ||
            25000,
        realizedPnL: balanceRow?.totalRealizedPnL || 0,
        unrealizedPnL: 0,
        realizedBalance: balanceRow?.realizedBalance || 0,
        liveBalance: balanceRow?.liveBalance || 0,
        tradeDate: balanceRow?.tradeDate || "",
        sourceFileName: importData?.accountBalanceHistory?.meta?.fileName || "",
        importedAt: importData?.accountBalanceHistory?.meta?.importedAt || "",
    }
}

export function buildJournalData(importData = getAllParsedImports(), selectedAccountId) {
    const rows = importData?.positionHistory?.byAccount?.[selectedAccountId] || []
    const summary = importData?.positionHistory?.summaryByAccount?.[selectedAccountId] || {
        trades: 0,
        totalPnL: 0,
        winners: 0,
        losers: 0,
        contracts: 0,
    }

    return {
        readOnly: rows.length > 0,
        fileName: importData?.positionHistory?.meta?.fileName || "",
        importedAt: importData?.positionHistory?.meta?.importedAt || "",
        stats: summary,
        entries: rows.map((row) => ({
            id: row.id,
            date: row.date,
            title: row.title,
            result: row.result,
            instrument: row.instrument,
            contracts: row.contracts,
            note: row.note,
            entryTime: row.entryTime,
            exitTime: row.exitTime,
        })),
    }
}

export function buildFillsData(importData = getAllParsedImports(), selectedAccountId) {
    const rows = importData?.fills?.byAccount?.[selectedAccountId] || []
    const summary = importData?.fills?.summaryByAccount?.[selectedAccountId] || {
        total: 0,
        totalCommission: 0,
    }

    return {
        readOnly: rows.length > 0,
        fileName: importData?.fills?.meta?.fileName || "",
        importedAt: importData?.fills?.meta?.importedAt || "",
        stats: summary,
        entries: rows,
    }
}

export function buildOrdersData(importData = getAllParsedImports(), selectedAccountId) {
    const rows = importData?.orders?.byAccount?.[selectedAccountId] || []
    const summary = importData?.orders?.summaryByAccount?.[selectedAccountId] || {
        total: 0,
        filled: 0,
        canceled: 0,
        working: 0,
        rejected: 0,
    }

    const fillRows = importData?.fills?.byAccount?.[selectedAccountId] || []
    const fillSummary = importData?.fills?.summaryByAccount?.[selectedAccountId] || {
        total: 0,
        totalCommission: 0,
    }

    const fillsByOrderId = groupByOrderId(fillRows, (row) => row?.orderId)

    const entries = rows.map((row) => {
        const relatedFills = fillsByOrderId[row.orderId] || []
        const relatedFillSummary = summarizeOrderFills(relatedFills)

        return {
            ...row,
            hasFills: relatedFillSummary.fillCount > 0,
            fillCount: relatedFillSummary.fillCount,
            fillContracts: relatedFillSummary.fillContracts,
            fillPrice: relatedFillSummary.avgFillPrice,
            firstFillTime: relatedFillSummary.firstFillTime,
            lastFillTime: relatedFillSummary.lastFillTime,
            totalCommission: relatedFillSummary.totalCommission,
            effectiveSide: row.side || relatedFillSummary.side || "",
            effectiveInstrument:
                row.instrument ||
                relatedFillSummary.instrument ||
                row.contract ||
                row.product ||
                "",
            effectiveTime:
                relatedFillSummary.lastFillTime ||
                row.fillTime ||
                row.timestamp ||
                row.orderDate ||
                row.date ||
                "",
            fills: relatedFills,
        }
    })

    return {
        readOnly: rows.length > 0,
        fileName: importData?.orders?.meta?.fileName || "",
        importedAt: importData?.orders?.meta?.importedAt || "",
        fillsFileName: importData?.fills?.meta?.fileName || "",
        fillsImportedAt: importData?.fills?.meta?.importedAt || "",
        stats: {
            ...summary,
            totalFills: fillSummary.total || 0,
            totalCommission: fillSummary.totalCommission || 0,
            ordersWithFills: entries.filter((entry) => entry.hasFills).length,
        },
        entries,
    }
}

export function buildRiskData(importData = getAllParsedImports(), selectedAccountId) {
    const positions = importData?.positionHistory?.byAccount?.[selectedAccountId] || []
    const latestBalance =
        importData?.accountBalanceHistory?.latestByAccount?.[selectedAccountId] || null
    const performanceRows = importData?.performance?.rows || []

    const todayPnL = positions.reduce((sum, row) => sum + parseNumber(row.result, 0), 0)
    const winners = positions.filter((row) => parseNumber(row.result, 0) > 0).length
    const losers = positions.filter((row) => parseNumber(row.result, 0) < 0).length
    const totalTrades = positions.length
    const totalContracts = positions.reduce(
        (sum, row) => sum + parseInteger(row.contracts, 0),
        0
    )

    const bestTrade = positions.reduce(
        (best, row) => Math.max(best, parseNumber(row.result, Number.NEGATIVE_INFINITY)),
        Number.NEGATIVE_INFINITY
    )

    const worstTrade = positions.reduce(
        (worst, row) => Math.min(worst, parseNumber(row.result, Number.POSITIVE_INFINITY)),
        Number.POSITIVE_INFINITY
    )

    const averageDuration =
        performanceRows.length > 0
            ? performanceRows
                .map((row) => row.duration)
                .filter(Boolean)
                .join(" | ")
            : ""

    return {
        readOnly: positions.length > 0,
        fileName: importData?.positionHistory?.meta?.fileName || "",
        importedAt: importData?.positionHistory?.meta?.importedAt || "",
        tradeDate: latestBalance?.tradeDate || "",
        accountBalance: latestBalance?.liveBalance || 0,
        realizedPnL: latestBalance?.totalRealizedPnL || 0,
        todayPnL,
        totalTrades,
        winners,
        losers,
        totalContracts,
        bestTrade: Number.isFinite(bestTrade) ? bestTrade : 0,
        worstTrade: Number.isFinite(worstTrade) ? worstTrade : 0,
        averageDuration,
    }
}

export function hasImportedDataForAccount(importData = getAllParsedImports(), selectedAccountId) {
    return Boolean(
        importData?.accountBalanceHistory?.byAccount?.[selectedAccountId]?.length ||
        importData?.positionHistory?.byAccount?.[selectedAccountId]?.length ||
        importData?.orders?.byAccount?.[selectedAccountId]?.length ||
        importData?.fills?.byAccount?.[selectedAccountId]?.length
    )
}

export function parseOrdersImport() {
    const imported = getImportedCsvByType("orders")

    if (!imported?.rows) {
        return {
            headers: [],
            rows: [],
            meta: null,
        }
    }

    const rows = imported.rows.map((row, index) => ({
        id: row.id || `csv-order-${index + 1}`,
        source: "csv",
        symbol: row.instrument || row.contract || row.product || "-",
        side: row.side || "-",
        type: row.type || "-",
        quantity: parseInteger(row.contracts, 0),
        price:
            parseNumber(row.avgFillPrice, NaN) ||
            parseNumber(row.limitPrice, NaN) ||
            parseNumber(row.stopPrice, 0),
        status: row.status || "-",
        createdAt: row.timestamp || row.date || row.fillTime || "",
        raw: row.raw || row,
    }))

    return {
        headers: imported.headers || [],
        rows,
        meta: imported.meta || null,
    }
}

export function parseTradesImport() {
    const imported = getImportedCsvByType("trades")

    if (!imported?.rows) {
        return {
            headers: [],
            rows: [],
            meta: null,
        }
    }

    const rows = imported.rows.map((row, index) => ({
        id: row.id || `csv-trade-${index + 1}`,
        source: "csv",
        date: row.date || row.tradeDate || "",
        time: row.exitTime || row.entryTime || "",
        title: row.title || `${row.instrument || "Trade"} Trade`,
        result: `${parseNumber(row.result, 0).toFixed(2)} $`,
        note: row.note || "",
        symbol: row.instrument || "-",
        side: row.side || "-",
        quantity: parseInteger(row.contracts, 0),
        entryPrice: parseNumber(row.buyPrice, 0),
        exitPrice: parseNumber(row.sellPrice, 0),
        pnl: parseNumber(row.result, 0),
        raw: row.raw || row,
    }))

    return {
        headers: imported.headers || [],
        rows,
        meta: imported.meta || null,
    }
}