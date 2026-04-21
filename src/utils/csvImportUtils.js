import {
    getActiveAccountId,
    getAccountById,
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

const DEFAULT_PROVIDER = "tradovate";

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeProvider(value) {
    return cleanString(value).toLowerCase() === "atas" ? "atas" : DEFAULT_PROVIDER;
}

function looksLikeUuid(value) {
    const text = cleanString(value);

    if (!text) {
        return false;
    }

    return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ||
        /^acc-\d+-[a-z0-9]+$/i.test(text)
    );
}

function createEmptyImport(type, provider = DEFAULT_PROVIDER) {
    return {
        type: cleanString(type),
        provider: normalizeProvider(provider),
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
    };
}

function getEmptyImports(provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);
    const cashHistory = createEmptyImport("cashHistory", normalizedProvider);

    return {
        provider: normalizedProvider,
        dataProvider: normalizedProvider,
        orders: createEmptyImport("orders", normalizedProvider),
        trades: createEmptyImport("trades", normalizedProvider),
        cashHistory,
        dailySummary: {
            ...cashHistory,
            type: "dailySummary",
        },
        performance: createEmptyImport("performance", normalizedProvider),
        positionHistory: createEmptyImport("positionHistory", normalizedProvider),
    };
}

function cloneImportEntry(type, source = {}, provider = DEFAULT_PROVIDER) {
    return {
        ...createEmptyImport(type, provider),
        ...source,
        type,
        provider: normalizeProvider(source.provider || provider),
        fileName: cleanString(source.fileName),
        importedAt: cleanString(source.importedAt),
        headers: Array.isArray(source.headers) ? source.headers : [],
        rows: Array.isArray(source.rows) ? source.rows : [],
        previewRows: Array.isArray(source.previewRows) ? source.previewRows : [],
        rawText: String(source.rawText || ""),
        appAccountId: cleanString(source.appAccountId),
        appAccountName: cleanString(source.appAccountName),
        tradingAccountId: cleanString(source.tradingAccountId),
        tradingAccountName: cleanString(source.tradingAccountName),
        tradingAccountKey: cleanString(source.tradingAccountKey),
        csvAccountRaw: cleanString(source.csvAccountRaw),
    };
}

function normalizeImportsShape(value, provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(
        value?.provider || value?.dataProvider || provider
    );
    const base = getEmptyImports(normalizedProvider);

    if (!value || typeof value !== "object") {
        return base;
    }

    const sourceCashHistory =
        value.cashHistory ||
        value.dailySummary ||
        createEmptyImport("cashHistory", normalizedProvider);

    const normalized = {
        provider: normalizedProvider,
        dataProvider: normalizedProvider,
        orders: cloneImportEntry("orders", value.orders || {}, normalizedProvider),
        trades: cloneImportEntry("trades", value.trades || {}, normalizedProvider),
        cashHistory: cloneImportEntry(
            "cashHistory",
            sourceCashHistory,
            normalizedProvider
        ),
        performance: cloneImportEntry(
            "performance",
            value.performance || {},
            normalizedProvider
        ),
        positionHistory: cloneImportEntry(
            "positionHistory",
            value.positionHistory || {},
            normalizedProvider
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

function attachLegacyImportAliases(imports, accountId = "", provider = DEFAULT_PROVIDER) {
    const resolvedAccountId = cleanString(accountId);
    const normalizedProvider = normalizeProvider(provider);
    const cashRows = Array.isArray(imports?.cashHistory?.rows)
        ? imports.cashHistory.rows
        : [];

    return {
        ...imports,
        provider: normalizedProvider,
        dataProvider: normalizedProvider,
        accountBalanceHistory: {
            byAccount: resolvedAccountId
                ? {
                    [resolvedAccountId]: cashRows,
                }
                : {},
            rows: cashRows,
            fileName: imports?.cashHistory?.fileName || "",
            importedAt: imports?.cashHistory?.importedAt || "",
            provider: normalizedProvider,
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

function resolveAccountContext(accountId = "") {
    const resolvedAccountId = resolveAccountId(accountId);
    const account = resolvedAccountId ? getAccountById(resolvedAccountId) : null;
    const provider = normalizeProvider(
        account?.dataProvider ||
        account?.source?.provider ||
        DEFAULT_PROVIDER
    );

    return {
        resolvedAccountId,
        account,
        provider,
    };
}

function getProviderAccountValues(account, provider) {
    if (!account || typeof account !== "object") {
        return {
            preferredValues: [],
            explicitTradingId: "",
            explicitTradingName: "",
        };
    }

    if (provider === "atas") {
        const preferredValues = [
            account?.atasAccountId,
            account?.atasAccountName,
            account?.dataProvider === "atas" ? account?.dataProviderAccountId : "",
            account?.dataProvider === "atas" ? account?.dataProviderAccountName : "",
            account?.displayName,
            account?.name,
            account?.accountName,
            account?.label,
            account?.id,
        ]
            .map(cleanString)
            .filter(Boolean);

        return {
            preferredValues,
            explicitTradingId: cleanString(
                account?.atasAccountId ||
                (account?.dataProvider === "atas" ? account?.dataProviderAccountId : "")
            ),
            explicitTradingName: cleanString(
                account?.atasAccountName ||
                (account?.dataProvider === "atas" ? account?.dataProviderAccountName : "") ||
                account?.displayName
            ),
        };
    }

    const preferredValues = [
        account?.tradovateAccountId,
        account?.tradovateAccountName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.apexId,
        account?.accountId,
        account?.displayName,
        account?.name,
        account?.accountName,
        account?.label,
        account?.id,
    ]
        .map(cleanString)
        .filter(Boolean);

    return {
        preferredValues,
        explicitTradingId: cleanString(
            account?.tradovateAccountId ||
            account?.tradingAccountId ||
            account?.apexId ||
            account?.accountId
        ),
        explicitTradingName: cleanString(
            account?.tradovateAccountName ||
            account?.tradingAccountName ||
            account?.displayName ||
            account?.name ||
            account?.accountName
        ),
    };
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
            "_account",
            "_accountName",
            "_accountname",
            "_accountSpec",
            "account spec",
            "accountspec",
            "account number",
            "accountnumber",
            "acct",
            "acct id",
        ]),
        row?._accountId,
        row?._accountid,
        row?._account,
        row?._accountName,
        row?._accountname,
        row?._accountSpec,
    ];

    return values
        .map((value) => ({
            raw: cleanString(value),
            key: normalizeAccountLookup(value),
            digits: normalizeAccountDigits(value),
        }))
        .filter((entry) => entry.raw || entry.key || entry.digits);
}

function matchAccountCandidate(candidate, value) {
    const safeValue = cleanString(value);

    if (!safeValue) {
        return false;
    }

    const safeKey = normalizeAccountLookup(safeValue);
    const safeDigits = normalizeAccountDigits(safeValue);

    const keyMatch =
        Boolean(candidate?.key) &&
        Boolean(safeKey) &&
        (
            candidate.key === safeKey ||
            candidate.key.includes(safeKey) ||
            safeKey.includes(candidate.key)
        );

    const digitMatch =
        Boolean(candidate?.digits) &&
        Boolean(safeDigits) &&
        (
            candidate.digits === safeDigits ||
            candidate.digits.includes(safeDigits) ||
            safeDigits.includes(candidate.digits)
        );

    return keyMatch || digitMatch;
}

function getUniqueRowAccountCandidates(rows = []) {
    const uniqueMap = new Map();

    rows.forEach((row) => {
        getAccountCandidates(row).forEach((candidate) => {
            const key = cleanString(candidate.raw || candidate.key || candidate.digits);

            if (!key) {
                return;
            }

            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, candidate);
            }
        });
    });

    return Array.from(uniqueMap.values());
}

function buildImportMeta(rows = [], resolvedAccountId = "", provider = DEFAULT_PROVIDER) {
    const appAccountId = cleanString(resolvedAccountId);
    const appAccount = appAccountId ? getAccountById(appAccountId) : null;
    const normalizedProvider = normalizeProvider(provider);

    const uniqueRowCandidates = getUniqueRowAccountCandidates(rows);
    const providerValues = getProviderAccountValues(appAccount, normalizedProvider);

    const matchedCandidate =
        uniqueRowCandidates.find((candidate) =>
            providerValues.preferredValues.some((value) =>
                matchAccountCandidate(candidate, value)
            )
        ) || null;

    const firstUsableCsvCandidate =
        uniqueRowCandidates.find((candidate) => !looksLikeUuid(candidate.raw)) ||
        uniqueRowCandidates[0] ||
        null;

    const csvPrimaryCandidate = matchedCandidate || firstUsableCsvCandidate || null;

    const tradingAccountId = cleanString(
        csvPrimaryCandidate?.raw ||
        (!looksLikeUuid(providerValues.explicitTradingId)
            ? providerValues.explicitTradingId
            : "") ||
        ""
    );

    const tradingAccountName = cleanString(
        csvPrimaryCandidate?.raw ||
        providerValues.explicitTradingName ||
        tradingAccountId ||
        appAccount?.id
    );

    const csvAccountRaw = cleanString(csvPrimaryCandidate?.raw || "");

    return {
        provider: normalizedProvider,
        appAccountId,
        appAccountName: cleanString(
            appAccount?.displayName ||
            appAccount?.name ||
            appAccount?.accountName ||
            appAccountId
        ),
        tradingAccountId,
        tradingAccountName,
        tradingAccountKey: normalizeAccountLookup(
            tradingAccountId || tradingAccountName || csvAccountRaw
        ),
        csvAccountRaw,
    };
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

function applyResolvedAccount(entries = [], scope = {}) {
    const safeScope =
        typeof scope === "string"
            ? {
                provider: DEFAULT_PROVIDER,
                tradingAccountId: scope,
                tradingAccountName: scope,
                appAccountId: "",
                appAccountName: "",
            }
            : scope || {};

    const provider = normalizeProvider(safeScope.provider);
    const appAccountId = cleanString(safeScope.appAccountId);
    const appAccountName = cleanString(safeScope.appAccountName);
    const tradingAccountId = cleanString(safeScope.tradingAccountId);
    const tradingAccountName = cleanString(
        safeScope.tradingAccountName || tradingAccountId
    );

    return entries.map((entry) => {
        const resolvedTradingAccountId = cleanString(
            entry.tradingAccountId ||
            entry.accountId ||
            tradingAccountId
        );

        const resolvedTradingAccountName = cleanString(
            entry.tradingAccountName ||
            entry.accountName ||
            tradingAccountName ||
            resolvedTradingAccountId
        );

        return {
            ...entry,
            provider,
            storageAccountId: appAccountId,
            appAccountId,
            appAccountName,
            tradingAccountId: resolvedTradingAccountId,
            tradingAccountName: resolvedTradingAccountName,
            accountId: resolvedTradingAccountId,
            accountName: resolvedTradingAccountName,
        };
    });
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
        createEmptyImport("cashHistory", importData?.provider || DEFAULT_PROVIDER)
    );
}

function buildImportScope(source, accountId = "", providerOverride = "") {
    const {
        resolvedAccountId,
        account,
        provider: accountProvider,
    } = resolveAccountContext(accountId);

    const provider = normalizeProvider(
        providerOverride ||
        source?.provider ||
        importDataProvider(source) ||
        accountProvider
    );

    const fallbackTradingAccountId = cleanString(
        provider === "atas"
            ? (
                account?.atasAccountId ||
                (account?.dataProvider === "atas" ? account?.dataProviderAccountId : "") ||
                resolvedAccountId
            )
            : (
                account?.tradovateAccountId ||
                account?.tradingAccountId ||
                resolvedAccountId
            )
    );

    const fallbackTradingAccountName = cleanString(
        provider === "atas"
            ? (
                account?.atasAccountName ||
                (account?.dataProvider === "atas" ? account?.dataProviderAccountName : "") ||
                account?.displayName ||
                fallbackTradingAccountId
            )
            : (
                account?.tradovateAccountName ||
                account?.tradingAccountName ||
                account?.displayName ||
                fallbackTradingAccountId
            )
    );

    return {
        provider,
        appAccountId: cleanString(source?.appAccountId || resolvedAccountId),
        appAccountName: cleanString(
            source?.appAccountName ||
            account?.displayName ||
            account?.name ||
            account?.accountName ||
            resolvedAccountId
        ),
        tradingAccountId: cleanString(
            source?.tradingAccountId ||
            source?.csvAccountRaw ||
            fallbackTradingAccountId
        ),
        tradingAccountName: cleanString(
            source?.tradingAccountName ||
            source?.tradingAccountId ||
            source?.csvAccountRaw ||
            fallbackTradingAccountName
        ),
        tradingAccountKey: cleanString(source?.tradingAccountKey),
        csvAccountRaw: cleanString(source?.csvAccountRaw),
    };
}

function importDataProvider(source) {
    return normalizeProvider(
        source?.provider ||
        source?.dataProvider ||
        ""
    );
}

function mapOrdersRows(rows = [], provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);

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
            provider: normalizedProvider,
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
            accountId: getValue(row, [
                "Account ID",
                "_accountId",
                "_account",
                "_accountSpec",
                "Account",
            ]),
            accountName: getValue(row, ["Account", "Account Name", "_accountName"]),
            raw: row,
        };
    });
}

function mapTradesRows(rows = [], provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);

    return rows.map((row, index) => {
        const quantityValue =
            getValue(row, ["Quantity", "_qty", "qty", "contracts"]) || "0";

        const timestampIso = buildDateTimeValue(row, {
            dateTimeAliases: ["_timestamp", "Timestamp"],
            dateAliases: ["Date", "_tradeDate", "Trade Date"],
            timeAliases: ["Time", "Timestamp"],
        });

        const pnlValue = getValue(row, [
            "Realized PnL",
            "Realized P/L",
            "Net PnL",
            "Net P/L",
            "P&L",
            "P/L",
            "pnl",
            "PnL",
            "profit",
            "realizedPnl",
        ]);

        return {
            provider: normalizedProvider,
            fillId:
                getValue(row, ["Fill ID", "_id", "id"]) ||
                `csv-fill-${index + 1}`,
            orderId: getValue(row, ["Order ID", "_orderId"]),
            tradeId: getValue(row, ["Trade ID", "tradeId", "_tradeId"]),
            symbol: getValue(row, ["Contract", "Product", "Instrument", "Symbol"]),
            side: getValue(row, ["B/S", "Side", "_action"]),
            quantity: quantityValue,
            contracts: quantityValue,
            qty: quantityValue,
            price: getValue(row, ["Price", "_price"]),
            commission: getValue(row, ["commission", "Commission"]),
            pnl: pnlValue,
            PnL: pnlValue,
            realizedPnl: pnlValue,
            netPnl: pnlValue,
            profit: pnlValue,
            timestampIso,
            timestamp: timestampIso,
            time: timestampIso,
            date: timestampIso,
            tradeDate: timestampIso,
            accountId: getValue(row, [
                "_accountId",
                "_account",
                "_accountSpec",
                "Account ID",
                "Account",
            ]),
            accountName: getValue(row, ["Account", "Account Name", "_accountName"]),
            raw: row,
            source: "csv",
        };
    });
}

function mapCashHistoryRows(rows = [], provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);

    return rows.map((row, index) => {
        const tradeDate = buildDateTimeValue(row, {
            dateTimeAliases: ["Trade Date", "Date", "Timestamp", "Transaction Date"],
            dateAliases: ["Trade Date", "Date", "Transaction Date"],
            timeAliases: ["Time"],
        });

        const accountBalanceValue =
            getValue(row, [
                "Account Balance",
                "AccountBalance",
                "Ending Balance",
                "End Balance",
                "End of Day Balance",
                "End Of Day Balance",
                "Balance",
                "Net Liq",
                "Net Liquidating Value",
                "Net Liquidity",
                "Cash Balance",
                "Total Amount",
            ]) || "0";

        const dailyPnlValue =
            getValue(row, [
                "Closed P&L",
                "Closed P/L",
                "Net P&L",
                "Net P/L",
                "Daily P&L",
                "Daily P/L",
                "P&L",
                "P/L",
                "Amount",
                "Net Amount",
                "Transaction Amount",
                "Cash Change",
            ]) || "0";

        const explicitStartingBalance = getValue(row, [
            "Starting Balance",
            "Start Balance",
            "Beginning Balance",
            "Start Of Day Balance",
            "Starting Account Balance",
            "Initial Balance",
        ]);

        const parsedBalance = parseFlexibleNumber(accountBalanceValue);
        const parsedDailyPnl = parseFlexibleNumber(dailyPnlValue);
        const parsedStartingBalance = parseFlexibleNumber(explicitStartingBalance);

        let derivedStartingBalance = explicitStartingBalance;

        if (
            (parsedStartingBalance === null || parsedStartingBalance === undefined) &&
            parsedBalance !== null &&
            parsedDailyPnl !== null
        ) {
            derivedStartingBalance = String(parsedBalance - parsedDailyPnl);
        }

        return {
            provider: normalizedProvider,
            id: `cash-history-${index + 1}`,
            date: tradeDate,
            tradeDate,
            timestamp: tradeDate,
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
            amount: dailyPnlValue,
            pnl: dailyPnlValue,
            PnL: dailyPnlValue,
            dailyPnl: dailyPnlValue,
            netPnl: dailyPnlValue,
            closedPnl: dailyPnlValue,
            totalAmount: accountBalanceValue,
            balance: accountBalanceValue,
            currentBalance: accountBalanceValue,
            endingBalance: accountBalanceValue,
            accountBalance: accountBalanceValue,
            cashBalance: accountBalanceValue,
            netLiq: accountBalanceValue,
            startingBalance: derivedStartingBalance || "",
            startBalance: derivedStartingBalance || "",
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
                "_account",
                "_accountSpec",
                "Acct",
                "Acct ID",
            ]),
            accountName: getValue(row, ["Account Name", "Account", "_accountName"]),
            raw: row,
        };
    });
}

function mapPerformanceRows(rows = [], provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);

    return rows.map((row, index) => ({
        provider: normalizedProvider,
        id: `performance-${index + 1}`,
        symbol: getValue(row, ["symbol", "Symbol"]),
        quantity: getValue(row, ["qty", "Qty"]) || "0",
        pnl: getValue(row, ["pnl", "P/L", "P&L", "Net P/L", "Net P&L"]) || "0",
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
        accountId: getValue(row, [
            "Account ID",
            "Account",
            "_accountId",
            "_account",
            "_accountSpec",
        ]),
        accountName: getValue(row, ["Account", "Account Name", "_accountName"]),
        raw: row,
    }));
}

function mapPositionHistoryRows(rows = [], provider = DEFAULT_PROVIDER) {
    const normalizedProvider = normalizeProvider(provider);

    return rows.map((row, index) => ({
        provider: normalizedProvider,
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
        accountId: getValue(row, [
            "Account ID",
            "Account",
            "_accountId",
            "_account",
            "_accountSpec",
        ]) || "",
        account: getValue(row, ["Account"]) || "",
        accountName: getValue(row, ["Account Name", "Account", "_accountName"]) || "",
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
        pnl: getValue(row, ["P/L", "P&L"]) || "0",
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
    const { resolvedAccountId, provider } = resolveAccountContext(accountId);

    if (!resolvedAccountId) {
        return attachLegacyImportAliases(getEmptyImports(DEFAULT_PROVIDER), "", DEFAULT_PROVIDER);
    }

    if (provider !== DEFAULT_PROVIDER) {
        return attachLegacyImportAliases(
            getEmptyImports(provider),
            resolvedAccountId,
            provider
        );
    }

    const normalizedImports = normalizeImportsShape(
        getCsvImports(resolvedAccountId),
        provider
    );

    return attachLegacyImportAliases(
        normalizedImports,
        resolvedAccountId,
        provider
    );
}

export function getParsedImport(type, accountId = "") {
    const key = normalizeImportKey(type);
    const { provider } = resolveAccountContext(accountId);

    if (!key) {
        return createEmptyImport("", provider);
    }

    const imports = getAllParsedImports(accountId);

    if (key === "cashHistory") {
        return imports.cashHistory || createEmptyImport("cashHistory", provider);
    }

    return imports[key] || createEmptyImport(key, provider);
}

export function clearParsedImport(type, accountId = "") {
    const key = normalizeImportKey(type);
    const { resolvedAccountId, provider } = resolveAccountContext(accountId);

    if (!key || !resolvedAccountId) {
        return;
    }

    if (provider !== DEFAULT_PROVIDER) {
        emitImportsUpdated();
        return;
    }

    clearParsedCsvImport(resolvedAccountId, key, provider);
    emitImportsUpdated();
}

export function saveParsedImport(type, fileName, text, accountId = "") {
    const key = normalizeImportKey(type);
    const { resolvedAccountId, provider } = resolveAccountContext(accountId);

    if (!key || !resolvedAccountId) {
        return createEmptyImport("", provider);
    }

    if (provider !== DEFAULT_PROVIDER) {
        return createEmptyImport(key, provider);
    }

    const parsed = parseCsvText(text);
    const meta = buildImportMeta(parsed.rows, resolvedAccountId, provider);

    const entry = {
        type: key,
        provider,
        fileName: cleanString(fileName),
        importedAt: new Date().toISOString(),
        headers: parsed.headers,
        rows: parsed.rows,
        previewRows: parsed.previewRows,
        rawText: String(text || ""),
        ...meta,
    };

    const savedEntry = saveParsedCsvImport(resolvedAccountId, key, entry, provider);
    emitImportsUpdated();

    return cloneImportEntry(key, savedEntry, provider);
}

export function buildOrdersData(importData, accountId = "") {
    const provider = normalizeProvider(
        importData?.provider ||
        importData?.dataProvider ||
        resolveAccountContext(accountId).provider
    );
    const source = importData?.orders || createEmptyImport("orders", provider);
    const scope = buildImportScope(source, accountId, provider);
    const mappedEntries = mapOrdersRows(source.rows || [], provider);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, scope.tradingAccountId),
        scope
    );

    return {
        provider,
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        appAccountId: scope.appAccountId,
        appAccountName: scope.appAccountName,
        tradingAccountId: scope.tradingAccountId,
        tradingAccountName: scope.tradingAccountName,
        csvAccountRaw: scope.csvAccountRaw,
        stats: buildStatsForOrders(scopedEntries),
        entries: scopedEntries,
        previewRows: source.previewRows || [],
        headers: source.headers || [],
    };
}

export function buildFillsData(importData, accountId = "") {
    const provider = normalizeProvider(
        importData?.provider ||
        importData?.dataProvider ||
        resolveAccountContext(accountId).provider
    );
    const source = importData?.trades || createEmptyImport("trades", provider);
    const scope = buildImportScope(source, accountId, provider);
    const mappedEntries = mapTradesRows(source.rows || [], provider);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, scope.tradingAccountId),
        scope
    );

    const totalCommission = scopedEntries.reduce((sum, row) => {
        return sum + Math.abs(toNumber(row.commission, 0));
    }, 0);

    return {
        provider,
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        appAccountId: scope.appAccountId,
        appAccountName: scope.appAccountName,
        tradingAccountId: scope.tradingAccountId,
        tradingAccountName: scope.tradingAccountName,
        csvAccountRaw: scope.csvAccountRaw,
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
    const provider = normalizeProvider(
        importData?.provider ||
        importData?.dataProvider ||
        resolveAccountContext(accountId).provider
    );
    const source = getCashHistorySource({
        ...importData,
        provider,
    });
    const scope = buildImportScope(source, accountId, provider);
    const mappedEntries = mapCashHistoryRows(source.rows || [], provider);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, scope.tradingAccountId),
        scope
    );

    const totalAmount = scopedEntries.reduce((sum, row) => {
        const currentBalance =
            parseFlexibleNumber(row.currentBalance) ??
            parseFlexibleNumber(row.totalAmount) ??
            0;

        return sum + currentBalance;
    }, 0);

    return {
        provider,
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        appAccountId: scope.appAccountId,
        appAccountName: scope.appAccountName,
        tradingAccountId: scope.tradingAccountId,
        tradingAccountName: scope.tradingAccountName,
        csvAccountRaw: scope.csvAccountRaw,
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
        (entry) => entry.startingBalance,
        (entry) => entry.startBalance,
        (entry) => entry.accountSize,
        (entry) => entry.currentBalance,
        (entry) => {
            const balance = parseFlexibleNumber(entry.currentBalance ?? entry.totalAmount);
            const pnl = parseFlexibleNumber(
                entry.dailyPnl ?? entry.netPnl ?? entry.closedPnl ?? entry.amount
            );

            if (balance === null || pnl === null) {
                return null;
            }

            return balance - pnl;
        },
        (entry) => entry.totalAmount,
        (entry) => entry.amount,
    ]);

    const currentValue = pickLastMeaningfulNumber(sortedEntries, [
        (entry) => entry.currentBalance,
        (entry) => entry.endingBalance,
        (entry) => entry.accountBalance,
        (entry) => entry.totalAmount,
        (entry) => entry.balance,
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
        provider: cashHistoryData.provider,
        hasValues: startingValue !== null || currentValue !== null,
        rowCount: sortedEntries.length,
        firstDate: cleanString(firstEntry?.date || firstEntry?.timestamp || ""),
        lastDate: cleanString(lastEntry?.date || lastEntry?.timestamp || ""),
        accountSize,
        startingBalance,
        currentBalance,
        sourceFileName: cashHistoryData.fileName || "",
        importedAt: cashHistoryData.importedAt || "",
        appAccountId: cashHistoryData.appAccountId || "",
        appAccountName: cashHistoryData.appAccountName || "",
        tradingAccountId: cashHistoryData.tradingAccountId || "",
        tradingAccountName: cashHistoryData.tradingAccountName || "",
        csvAccountRaw: cashHistoryData.csvAccountRaw || "",
    };
}

export function buildPerformanceData(importData, accountId = "") {
    const provider = normalizeProvider(
        importData?.provider ||
        importData?.dataProvider ||
        resolveAccountContext(accountId).provider
    );
    const source = importData?.performance || createEmptyImport("performance", provider);
    const scope = buildImportScope(source, accountId, provider);
    const mappedEntries = mapPerformanceRows(source.rows || [], provider);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, scope.tradingAccountId),
        scope
    );

    const totalPnl = scopedEntries.reduce((sum, row) => {
        return sum + toNumber(row.pnl, 0);
    }, 0);

    return {
        provider,
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        appAccountId: scope.appAccountId,
        appAccountName: scope.appAccountName,
        tradingAccountId: scope.tradingAccountId,
        tradingAccountName: scope.tradingAccountName,
        csvAccountRaw: scope.csvAccountRaw,
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
    const provider = normalizeProvider(
        importData?.provider ||
        importData?.dataProvider ||
        resolveAccountContext(accountId).provider
    );
    const source = importData?.positionHistory || createEmptyImport("positionHistory", provider);
    const scope = buildImportScope(source, accountId, provider);
    const mappedEntries = mapPositionHistoryRows(source.rows || [], provider);
    const scopedEntries = applyResolvedAccount(
        filterEntriesForAccount(mappedEntries, scope.tradingAccountId),
        scope
    );

    const totalPnl = scopedEntries.reduce((sum, row) => {
        return sum + toNumber(row.pnl, 0);
    }, 0);

    return {
        provider,
        readOnly: scopedEntries.length > 0,
        fileName: source.fileName || "",
        importedAt: source.importedAt || "",
        appAccountId: scope.appAccountId,
        appAccountName: scope.appAccountName,
        tradingAccountId: scope.tradingAccountId,
        tradingAccountName: scope.tradingAccountName,
        csvAccountRaw: scope.csvAccountRaw,
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
    const provider = normalizeProvider(
        importData?.provider ||
        importData?.dataProvider ||
        account?.dataProvider ||
        account?.source?.provider ||
        DEFAULT_PROVIDER
    );
    const cashHistoryData = buildCashHistoryData(
        {
            ...importData,
            provider,
        },
        resolvedAccountId
    );
    const cashHistorySnapshot = deriveCashHistorySnapshot(
        {
            ...importData,
            provider,
        },
        resolvedAccountId
    );
    const sortedEntries = sortEntriesByDate(cashHistoryData.entries || []);

    const importedAccountLabel =
        cleanString(cashHistoryData.tradingAccountName) ||
        cleanString(cashHistoryData.tradingAccountId) ||
        pickFirstMeaningfulText(sortedEntries, [
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
        provider,
        accountId:
            importedAccountLabel ||
            resolvedAccountId ||
            cleanString(account?.id) ||
            cleanString(account?.accountId),
        tradingAccountId:
            cleanString(cashHistoryData.tradingAccountId) ||
            importedAccountLabel,
        tradingAccountName:
            cleanString(cashHistoryData.tradingAccountName) ||
            importedAccountLabel,
        appAccountId: cleanString(cashHistoryData.appAccountId) || resolvedAccountId,
        appAccountName: cleanString(cashHistoryData.appAccountName),
        platform:
            provider === "atas"
                ? "ATAS"
                : cleanString(account?.platform) || "Tradovate",
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