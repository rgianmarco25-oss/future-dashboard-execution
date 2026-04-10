import {
    getActiveAccountId,
    getCsvImports,
    saveParsedCsvImport,
    clearParsedCsvImport,
} from "./storage";

const IMPORT_UPDATED_EVENT = "tradovate-csv-imports-updated";
const IMPORT_KEYS = [
    "orders",
    "trades",
    "cashHistory",
    "performance",
    "positionHistory",
];

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function createEmptyImport(type) {
    return {
        type,
        fileName: "",
        importedAt: "",
        headers: [],
        rows: [],
        previewRows: [],
        rawText: "",
    };
}

function getEmptyImports() {
    const cashHistory = createEmptyImport("cashHistory");

    return {
        orders: createEmptyImport("orders"),
        trades: createEmptyImport("trades"),
        cashHistory,
        dailySummary: {
            ...cashHistory,
            type: "dailySummary",
        },
        performance: createEmptyImport("performance"),
        positionHistory: createEmptyImport("positionHistory"),
    };
}

function cloneImportEntry(type, source = {}) {
    return {
        ...createEmptyImport(type),
        ...source,
        type,
        fileName: cleanString(source.fileName),
        importedAt: cleanString(source.importedAt),
        headers: Array.isArray(source.headers) ? source.headers : [],
        rows: Array.isArray(source.rows) ? source.rows : [],
        previewRows: Array.isArray(source.previewRows) ? source.previewRows : [],
        rawText: String(source.rawText || ""),
    };
}

function normalizeImportsShape(value) {
    const base = getEmptyImports();

    if (!value || typeof value !== "object") {
        return base;
    }

    const sourceCashHistory =
        value.cashHistory ||
        value.dailySummary ||
        createEmptyImport("cashHistory");

    const normalized = {
        orders: cloneImportEntry("orders", value.orders || {}),
        trades: cloneImportEntry("trades", value.trades || {}),
        cashHistory: cloneImportEntry("cashHistory", sourceCashHistory),
        performance: cloneImportEntry("performance", value.performance || {}),
        positionHistory: cloneImportEntry(
            "positionHistory",
            value.positionHistory || {}
        ),
    };

    return {
        ...normalized,
        dailySummary: {
            ...normalized.cashHistory,
            type: "dailySummary",
        },
    };
}

function attachLegacyImportAliases(imports, accountId = "") {
    const resolvedAccountId = cleanString(accountId);
    const cashRows = Array.isArray(imports?.cashHistory?.rows)
        ? imports.cashHistory.rows
        : [];

    return {
        ...imports,
        accountBalanceHistory: {
            byAccount: resolvedAccountId
                ? {
                    [resolvedAccountId]: cashRows,
                }
                : {},
            rows: cashRows,
            fileName: imports?.cashHistory?.fileName || "",
            importedAt: imports?.cashHistory?.importedAt || "",
        },
    };
}

function emitImportsUpdated() {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new CustomEvent(IMPORT_UPDATED_EVENT));
}

function resolveAccountId(accountId = "") {
    const directAccountId = cleanString(accountId);

    if (directAccountId) {
        return directAccountId;
    }

    return cleanString(getActiveAccountId());
}

function normalizeHeader(value) {
    return cleanString(value)
        .toLowerCase()
        .replace(/\u00a0/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeAccountLookup(value) {
    return cleanString(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeAccountDigits(value) {
    return cleanString(value).replace(/\D/g, "");
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const textValue = cleanString(value);

    if (!textValue) {
        return null;
    }

    let text = textValue
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    const negativeByParens = text.startsWith("(") && text.endsWith(")");
    text = text.replace(/[()]/g, "");

    if (!text) {
        return null;
    }

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (hasComma && !hasDot) {
        const lastPart = text.split(",").pop() || "";

        if (lastPart.length === 1 || lastPart.length === 2) {
            text = text.replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    }

    const parsed = Number(text);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return negativeByParens ? -Math.abs(parsed) : parsed;
}

function toNumber(value, fallback = 0) {
    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : fallback;
}

function splitCsvText(text) {
    const safeText = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];

    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < safeText.length; i += 1) {
        const char = safeText[i];
        const next = safeText[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") {
                i += 1;
            }

            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    row.push(cell);
    rows.push(row);

    return rows
        .map((currentRow) => currentRow.map((value) => cleanString(value)))
        .filter((currentRow) => currentRow.some((value) => cleanString(value)));
}

function parseCsvText(text) {
    const rows = splitCsvText(text);

    if (rows.length === 0) {
        return {
            headers: [],
            rows: [],
            previewRows: [],
        };
    }

    const headers = rows[0].map((value, index) => value || `Column ${index + 1}`);
    const dataRows = rows.slice(1).map((values, rowIndex) => {
        const result = {
            _rowIndex: rowIndex + 2,
        };

        headers.forEach((header, columnIndex) => {
            result[header] = values[columnIndex] ?? "";
        });

        return result;
    });

    return {
        headers,
        rows: dataRows,
        previewRows: dataRows.slice(0, 5),
    };
}

function getValue(row, aliases = []) {
    if (!row || typeof row !== "object") {
        return "";
    }

    const keys = Object.keys(row);
    const normalizedMap = new Map();

    keys.forEach((key) => {
        normalizedMap.set(normalizeHeader(key), key);
    });

    for (const alias of aliases) {
        const resolvedKey = normalizedMap.get(normalizeHeader(alias));

        if (resolvedKey) {
            return cleanString(row[resolvedKey]);
        }
    }

    return "";
}

function buildDateTimeValue(row, config = {}) {
    const dateTimeAliases = config.dateTimeAliases || [];
    const dateAliases = config.dateAliases || [];
    const timeAliases = config.timeAliases || [];

    const direct = getValue(row, dateTimeAliases);

    if (direct) {
        return direct;
    }

    const datePart = getValue(row, dateAliases);
    const timePart = getValue(row, timeAliases);

    if (datePart && timePart) {
        return `${datePart} ${timePart}`;
    }

    return datePart || timePart || "";
}

function getAccountCandidates(row) {
    const values = [
        getValue(row, [
            "account",
            "account id",
            "accountid",
            "accountId",
            "account name",
            "accountname",
            "_accountId",
            "_accountid",
            "account number",
            "accountnumber",
            "acct",
            "acct id",
        ]),
        row?._accountId,
        row?._accountid,
    ];

    return values
        .map((value) => ({
            raw: cleanString(value),
            key: normalizeAccountLookup(value),
            digits: normalizeAccountDigits(value),
        }))
        .filter((entry) => entry.raw || entry.key || entry.digits);
}

function matchesAccount(row, accountId) {
    const safeAccountKey = normalizeAccountLookup(accountId);
    const safeAccountDigits = normalizeAccountDigits(accountId);

    if (!safeAccountKey && !safeAccountDigits) {
        return true;
    }

    const candidates = getAccountCandidates(row);

    if (candidates.length === 0) {
        return true;
    }

    return candidates.some((candidate) => {
        const keyMatch =
            Boolean(candidate.key) &&
            Boolean(safeAccountKey) &&
            (
                candidate.key === safeAccountKey ||
                candidate.key.includes(safeAccountKey) ||
                safeAccountKey.includes(candidate.key)
            );

        const digitMatch =
            Boolean(candidate.digits) &&
            Boolean(safeAccountDigits) &&
            (
                candidate.digits === safeAccountDigits ||
                candidate.digits.includes(safeAccountDigits) ||
                safeAccountDigits.includes(candidate.digits)
            );

        return keyMatch || digitMatch;
    });
}

function filterEntriesForAccount(entries = [], accountId = "") {
    if (!cleanString(accountId)) {
        return entries;
    }

    const matched = entries.filter((entry) =>
        matchesAccount(entry.raw || entry, accountId)
    );

    if (matched.length > 0) {
        return matched;
    }

    const uniqueDigitCandidates = Array.from(
        new Set(
            entries
                .flatMap((entry) => getAccountCandidates(entry.raw || entry))
                .map((candidate) => candidate.digits)
                .filter(Boolean)
        )
    );

    if (uniqueDigitCandidates.length === 1) {
        return entries;
    }

    const uniqueKeyCandidates = Array.from(
        new Set(
            entries
                .flatMap((entry) => getAccountCandidates(entry.raw || entry))
                .map((candidate) => candidate.key)
                .filter(Boolean)
        )
    );

    if (uniqueKeyCandidates.length === 1) {
        return entries;
    }

    return matched;
}

function applyResolvedAccount(entries = [], accountId = "") {
    const resolved = cleanString(accountId);

    if (!resolved) {
        return entries;
    }

    return entries.map((entry) => ({
        ...entry,
        accountId: cleanString(entry.accountId || resolved),
        accountName: cleanString(entry.accountName || entry.account || resolved),
    }));
}

function normalizeImportKey(type) {
    const safeType = cleanString(type);

    if (safeType === "dailySummary") {
        return "cashHistory";
    }

    if (IMPORT_KEYS.includes(safeType)) {
        return safeType;
    }

    return "";
}

function getCashHistorySource(importData) {
    return (
        importData?.cashHistory ||
        importData?.dailySummary ||
        createEmptyImport("cashHistory")
    );
}

function mapOrdersRows(rows = []) {
    return rows.map((row, index) => {
        const orderIdVal =
            getValue(row, ["Order ID", "orderId", "order_id", "id"]) ||
            `csv-order-${index + 1}`;

        const instrumentVal = getValue(row, ["Contract", "Product", "Instrument", "Symbol"]);

        const contractsVal =
            getValue(row, ["Quantity", "Filled Qty", "filledQty", "qty", "Size"]) || "0";

        const filledQtyVal = getValue(row, ["Filled Qty", "filledQty", "Quantity"]) || "0";

        const timestampVal = buildDateTimeValue(row, {
            dateTimeAliases: ["Timestamp", "Fill Time"],
            dateAliases: ["Date"],
            timeAliases: ["Timestamp"],
        });

        const statusVal = getValue(row, ["Status"]);

        return {
            id: orderIdVal,
            orderId: orderIdVal,
            instrument: instrumentVal,
            symbol: instrumentVal,
            contract: instrumentVal,
            side: getValue(row, ["B/S", "Side", "Action"]),
            action: getValue(row, ["B/S", "Side", "Action"]),
            status: statusVal,
            orderStatus: statusVal,
            type: getValue(row, ["Type"]),
            contracts: contractsVal,
            quantity: contractsVal,
            qty: contractsVal,
            size: contractsVal,
            filledQty: filledQtyVal,
            avgFillPrice: getValue(row, ["Avg Fill Price", "avgPrice", "avg fill price"]),
            limitPrice: getValue(row, ["Limit Price", "decimalLimit", "limit price"]),
            stopPrice: getValue(row, ["Stop Price", "decimalStop", "stop price"]),
            timestamp: timestampVal,
            createdAt: timestampVal,
            submittedAt: timestampVal,
            time: timestampVal,
            date: timestampVal,
            accountId: getValue(row, ["Account ID", "_accountId", "Account"]),
            accountName: getValue(row, ["Account", "Account Name"]),
            raw: row,
        };
    });
}

function mapTradesRows(rows = []) {
    return rows.map((row, index) => {
        const quantityValue =
            getValue(row, ["Quantity", "_qty", "qty", "contracts"]) || "0";

        const timestampIso = buildDateTimeValue(row, {
            dateTimeAliases: ["_timestamp", "Timestamp"],
            dateAliases: ["Date", "_tradeDate", "Trade Date"],
            timeAliases: ["Timestamp"],
        });

        return {
            fillId:
                getValue(row, ["Fill ID", "_id", "id"]) ||
                `csv-fill-${index + 1}`,
            orderId: getValue(row, ["Order ID", "_orderId"]),
            tradeId: "",
            symbol: getValue(row, ["Contract", "Product", "Instrument", "Symbol"]),
            side: getValue(row, ["B/S", "Side", "_action"]),
            quantity: quantityValue,
            contracts: quantityValue,
            price: getValue(row, ["Price", "_price"]),
            commission: getValue(row, ["commission", "Commission"]),
            timestampIso,
            timestamp: timestampIso,
            date: timestampIso,
            tradeDate: timestampIso,
            accountId: getValue(row, ["_accountId", "Account ID", "Account"]),
            accountName: getValue(row, ["Account", "Account Name"]),
            raw: row,
            source: "csv",
        };
    });
}

function mapCashHistoryRows(rows = []) {
    return rows.map((row, index) => ({
        id: `cash-history-${index + 1}`,
        date: buildDateTimeValue(row, {
            dateTimeAliases: ["Trade Date", "Date", "Timestamp", "Transaction Date"],
            dateAliases: ["Trade Date", "Date", "Transaction Date"],
            timeAliases: ["Time"],
        }),
        transactionType: getValue(row, [
            "Transaction Type",
            "Type",
            "Activity Type",
            "Event Type",
        ]),
        description: getValue(row, [
            "Description",
            "Details",
            "Memo",
            "Comment",
        ]),
        amount:
            getValue(row, [
                "Amount",
                "Net Amount",
                "Transaction Amount",
                "Cash Change",
            ]) || "0",
        totalAmount:
            getValue(row, [
                "Total Amount",
                "Balance",
                "Ending Balance",
                "End Balance",
                "End Of Day Balance",
                "Net Liq",
                "Net Liquidating Value",
                "Net Liquidity",
                "Account Balance",
                "Cash Balance",
            ]) || "0",
        startingBalance:
            getValue(row, [
                "Starting Balance",
                "Start Balance",
                "Beginning Balance",
                "Start Of Day Balance",
                "Starting Account Balance",
                "Initial Balance",
            ]) || "",
        accountSize:
            getValue(row, [
                "Account Size",
                "Starting Account Size",
                "Initial Balance",
                "Starting Balance",
            ]) || "",
        accountId: getValue(row, [
            "Account ID",
            "Account",
            "_accountId",
            "Acct",
            "Acct ID",
        ]),
        accountName: getValue(row, ["Account Name", "Account"]),
        raw: row,
    }));
}

function mapPerformanceRows(rows = []) {
    return rows.map((row, index) => ({
        id: `performance-${index + 1}`,
        symbol: getValue(row, ["symbol", "Symbol"]),
        quantity: getValue(row, ["qty", "Qty"]) || "0",
        pnl: getValue(row, ["pnl", "P/L"]) || "0",
        buyPrice: getValue(row, ["buyPrice", "Buy Price"]) || "",
        sellPrice: getValue(row, ["sellPrice", "Sell Price"]) || "",
        boughtTimestamp: buildDateTimeValue(row, {
            dateTimeAliases: ["boughtTimestamp", "Bought Timestamp"],
            dateAliases: [],
            timeAliases: [],
        }),
        soldTimestamp: buildDateTimeValue(row, {
            dateTimeAliases: ["soldTimestamp", "Sold Timestamp"],
            dateAliases: [],
            timeAliases: [],
        }),
        duration: getValue(row, ["duration", "Duration"]) || "",
        buyFillId: getValue(row, ["buyFillId", "Buy Fill ID"]) || "",
        sellFillId: getValue(row, ["sellFillId", "Sell Fill ID"]) || "",
        raw: row,
    }));
}

function mapPositionHistoryRows(rows = []) {
    return rows.map((row, index) => ({
        id:
            getValue(row, ["Position ID", "Pair ID"]) ||
            `position-history-${index + 1}`,
        positionId: getValue(row, ["Position ID"]) || "",
        pairId: getValue(row, ["Pair ID"]) || "",
        timestamp: buildDateTimeValue(row, {
            dateTimeAliases: ["Timestamp"],
            dateAliases: ["Trade Date"],
            timeAliases: [],
        }),
        tradeDate: getValue(row, ["Trade Date"]) || "",
        accountId: getValue(row, ["Account ID", "Account", "_accountId"]) || "",
        account: getValue(row, ["Account"]) || "",
        contract: getValue(row, ["Contract"]) || "",
        product: getValue(row, ["Product"]) || "",
        netPos: getValue(row, ["Net Pos"]) || "0",
        netPrice: getValue(row, ["Net Price"]) || "",
        bought: getValue(row, ["Bought"]) || "0",
        avgBuy: getValue(row, ["Avg. Buy"]) || "",
        sold: getValue(row, ["Sold"]) || "0",
        avgSell: getValue(row, ["Avg. Sell"]) || "",
        pairedQty: getValue(row, ["Paired Qty"]) || "0",
        buyPrice: getValue(row, ["Buy Price"]) || "",
        sellPrice: getValue(row, ["Sell Price"]) || "",
        pnl: getValue(row, ["P/L"]) || "0",
        buyFillId: getValue(row, ["Buy Fill ID"]) || "",
        sellFillId: getValue(row, ["Sell Fill ID"]) || "",
        boughtTimestamp: buildDateTimeValue(row, {
            dateTimeAliases: ["Bought Timestamp"],
            dateAliases: [],
            timeAliases: [],
        }),
        soldTimestamp: buildDateTimeValue(row, {
            dateTimeAliases: ["Sold Timestamp"],
            dateAliases: [],
            timeAliases: [],
        }),
        raw: row,
    }));
}

function buildStatsForOrders(entries = []) {
    return entries.reduce(
        (stats, entry) => {
            const status = cleanString(entry.status).toLowerCase();

            stats.total += 1;

            if (status.includes("fill")) {
                stats.filled += 1;
            } else if (status.includes("cancel")) {
                stats.canceled += 1;
            } else if (
                status.includes("open") ||
                status.includes("working") ||
                status.includes("pending") ||
                status.includes("submit")
            ) {
                stats.working += 1;
            } else if (status.includes("reject")) {
                stats.rejected += 1;
            }

            return stats;
        },
        {
            total: 0,
            filled: 0,
            canceled: 0,
            working: 0,
            rejected: 0,
        }
    );
}

function parseDateToMs(value) {
    const text = cleanString(value);

    if (!text) {
        return null;
    }

    const direct = Date.parse(text);

    if (Number.isFinite(direct)) {
        return direct;
    }

    const swissMatch = text.match(
        /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (swissMatch) {
        const day = Number(swissMatch[1]);
        const month = Number(swissMatch[2]) - 1;
        const year = Number(swissMatch[3].length === 2 ? `20${swissMatch[3]}` : swissMatch[3]);
        const hour = Number(swissMatch[4] || 0);
        const minute = Number(swissMatch[5] || 0);
        const second = Number(swissMatch[6] || 0);

        const ms = new Date(year, month, day, hour, minute, second).getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    return null;
}

function sortEntriesByDate(entries = []) {
    return [...entries]
        .map((entry, index) => ({
            entry,
            index,
            ms: parseDateToMs(entry?.date || entry?.timestamp || entry?.tradeDate),
        }))
        .sort((left, right) => {
            if (left.ms !== null && right.ms !== null) {
                return left.ms - right.ms;
            }

            if (left.ms !== null) {
                return -1;
            }

            if (right.ms !== null) {
                return 1;
            }

            return left.index - right.index;
        })
        .map((item) => item.entry);
}

function pickFirstMeaningfulNumber(entries = [], selectors = []) {
    for (const entry of entries) {
        for (const selector of selectors) {
            const value = parseFlexibleNumber(selector(entry));

            if (value !== null && value !== 0) {
                return value;
            }
        }
    }

    for (const entry of entries) {
        for (const selector of selectors) {
            const value = parseFlexibleNumber(selector(entry));

            if (value !== null) {
                return value;
            }
        }
    }

    return null;
}

function pickLastMeaningfulNumber(entries = [], selectors = []) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];

        for (const selector of selectors) {
            const value = parseFlexibleNumber(selector(entry));

            if (value !== null && value !== 0) {
                return value;
            }
        }
    }

    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];

        for (const selector of selectors) {
            const value = parseFlexibleNumber(selector(entry));

            if (value !== null) {
                return value;
            }
        }
    }

    return null;
}

function pickFirstMeaningfulText(entries = [], selectors = []) {
    for (const entry of entries) {
        for (const selector of selectors) {
            const value = cleanString(selector(entry));

            if (value) {
                return value;
            }
        }
    }

    return "";
}

export function getCsvImportStorageKey() {
    return "tradingAppData";
}

export function getCsvImportEventName() {
    return IMPORT_UPDATED_EVENT;
}

export function getAllParsedImports(accountId = "") {
    const resolvedAccountId = resolveAccountId(accountId);

    if (!resolvedAccountId) {
        return attachLegacyImportAliases(getEmptyImports(), "");
    }

    const normalizedImports = normalizeImportsShape(getCsvImports(resolvedAccountId));
    return attachLegacyImportAliases(normalizedImports, resolvedAccountId);
}

export function getParsedImport(type, accountId = "") {
    const key = normalizeImportKey(type);

    if (!key) {
        return createEmptyImport("");
    }

    const imports = getAllParsedImports(accountId);

    if (key === "cashHistory") {
        return imports.cashHistory || createEmptyImport("cashHistory");
    }

    return imports[key] || createEmptyImport(key);
}

export function clearParsedImport(type, accountId = "") {
    const key = normalizeImportKey(type);
    const resolvedAccountId = resolveAccountId(accountId);

    if (!key || !resolvedAccountId) {
        return;
    }

    clearParsedCsvImport(resolvedAccountId, key);
    emitImportsUpdated();
}

export function saveParsedImport(type, fileName, text, accountId = "") {
    const key = normalizeImportKey(type);
    const resolvedAccountId = resolveAccountId(accountId);

    if (!key || !resolvedAccountId) {
        return createEmptyImport("");
    }

    const parsed = parseCsvText(text);

    const entry = {
        type: key,
        fileName: cleanString(fileName),
        importedAt: new Date().toISOString(),
        headers: parsed.headers,
        rows: parsed.rows,
        previewRows: parsed.previewRows,
        rawText: String(text || ""),
    };

    const savedEntry = saveParsedCsvImport(resolvedAccountId, key, entry);
    emitImportsUpdated();

    return cloneImportEntry(key, savedEntry);
}

export function buildOrdersData(importData, accountId = "") {
    const source = importData?.orders || createEmptyImport("orders");
    const mappedEntries = mapOrdersRows(source.rows || []);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, accountId),
        accountId
    );

    return {
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        stats: buildStatsForOrders(scopedEntries),
        entries: scopedEntries,
        previewRows: source.previewRows || [],
        headers: source.headers || [],
    };
}

export function buildFillsData(importData, accountId = "") {
    const source = importData?.trades || createEmptyImport("trades");
    const mappedEntries = mapTradesRows(source.rows || []);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, accountId),
        accountId
    );

    const totalCommission = scopedEntries.reduce((sum, row) => {
        return sum + Math.abs(toNumber(row.commission, 0));
    }, 0);

    return {
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        stats: {
            total: scopedEntries.length,
            totalCommission,
        },
        entries: scopedEntries,
        previewRows: source.previewRows || [],
        headers: source.headers || [],
    };
}

export function buildCashHistoryData(importData, accountId = "") {
    const source = getCashHistorySource(importData);
    const mappedEntries = mapCashHistoryRows(source.rows || []);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, accountId),
        accountId
    );

    const totalAmount = scopedEntries.reduce((sum, row) => {
        return sum + toNumber(row.amount, 0);
    }, 0);

    return {
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        stats: {
            total: scopedEntries.length,
            totalAmount,
        },
        entries: scopedEntries,
        previewRows: source.previewRows || [],
        headers: source.headers || [],
    };
}

export function buildDailySummaryData(importData, accountId = "") {
    return buildCashHistoryData(importData, accountId);
}

export function deriveCashHistorySnapshot(importData, accountId = "") {
    const cashHistoryData = buildCashHistoryData(importData, accountId);
    const sortedEntries = sortEntriesByDate(cashHistoryData.entries || []);

    const startingValue = pickFirstMeaningfulNumber(sortedEntries, [
        (entry) => entry.accountSize,
        (entry) => entry.startingBalance,
        (entry) => entry.totalAmount,
        (entry) => entry.amount,
    ]);

    const currentValue = pickLastMeaningfulNumber(sortedEntries, [
        (entry) => entry.totalAmount,
        (entry) => entry.amount,
        (entry) => entry.startingBalance,
        (entry) => entry.accountSize,
    ]);

    const firstEntry = sortedEntries[0] || null;
    const lastEntry = sortedEntries[sortedEntries.length - 1] || null;

    const accountSize = startingValue !== null ? startingValue : 0;
    const startingBalance = startingValue !== null ? startingValue : 0;
    const currentBalance =
        currentValue !== null
            ? currentValue
            : startingValue !== null
                ? startingValue
                : 0;

    return {
        hasValues: startingValue !== null || currentValue !== null,
        rowCount: sortedEntries.length,
        firstDate: cleanString(firstEntry?.date || firstEntry?.timestamp || ""),
        lastDate: cleanString(lastEntry?.date || lastEntry?.timestamp || ""),
        accountSize,
        startingBalance,
        currentBalance,
        sourceFileName: cashHistoryData.fileName || "",
        importedAt: cashHistoryData.importedAt || "",
    };
}

export function buildPerformanceData(importData, accountId = "") {
    const source = importData?.performance || createEmptyImport("performance");
    const mappedEntries = mapPerformanceRows(source.rows || []);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, accountId),
        accountId
    );

    const totalPnl = scopedEntries.reduce((sum, row) => {
        return sum + toNumber(row.pnl, 0);
    }, 0);

    return {
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        stats: {
            total: scopedEntries.length,
            totalPnl,
        },
        entries: scopedEntries,
        previewRows: source.previewRows || [],
        headers: source.headers || [],
    };
}

export function buildPositionHistoryData(importData, accountId = "") {
    const source = importData?.positionHistory || createEmptyImport("positionHistory");
    const mappedEntries = mapPositionHistoryRows(source.rows || []);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, accountId),
        accountId
    );

    const totalPnl = scopedEntries.reduce((sum, row) => {
        return sum + toNumber(row.pnl, 0);
    }, 0);

    return {
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        stats: {
            total: scopedEntries.length,
            totalPnl,
        },
        entries: scopedEntries,
        previewRows: source.previewRows || [],
        headers: source.headers || [],
    };
}

export function buildAccountReportData(importData, accountId = "") {
    return buildPerformanceData(importData, accountId);
}

export function buildLiveCardData(importData, accountId = "", account = {}) {
    const resolvedAccountId = cleanString(accountId);
    const cashHistoryData = buildCashHistoryData(importData, resolvedAccountId);
    const cashHistorySnapshot = deriveCashHistorySnapshot(importData, resolvedAccountId);
    const sortedEntries = sortEntriesByDate(cashHistoryData.entries || []);

    const importedAccountLabel = pickFirstMeaningfulText(sortedEntries, [
        (entry) => entry.accountName,
        (entry) => entry.accountId,
        (entry) => entry.raw?.accountName,
        (entry) => entry.raw?.accountId,
        (entry) => entry.raw?.Account,
        (entry) => entry.raw?.["Account Name"],
        (entry) => entry.raw?.["Account ID"],
    ]);

    const fallbackAccountSize = toNumber(account?.accountSize, 0);
    const fallbackCurrentBalance = toNumber(account?.currentBalance, fallbackAccountSize);

    const accountSize =
        cashHistorySnapshot.accountSize > 0
            ? cashHistorySnapshot.accountSize
            : fallbackAccountSize;

    const startBalance =
        cashHistorySnapshot.startingBalance > 0
            ? cashHistorySnapshot.startingBalance
            : accountSize;

    const liveBalance =
        cashHistorySnapshot.currentBalance > 0
            ? cashHistorySnapshot.currentBalance
            : fallbackCurrentBalance;

    const realizedBalance = liveBalance;
    const realizedPnL = realizedBalance - startBalance;

    return {
        accountId:
            importedAccountLabel ||
            resolvedAccountId ||
            cleanString(account?.id) ||
            cleanString(account?.accountId),
        platform: cleanString(account?.platform) || "Tradovate",
        product: cleanString(account?.productType) || "EOD",
        phase: cleanString(account?.accountPhase) || "EVAL",
        accountSize,
        startBalance,
        realizedPnL,
        unrealizedPnL: 0,
        realizedBalance,
        liveBalance,
        rowCount: cashHistorySnapshot.rowCount || cashHistoryData.entries.length,
        sourceFileName:
            cashHistorySnapshot.sourceFileName || cashHistoryData.fileName || "",
        importedAt: cashHistorySnapshot.importedAt || cashHistoryData.importedAt || "",
    };
}