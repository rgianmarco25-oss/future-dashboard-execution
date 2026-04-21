import {
    useCallback,
    useMemo,
    useState,
    useSyncExternalStore,
} from "react";
import { formatDateTime } from "../utils/dateFormat";
import * as csvImportUtils from "../utils/csvImportUtils";
import {
    getActiveProvider,
    getStrictProviderDisplayName,
    shouldUseAtasZeroState,
} from "../utils/providerDisplay";
import {
    clearCashHistory,
    clearImportedFills,
    clearImportedOrders,
    clearParsedCsvImport,
    getAccounts,
    getActiveAccountId,
    getCsvImports,
    saveParsedCsvImport,
    subscribeStorage,
    syncImportedCashHistory,
    syncImportedFills,
    syncImportedOrders,
    updateAccount,
} from "../utils/storage";

const COLORS = {
    panelBg: "#050816",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#7dd3fc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    positive: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    cyan: "#22d3ee",
    purple: "#a78bfa",
    cardBg: "rgba(255, 255, 255, 0.04)",
    cardBgStrong: "rgba(255, 255, 255, 0.06)",
    buttonBg: "rgba(14, 116, 144, 0.22)",
    buttonBorder: "rgba(125, 211, 252, 0.35)",
};

const PREVIEW_LIMIT = 5;

const IMPORT_TYPE_META = {
    orders: {
        key: "orders",
        label: "Orders",
    },
    trades: {
        key: "trades",
        label: "Fills",
    },
    cashHistory: {
        key: "cashHistory",
        label: "Cash History",
    },
    performance: {
        key: "performance",
        label: "Performance",
    },
    positionHistory: {
        key: "positionHistory",
        label: "Position History",
    },
    unknown: {
        key: "unknown",
        label: "Unbekannt",
    },
};

const GENERAL_ACCOUNT_KEYS = [
    "Account",
    "Account Name",
    "Account Number",
    "Account ID",
    "Account Id",
    "Trading Account",
    "Trading Account Name",
    "Trading Account ID",
    "Acct",
    "account",
    "accountName",
    "accountId",
    "accountNumber",
    "account_id",
    "account_name",
];

const TYPE_ACCOUNT_KEYS = {
    orders: [
        "Account",
        "Account Name",
        "Account ID",
        "Account Id",
        "Trading Account",
        "Trading Account Name",
        "Trading Account ID",
        "account",
        "accountName",
        "accountId",
    ],
    trades: [
        "Account",
        "Account Name",
        "Account ID",
        "Account Id",
        "Trading Account",
        "Trading Account Name",
        "Trading Account ID",
        "account",
        "accountName",
        "accountId",
    ],
    cashHistory: [
        "Account",
        "Account Name",
        "Account ID",
        "Account Id",
        "account",
        "accountName",
        "accountId",
    ],
    performance: [
        "Account",
        "Account Name",
        "Account ID",
        "Account Id",
        "account",
        "accountName",
        "accountId",
    ],
    positionHistory: [
        "Account",
        "Account Name",
        "Account ID",
        "Account Id",
        "account",
        "accountName",
        "accountId",
    ],
};

const TRADING_ACCOUNT_ID_KEYS = [
    "Trading Account ID",
    "Account ID",
    "Account Id",
    "Account Number",
    "accountId",
    "account_id",
    "accountNumber",
];

const TRADING_ACCOUNT_NAME_KEYS = [
    "Trading Account Name",
    "Trading Account",
    "Account Name",
    "accountName",
    "account_name",
];

const GENERIC_NON_ACCOUNT_VALUES = new Set([
    "orders",
    "order",
    "fills",
    "fill",
    "trades",
    "trade",
    "performance",
    "positionhistory",
    "positionhistorycsv",
    "position history",
    "cashhistory",
    "cash history",
    "dailysummary",
    "daily summary",
    "accountbalancehistory",
    "account balance history",
    "unknown",
]);

const MATCH_PRIORITY = {
    tradingAccountId: 5,
    tradingAccountName: 4,
    tradingAccountKey: 3,
    displayName: 2,
    appAccountId: 1,
    activeAccountFallback: 0,
};

const EMPTY_IMPORT_CENTER_SNAPSHOT = Object.freeze({
    accounts: [],
    activeAccountId: "",
    activeAccount: null,
    activeImports: null,
});

let cachedImportCenterSnapshotSignature = "";
let cachedImportCenterSnapshotValue = EMPTY_IMPORT_CENTER_SNAPSHOT;

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeProvider(value) {
    const lower = cleanString(value).toLowerCase();

    if (!lower) {
        return "";
    }

    if (lower.includes("atas")) {
        return "atas";
    }

    if (lower.includes("trado")) {
        return "tradovate";
    }

    return lower;
}

function formatProviderLabel(value) {
    const provider = normalizeProvider(value);

    if (provider === "atas") {
        return "ATAS";
    }

    if (provider === "tradovate") {
        return "Tradovate";
    }

    return provider ? provider.toUpperCase() : "Tradovate";
}

function resolvePanelProvider(props, activeAccount) {
    const candidates = [
        props?.provider,
        props?.activeProvider,
        props?.dataProvider,
        props?.sourceProvider,
        activeAccount?.provider,
        activeAccount?.activeProvider,
        activeAccount?.dataProvider,
        activeAccount?.sourceProvider,
        activeAccount?.platform,
        activeAccount?.broker,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeProvider(candidate);

        if (normalized) {
            return normalized;
        }
    }

    return "tradovate";
}

function looksLikeImportCollection(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return (
        Object.prototype.hasOwnProperty.call(value, "orders") ||
        Object.prototype.hasOwnProperty.call(value, "trades") ||
        Object.prototype.hasOwnProperty.call(value, "cashHistory") ||
        Object.prototype.hasOwnProperty.call(value, "dailySummary") ||
        Object.prototype.hasOwnProperty.call(value, "performance") ||
        Object.prototype.hasOwnProperty.call(value, "positionHistory")
    );
}

function hasImportRows(importEntry) {
    if (!importEntry || typeof importEntry !== "object") {
        return false;
    }

    if (Array.isArray(importEntry.rows) && importEntry.rows.length > 0) {
        return true;
    }

    if (Array.isArray(importEntry.previewRows) && importEntry.previewRows.length > 0) {
        return true;
    }

    if (Array.isArray(importEntry.headers) && importEntry.headers.length > 0) {
        return true;
    }

    if (cleanString(importEntry.rawText)) {
        return true;
    }

    return false;
}

function getImportEntryProvider(importEntry) {
    return normalizeProvider(
        importEntry?.provider ||
        importEntry?.dataProvider ||
        importEntry?.providerLabel
    );
}

function entryMatchesProvider(importEntry, provider) {
    if (!hasImportRows(importEntry)) {
        return false;
    }

    const normalizedProvider = normalizeProvider(provider);
    const entryProvider = getImportEntryProvider(importEntry);

    if (!entryProvider) {
        return normalizedProvider === "tradovate";
    }

    return entryProvider === normalizedProvider;
}

function hasImportCollectionContent(value) {
    if (!looksLikeImportCollection(value)) {
        return false;
    }

    return ["orders", "trades", "cashHistory", "performance", "positionHistory"].some((key) =>
        hasImportRows(value?.[key])
    );
}

function hasProviderCollectionContent(value, provider) {
    if (!looksLikeImportCollection(value)) {
        return false;
    }

    return ["orders", "trades", "cashHistory", "performance", "positionHistory"].some((key) =>
        entryMatchesProvider(value?.[key], provider)
    );
}

function resolveImportsForProvider(provider, ...sources) {
    const normalizedProvider = normalizeProvider(provider);

    for (const source of sources) {
        if (!source || typeof source !== "object") {
            continue;
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.[normalizedProvider])
        ) {
            return source[normalizedProvider];
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.byProvider?.[normalizedProvider])
        ) {
            return source.byProvider[normalizedProvider];
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.importsByProvider?.[normalizedProvider])
        ) {
            return source.importsByProvider[normalizedProvider];
        }

        if (
            normalizedProvider &&
            looksLikeImportCollection(source?.providers?.[normalizedProvider])
        ) {
            return source.providers[normalizedProvider];
        }

        if (
            normalizedProvider === "atas" &&
            hasProviderCollectionContent(source, "atas")
        ) {
            return source;
        }

        if (
            normalizedProvider !== "atas" &&
            hasImportCollectionContent(source)
        ) {
            return source;
        }
    }

    for (const source of sources) {
        if (
            normalizedProvider === "atas" &&
            hasProviderCollectionContent(source, "atas")
        ) {
            return source;
        }

        if (
            normalizedProvider !== "atas" &&
            looksLikeImportCollection(source)
        ) {
            return source;
        }
    }

    return {};
}

function callImportBuilder(builderName, imports, scopeTradingAccountId, provider) {
    const builder = csvImportUtils?.[builderName];

    if (typeof builder !== "function") {
        return { entries: [] };
    }

    const attempts = [
        () => builder(imports, scopeTradingAccountId, { provider }),
        () => builder(imports, scopeTradingAccountId, provider),
        () => builder(imports, scopeTradingAccountId),
    ];

    for (const attempt of attempts) {
        try {
            const result = attempt();

            if (result && typeof result === "object") {
                return result;
            }
        } catch {
            continue;
        }
    }

    return { entries: [] };
}

function callDeriveCashHistorySnapshot(importShape, scopeTradingAccountId, provider) {
    if (typeof csvImportUtils.deriveCashHistorySnapshot !== "function") {
        return null;
    }

    const attempts = [
        () => csvImportUtils.deriveCashHistorySnapshot(
            importShape,
            scopeTradingAccountId,
            { provider }
        ),
        () => csvImportUtils.deriveCashHistorySnapshot(
            importShape,
            scopeTradingAccountId,
            provider
        ),
        () => csvImportUtils.deriveCashHistorySnapshot(
            importShape,
            scopeTradingAccountId
        ),
    ];

    for (const attempt of attempts) {
        try {
            return attempt();
        } catch {
            continue;
        }
    }

    return null;
}


function normalizeValue(value) {
    return cleanString(value).toLowerCase();
}

function compactValue(value) {
    return normalizeValue(value).replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line) {
    const result = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"') {
            if (insideQuotes && next === '"') {
                current += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
            continue;
        }

        if (char === "," && !insideQuotes) {
            result.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    result.push(current);
    return result.map((value) => value.replace(/\r/g, "").trim());
}

function parseCsvText(rawText) {
    const lines = cleanString(rawText)
        .split(/\n/)
        .map((line) => line.replace(/\r/g, ""))
        .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
        return {
            headers: [],
            rows: [],
            previewRows: [],
        };
    }

    const headers = splitCsvLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
        const values = splitCsvLine(line);
        const row = {};

        headers.forEach((header, index) => {
            row[header] = values[index] ?? "";
        });

        return row;
    });

    return {
        headers,
        rows,
        previewRows: rows.slice(0, PREVIEW_LIMIT),
    };
}

function getRowValue(row, keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
            const value = cleanString(row[key]);
            if (value) {
                return value;
            }
        }
    }

    return "";
}

function getFirstNonEmptyValue(rows, keys) {
    for (const row of rows) {
        const value = getRowValue(row, keys);
        if (value) {
            return value;
        }
    }

    return "";
}

function isLikelyTradingAccountValue(value) {
    const raw = cleanString(value);
    const normalized = normalizeValue(raw);
    const compact = compactValue(raw);

    if (!raw || compact.length < 4) {
        return false;
    }

    if (
        GENERIC_NON_ACCOUNT_VALUES.has(normalized) ||
        GENERIC_NON_ACCOUNT_VALUES.has(compact)
    ) {
        return false;
    }

    if (compact.startsWith("apex") || compact.startsWith("paapex")) {
        return true;
    }

    if (/\d{4,}/.test(raw)) {
        return true;
    }

    if (/^[a-z]+[a-z0-9]*\d+[a-z0-9]*$/i.test(raw)) {
        return true;
    }

    return false;
}

function sanitizeTradingAccountValue(value) {
    const raw = cleanString(value);
    return isLikelyTradingAccountValue(raw) ? raw : "";
}

function extractAccountFromFileName(fileName) {
    const raw = cleanString(fileName).replace(/\.csv$/i, "");

    if (!raw) {
        return "";
    }

    const apexMatch = raw.match(/((?:pa)?apex[a-z0-9]+)/i);
    if (apexMatch?.[1]) {
        return sanitizeTradingAccountValue(apexMatch[1]);
    }

    const longTokenMatch = raw.match(/([a-z]{2,}[a-z0-9]{6,})/i);
    if (longTokenMatch?.[1]) {
        return sanitizeTradingAccountValue(longTokenMatch[1]);
    }

    return "";
}

function hasAllHeaders(normalizedHeaders, required) {
    return required.every((header) => normalizedHeaders.includes(header));
}

function hasAnyHeaderText(headerText, parts) {
    return parts.some((part) => headerText.includes(part));
}

function detectImportType(fileName, headers) {
    const normalizedFileName = normalizeValue(fileName);
    const normalizedHeaders = headers.map((header) => normalizeValue(header));
    const headerText = normalizedHeaders.join(" | ");

    if (
        normalizedFileName.includes("orders") ||
        normalizedFileName.includes("order") ||
        hasAllHeaders(normalizedHeaders, ["instrument", "action", "status"]) ||
        (hasAnyHeaderText(headerText, ["order type", "order qty", "filled qty"]) &&
            hasAnyHeaderText(headerText, ["status", "instrument"]))
    ) {
        return IMPORT_TYPE_META.orders.key;
    }

    if (
        normalizedFileName.includes("fills") ||
        normalizedFileName.includes("fill") ||
        normalizedFileName.includes("trade") ||
        hasAllHeaders(normalizedHeaders, ["instrument", "price", "buy/sell"]) ||
        (hasAnyHeaderText(headerText, ["commission", "realized", "filled"]) &&
            hasAnyHeaderText(headerText, ["instrument", "price"]))
    ) {
        return IMPORT_TYPE_META.trades.key;
    }

    if (
        normalizedFileName.includes("cash") ||
        normalizedFileName.includes("balance") ||
        normalizedFileName.includes("daily summary") ||
        hasAnyHeaderText(headerText, [
            "end of day balance",
            "cash balance",
            "net liq",
            "total amount",
        ]) ||
        (hasAnyHeaderText(headerText, ["starting balance", "ending balance"]) &&
            hasAnyHeaderText(headerText, ["date"]))
    ) {
        return IMPORT_TYPE_META.cashHistory.key;
    }

    if (
        normalizedFileName.includes("performance") ||
        hasAnyHeaderText(headerText, ["gross pnl", "net profit", "winning trades", "losing trades"]) ||
        hasAnyHeaderText(headerText, ["profit factor", "avg win", "avg loss"])
    ) {
        return IMPORT_TYPE_META.performance.key;
    }

    if (
        normalizedFileName.includes("position history") ||
        normalizedFileName.includes("positionhistory") ||
        hasAnyHeaderText(headerText, ["entry price", "exit price", "entry time", "exit time"]) ||
        (hasAnyHeaderText(headerText, ["position", "realized pnl"]) &&
            hasAnyHeaderText(headerText, ["entry", "exit"]))
    ) {
        return IMPORT_TYPE_META.positionHistory.key;
    }

    return IMPORT_TYPE_META.unknown.key;
}

function buildUniqueValues(values) {
    return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}

function buildTextVariants(value) {
    const raw = cleanString(value);
    const normalized = normalizeValue(raw);
    const compact = compactValue(raw);
    const digitGroups = raw.match(/\d{4,}/g) ?? [];

    return buildUniqueValues([raw, normalized, compact, ...digitGroups]);
}

function mergeVariantLists(...lists) {
    const merged = [];

    lists.forEach((list) => {
        if (!Array.isArray(list)) {
            return;
        }

        list.forEach((value) => {
            const safeValue = cleanString(value);
            if (safeValue) {
                merged.push(safeValue);
            }
        });
    });

    return buildUniqueValues(merged);
}

function detectTradingAccount(rows, headers, fileName, type) {
    const accountIdFromRows = sanitizeTradingAccountValue(
        getFirstNonEmptyValue(rows, TRADING_ACCOUNT_ID_KEYS)
    );

    const accountNameFromRows = sanitizeTradingAccountValue(
        getFirstNonEmptyValue(rows, TRADING_ACCOUNT_NAME_KEYS)
    );

    const genericAccountFromRows = sanitizeTradingAccountValue(
        getFirstNonEmptyValue(rows, TYPE_ACCOUNT_KEYS[type] ?? GENERAL_ACCOUNT_KEYS)
    );

    let fallbackFromHeader = "";
    const headerNames = headers.map((header) => cleanString(header));

    for (const header of headerNames) {
        const normalizedHeader = normalizeValue(header);

        if (normalizedHeader.includes("account")) {
            const value = sanitizeTradingAccountValue(
                getFirstNonEmptyValue(rows, [header])
            );

            if (value) {
                fallbackFromHeader = value;
                break;
            }
        }
    }

    const accountFromFileName = extractAccountFromFileName(fileName);

    const accountId = accountIdFromRows || "";
    let accountName = accountNameFromRows || "";

    if (!accountName && genericAccountFromRows && genericAccountFromRows !== accountId) {
        accountName = genericAccountFromRows;
    }

    if (!accountName && fallbackFromHeader && fallbackFromHeader !== accountId) {
        accountName = fallbackFromHeader;
    }

    const accountKey =
        accountId ||
        accountName ||
        genericAccountFromRows ||
        fallbackFromHeader ||
        accountFromFileName ||
        "";

    const displayValue = accountName || accountId || accountKey || "";

    let source = "none";

    if (accountIdFromRows) {
        source = "csv-row:account-id";
    } else if (accountNameFromRows) {
        source = "csv-row:account-name";
    } else if (genericAccountFromRows || fallbackFromHeader) {
        source = "csv-row";
    } else if (accountFromFileName) {
        source = "file-name";
    }

    return {
        value: displayValue,
        source,
        variants: mergeVariantLists(
            buildTextVariants(accountId),
            buildTextVariants(accountName),
            buildTextVariants(accountKey),
            buildTextVariants(displayValue)
        ),
        accountId,
        accountName,
        accountKey,
    };
}

function buildAccountMatchIndex(account) {
    const tradingAccountId = cleanString(account?.tradingAccountId);
    const tradingAccountName = cleanString(account?.tradingAccountName);
    const tradingAccountKey = cleanString(account?.tradingAccountKey);
    const displayName = cleanString(account?.displayName);
    const id = cleanString(account?.id);

    return {
        tradingAccountId,
        tradingAccountName,
        tradingAccountKey,
        displayName,
        id,
        tradingAccountIdVariants: buildTextVariants(tradingAccountId),
        tradingAccountNameVariants: buildTextVariants(tradingAccountName),
        tradingAccountKeyVariants: buildTextVariants(tradingAccountKey),
        displayNameVariants: buildTextVariants(displayName),
        idVariants: buildTextVariants(id),
    };
}

function scoreVariantMatch(sourceVariants, targetVariants) {
    if (!sourceVariants.length || !targetVariants.length) {
        return 0;
    }

    for (const source of sourceVariants) {
        for (const target of targetVariants) {
            if (!source || !target) {
                continue;
            }

            if (source === target) {
                return 100;
            }
        }
    }

    for (const source of sourceVariants) {
        for (const target of targetVariants) {
            if (!source || !target) {
                continue;
            }

            if (source.length >= 6 && target.includes(source)) {
                return 80;
            }

            if (target.length >= 6 && source.includes(target)) {
                return 80;
            }
        }
    }

    return 0;
}

function getPriorityByReason(reason) {
    return MATCH_PRIORITY[reason] ?? -1;
}

function createMatchEntry(account, score, reason, confidence) {
    return {
        account,
        score,
        reason,
        confidence,
        priority: getPriorityByReason(reason),
    };
}

function compareMatchEntries(left, right) {
    if (right.priority !== left.priority) {
        return right.priority - left.priority;
    }

    if (right.score !== left.score) {
        return right.score - left.score;
    }

    const leftName = cleanString(left?.account?.displayName);
    const rightName = cleanString(right?.account?.displayName);

    return leftName.localeCompare(rightName);
}

function scoreAccountMatch(account, detection, activeAccountId) {
    const index = buildAccountMatchIndex(account);
    const sourceVariants = detection.variants ?? [];
    const candidates = [];

    const idScore = scoreVariantMatch(sourceVariants, index.tradingAccountIdVariants);
    if (idScore > 0) {
        candidates.push(
            createMatchEntry(
                account,
                idScore + 20,
                "tradingAccountId",
                idScore >= 100 ? "high" : "medium"
            )
        );
    }

    const nameScore = scoreVariantMatch(sourceVariants, index.tradingAccountNameVariants);
    if (nameScore > 0) {
        candidates.push(
            createMatchEntry(
                account,
                nameScore + 10,
                "tradingAccountName",
                nameScore >= 100 ? "high" : "medium"
            )
        );
    }

    const keyScore = scoreVariantMatch(sourceVariants, index.tradingAccountKeyVariants);
    if (keyScore > 0) {
        candidates.push(
            createMatchEntry(
                account,
                keyScore + 5,
                "tradingAccountKey",
                keyScore >= 100 ? "medium" : "low"
            )
        );
    }

    const displayNameScore = scoreVariantMatch(sourceVariants, index.displayNameVariants);
    if (displayNameScore > 0) {
        candidates.push(
            createMatchEntry(
                account,
                displayNameScore,
                "displayName",
                displayNameScore >= 100 ? "medium" : "low"
            )
        );
    }

    const internalIdScore = scoreVariantMatch(sourceVariants, index.idVariants);
    if (internalIdScore > 0) {
        candidates.push(
            createMatchEntry(
                account,
                internalIdScore,
                "appAccountId",
                "low"
            )
        );
    }

    if (
        candidates.length === 0 &&
        !detection.value &&
        cleanString(activeAccountId) === cleanString(account?.id)
    ) {
        candidates.push(
            createMatchEntry(
                account,
                15,
                "activeAccountFallback",
                "low"
            )
        );
    }

    if (candidates.length === 0) {
        return {
            account,
            score: 0,
            reason: "",
            confidence: "none",
            priority: -1,
        };
    }

    candidates.sort(compareMatchEntries);
    return candidates[0];
}

function matchAccountsByTradingAccount(accounts, detection, activeAccountId) {
    const matches = accounts
        .map((account) => scoreAccountMatch(account, detection, activeAccountId))
        .filter((entry) => entry.score > 0)
        .sort(compareMatchEntries);

    const topMatch = matches[0] ?? null;
    const secondMatch = matches[1] ?? null;

    const hasConflict =
        Boolean(topMatch) &&
        Boolean(secondMatch) &&
        topMatch.priority === secondMatch.priority &&
        topMatch.score >= 70 &&
        secondMatch.score >= 70 &&
        Math.abs(topMatch.score - secondMatch.score) <= 5;

    let suggestedTargetAccountId = "";
    if (topMatch && !hasConflict) {
        suggestedTargetAccountId = cleanString(topMatch.account?.id);
    }

    return {
        matches,
        topMatch,
        hasConflict,
        suggestedTargetAccountId,
    };
}

function getStatusMeta(item) {
    if (item.type === IMPORT_TYPE_META.unknown.key) {
        return {
            key: "unknown-type",
            label: "Typ offen",
            color: COLORS.warning,
        };
    }

    if (item.accountConflict) {
        return {
            key: "conflict",
            label: "Konflikt",
            color: COLORS.danger,
        };
    }

    if (!item.targetAccountId) {
        return {
            key: "target-open",
            label: "Ziel offen",
            color: COLORS.warning,
        };
    }

    return {
        key: "ready",
        label: "Bereit",
        color: COLORS.positive,
    };
}

function buildParsedImportPayload(item, targetAccount, provider) {
    const normalizedProvider = normalizeProvider(provider);
    const appAccountId = cleanString(targetAccount?.id || item.targetAccountId);
    const appAccountName = cleanString(
        targetAccount?.displayName ||
        targetAccount?.name ||
        targetAccount?.accountName ||
        appAccountId
    );

    if (normalizedProvider === "atas") {
        const atasAccountId = cleanString(
            item?.tradingAccountId ||
            item?.tradingAccount ||
            ""
        );

        const atasAccountName = cleanString(
            item?.tradingAccountName ||
            item?.tradingAccount ||
            atasAccountId
        );

        return {
            type: item.type,
            provider: normalizedProvider,
            dataProvider: normalizedProvider,
            providerLabel: formatProviderLabel(normalizedProvider),
            fileName: item.file.name,
            importedAt: new Date().toISOString(),
            headers: item.headers,
            rows: item.rows,
            previewRows: item.previewRows,
            rawText: item.file.rawText,
            appAccountId,
            appAccountName,
            tradingAccountId: "",
            tradingAccountName: "",
            tradingAccountKey: "",
            dataProviderAccountId: atasAccountId,
            dataProviderAccountName: atasAccountName,
            atasAccountId,
            atasAccountName,
            csvAccountRaw: cleanString(
                item?.tradingAccount ||
                item?.tradingAccountId ||
                item?.tradingAccountName
            ),
        };
    }

    const tradingAccountId = cleanString(
        item?.tradingAccountId ||
        targetAccount?.tradingAccountId ||
        targetAccount?.apexId ||
        targetAccount?.accountId ||
        item?.tradingAccount ||
        targetAccount?.displayName
    );

    const tradingAccountName = cleanString(
        item?.tradingAccountName ||
        targetAccount?.tradingAccountName ||
        item?.tradingAccount ||
        tradingAccountId ||
        targetAccount?.displayName
    );

    const tradingAccountKey = cleanString(
        targetAccount?.tradingAccountKey ||
        compactValue(tradingAccountId || tradingAccountName)
    );

    const csvAccountRaw = cleanString(
        item?.tradingAccount ||
        item?.tradingAccountId ||
        item?.tradingAccountName
    );

    return {
        type: item.type,
        provider: normalizedProvider,
        dataProvider: normalizedProvider,
        providerLabel: formatProviderLabel(normalizedProvider),
        fileName: item.file.name,
        importedAt: new Date().toISOString(),
        headers: item.headers,
        rows: item.rows,
        previewRows: item.previewRows,
        rawText: item.file.rawText,
        appAccountId,
        appAccountName,
        tradingAccountId,
        tradingAccountName,
        tradingAccountKey,
        dataProviderAccountId: tradingAccountId,
        dataProviderAccountName: tradingAccountName,
        tradovateAccountId: tradingAccountId,
        tradovateAccountName: tradingAccountName,
        csvAccountRaw,
    };
}

function assignImportToShape(shape, type, payload) {
    if (type === "orders") {
        shape.orders = payload;
        return;
    }

    if (type === "trades") {
        shape.trades = payload;
        return;
    }

    if (type === "cashHistory") {
        shape.cashHistory = payload;
        shape.dailySummary = {
            ...payload,
            type: "dailySummary",
        };
        return;
    }

    if (type === "performance") {
        shape.performance = payload;
        return;
    }

    if (type === "positionHistory") {
        shape.positionHistory = payload;
    }
}

function buildImportShape(type, payload, provider) {
    const directShape = {};
    assignImportToShape(directShape, type, payload);

    if (!provider) {
        return directShape;
    }

    return {
        ...directShape,
        [provider]: directShape,
        byProvider: {
            [provider]: directShape,
        },
        providers: {
            [provider]: directShape,
        },
        importsByProvider: {
            [provider]: directShape,
        },
    };
}

function getImportSummary(imports) {
    const sections = [
        { key: "orders", label: "Orders" },
        { key: "trades", label: "Fills" },
        { key: "cashHistory", label: "Cash History" },
        { key: "performance", label: "Performance" },
        { key: "positionHistory", label: "Position History" },
    ];

    return sections.map((section) => {
        const entry = imports?.[section.key];
        const rows = Array.isArray(entry?.rows) ? entry.rows.length : 0;

        return {
            ...section,
            fileName: cleanString(entry?.fileName),
            importedAt: cleanString(entry?.importedAt),
            rows,
        };
    });
}

function serializeImportsSignature(value) {
    return JSON.stringify(
        value ?? {},
        (key, currentValue) => {
            if (Array.isArray(currentValue)) {
                return `array:${currentValue.length}`;
            }

            return currentValue;
        }
    );
}

function buildAccountsSignature(accounts) {
    return accounts
        .map((account) =>
            [
                cleanString(account?.id),
                cleanString(account?.displayName),
                cleanString(account?.tradingAccountId),
                cleanString(account?.tradingAccountName),
                cleanString(account?.tradingAccountKey),
                cleanString(account?.provider),
                cleanString(account?.accountPhase),
                cleanString(account?.productType),
                cleanString(account?.accountSize),
                cleanString(account?.startingBalance),
                cleanString(account?.currentBalance),
                cleanString(account?.dataProvider),
                cleanString(account?.dataProviderAccountId),
                cleanString(account?.dataProviderAccountName),
                cleanString(account?.atasAccountId),
                cleanString(account?.atasAccountName),
            ].join("|")
        )
        .join("||");
}

function getImportCenterSnapshot() {
    const accounts = Array.isArray(getAccounts()) ? getAccounts() : [];
    const activeAccountId = cleanString(getActiveAccountId());
    const activeAccount =
        accounts.find((account) => cleanString(account.id) === activeAccountId) ?? null;
    const activeImports = activeAccountId ? getCsvImports(activeAccountId) : null;

    const signature = [
        activeAccountId,
        buildAccountsSignature(accounts),
        serializeImportsSignature(activeImports),
    ].join("###");

    if (signature === cachedImportCenterSnapshotSignature) {
        return cachedImportCenterSnapshotValue;
    }

    cachedImportCenterSnapshotSignature = signature;
    cachedImportCenterSnapshotValue = {
        accounts,
        activeAccountId,
        activeAccount,
        activeImports,
    };

    return cachedImportCenterSnapshotValue;
}

function resolveImportCenterAccountLabel(account, provider) {
    if (!account) {
        return "Keiner gewählt";
    }

    if (shouldUseAtasZeroState(account, null, provider)) {
        return "Kein ATAS Account";
    }

    return cleanString(
        getStrictProviderDisplayName(account, null, provider)
    ) || cleanString(account?.displayName) || "Keiner gewählt";
}

async function readFileAsText(file) {
    return file.text();
}

export default function ImportCenterPanel({
    account = null,
    activeAccount: activeAccountProp = null,
    provider: providerProp = "",
    activeProvider = "",
    localImports = null,
    parentImports = null,
    effectiveImports = null,
}) {
    const storageSnapshot = useSyncExternalStore(
        subscribeStorage,
        getImportCenterSnapshot,
        () => EMPTY_IMPORT_CENTER_SNAPSHOT
    );

    const {
        accounts,
        activeAccountId: storageActiveAccountId,
        activeAccount: storageActiveAccount,
        activeImports,
    } = storageSnapshot;

    const resolvedActiveAccount =
        activeAccountProp ||
        account ||
        storageActiveAccount ||
        null;

    const resolvedActiveAccountId = cleanString(
        resolvedActiveAccount?.id || storageActiveAccountId
    );

    const provider = useMemo(() => {
        return resolvePanelProvider(
            {
                provider: providerProp,
                activeProvider,
            },
            resolvedActiveAccount
        );
    }, [providerProp, activeProvider, resolvedActiveAccount]);

    const providerLabel = useMemo(() => {
        return formatProviderLabel(provider);
    }, [provider]);

    const isAtasZeroState = useMemo(() => {
        return shouldUseAtasZeroState(
            resolvedActiveAccount,
            null,
            getActiveProvider(resolvedActiveAccount, null, provider)
        );
    }, [resolvedActiveAccount, provider]);

    const activeProviderAccountLabel = useMemo(() => {
        return resolveImportCenterAccountLabel(resolvedActiveAccount, provider);
    }, [resolvedActiveAccount, provider]);

    const scopedActiveImports = useMemo(() => {
        if (isAtasZeroState) {
            return {};
        }

        return resolveImportsForProvider(
            provider,
            effectiveImports,
            localImports,
            resolvedActiveAccount?.imports,
            activeImports,
            parentImports
        );
    }, [
        provider,
        effectiveImports,
        localImports,
        resolvedActiveAccount?.imports,
        activeImports,
        parentImports,
        isAtasZeroState,
    ]);

    const [batchItems, setBatchItems] = useState([]);
    const [selectedBatchId, setSelectedBatchId] = useState("");
    const [statusBanner, setStatusBanner] = useState(null);
    const [isReadingFiles, setIsReadingFiles] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const activeImportSummary = useMemo(() => {
        return getImportSummary(scopedActiveImports);
    }, [scopedActiveImports]);

    const selectedItem = useMemo(() => {
        if (!selectedBatchId) {
            return batchItems[0] ?? null;
        }

        return batchItems.find((item) => item.id === selectedBatchId) ?? batchItems[0] ?? null;
    }, [batchItems, selectedBatchId]);

    const readyCount = useMemo(() => {
        return batchItems.filter((item) => getStatusMeta(item).key === "ready").length;
    }, [batchItems]);

    const applyImportItems = useCallback(
        (items) => {
            let importedCount = 0;
            const normalizedProvider = normalizeProvider(provider);

            items.forEach((item) => {
                const existingAccount =
                    accounts.find(
                        (entry) => cleanString(entry.id) === cleanString(item.targetAccountId)
                    ) ?? null;

                if (!existingAccount) {
                    return;
                }

                const payload = buildParsedImportPayload(item, existingAccount, normalizedProvider);
                const importShape = buildImportShape(item.type, payload, normalizedProvider);

                const scopeTradingAccountId =
                    normalizedProvider === "atas"
                        ? cleanString(
                            payload.dataProviderAccountId ||
                            payload.dataProviderAccountName ||
                            item.tradingAccountId ||
                            item.tradingAccountName ||
                            item.tradingAccount
                        )
                        : cleanString(
                            payload.tradingAccountId ||
                            payload.tradingAccountName ||
                            existingAccount.tradingAccountId ||
                            existingAccount.displayName
                        );

                saveParsedCsvImport(item.targetAccountId, item.type, payload, normalizedProvider);

                if (item.type === "orders") {
                    const ordersData = callImportBuilder(
                        "buildOrdersData",
                        importShape,
                        scopeTradingAccountId,
                        normalizedProvider
                    );
                    syncImportedOrders(item.targetAccountId, ordersData.entries);
                }

                if (item.type === "trades") {
                    const fillsData = callImportBuilder(
                        "buildFillsData",
                        importShape,
                        scopeTradingAccountId,
                        normalizedProvider
                    );
                    syncImportedFills(item.targetAccountId, fillsData.entries);
                }

                const nextAccountPatch = {
                    dataProvider: normalizedProvider,
                };

                if (normalizedProvider === "atas") {
                    const nextAtasAccountId = cleanString(
                        payload.dataProviderAccountId || payload.atasAccountId
                    );
                    const nextAtasAccountName = cleanString(
                        payload.dataProviderAccountName || payload.atasAccountName
                    );

                    if (
                        nextAtasAccountId &&
                        nextAtasAccountId !== cleanString(existingAccount.atasAccountId)
                    ) {
                        nextAccountPatch.atasAccountId = nextAtasAccountId;
                        nextAccountPatch.dataProviderAccountId = nextAtasAccountId;
                    }

                    if (
                        nextAtasAccountName &&
                        nextAtasAccountName !== cleanString(existingAccount.atasAccountName)
                    ) {
                        nextAccountPatch.atasAccountName = nextAtasAccountName;
                        nextAccountPatch.dataProviderAccountName = nextAtasAccountName;
                    }
                } else {
                    if (
                        payload.tradingAccountId &&
                        payload.tradingAccountId !== cleanString(existingAccount.tradingAccountId)
                    ) {
                        nextAccountPatch.tradingAccountId = payload.tradingAccountId;
                        nextAccountPatch.dataProviderAccountId = payload.tradingAccountId;
                    }

                    if (
                        payload.tradingAccountName &&
                        payload.tradingAccountName !== cleanString(existingAccount.tradingAccountName)
                    ) {
                        nextAccountPatch.tradingAccountName = payload.tradingAccountName;
                        nextAccountPatch.dataProviderAccountName = payload.tradingAccountName;
                    }

                    if (
                        payload.tradingAccountKey &&
                        payload.tradingAccountKey !== cleanString(existingAccount.tradingAccountKey)
                    ) {
                        nextAccountPatch.tradingAccountKey = payload.tradingAccountKey;
                    }
                }

                if (item.type === "cashHistory") {
                    const cashHistoryData = callImportBuilder(
                        "buildCashHistoryData",
                        importShape,
                        scopeTradingAccountId,
                        normalizedProvider
                    );
                    syncImportedCashHistory(item.targetAccountId, cashHistoryData.entries);

                    const snapshot = callDeriveCashHistorySnapshot(
                        importShape,
                        scopeTradingAccountId,
                        normalizedProvider
                    );

                    if (snapshot && snapshot.hasValues) {
                        const nextStartingBalance =
                            snapshot.startingBalance > 0
                                ? snapshot.startingBalance
                                : Number(existingAccount.startingBalance || 0);

                        const nextCurrentBalance =
                            snapshot.currentBalance > 0
                                ? snapshot.currentBalance
                                : Number(existingAccount.currentBalance || 0);

                        const nextAccountSize =
                            snapshot.accountSize > 0
                                ? snapshot.accountSize
                                : Number(existingAccount.accountSize || 0);

                        nextAccountPatch.startingBalance = nextStartingBalance;
                        nextAccountPatch.currentBalance = nextCurrentBalance;
                        nextAccountPatch.accountSize = nextAccountSize;
                    }
                }

                if (existingAccount && Object.keys(nextAccountPatch).length > 0) {
                    updateAccount(item.targetAccountId, nextAccountPatch);
                }

                importedCount += 1;
            });

            return {
                importedCount,
            };
        },
        [accounts, provider]
    );

    const addFilesToBatch = useCallback(
        async (fileList) => {
            const incomingFiles = Array.from(fileList ?? []).filter(
                (file) => file && file.name.toLowerCase().endsWith(".csv")
            );

            if (incomingFiles.length === 0) {
                setStatusBanner({
                    type: "warning",
                    title: "Keine CSV erkannt",
                    text: "Bitte wähle eine oder mehrere CSV Dateien.",
                });
                return;
            }

            setIsReadingFiles(true);
            setStatusBanner(null);

            try {
                const nextItems = await Promise.all(
                    incomingFiles.map(async (file, index) => {
                        const rawText = await readFileAsText(file);
                        const parsed = parseCsvText(rawText);
                        const type = detectImportType(file.name, parsed.headers);
                        const detection = detectTradingAccount(
                            parsed.rows,
                            parsed.headers,
                            file.name,
                            type
                        );
                        const matchResult = matchAccountsByTradingAccount(
                            accounts,
                            detection,
                            resolvedActiveAccountId
                        );

                        const fallbackTarget =
                            matchResult.suggestedTargetAccountId || resolvedActiveAccountId || "";

                        return {
                            id: `${Date.now()}-${index}-${file.name}`,
                            provider,
                            providerLabel,
                            file: {
                                name: file.name,
                                size: file.size,
                                rawText,
                            },
                            type,
                            headers: parsed.headers,
                            rows: parsed.rows,
                            previewRows: parsed.previewRows,
                            tradingAccount: detection.value,
                            tradingAccountSource: detection.source,
                            tradingAccountId: detection.accountId,
                            tradingAccountName: detection.accountName,
                            tradingAccountKey: detection.accountKey,
                            matchedAccounts: matchResult.matches,
                            accountConflict: matchResult.hasConflict,
                            targetAccountId: fallbackTarget,
                            importedAt: new Date().toISOString(),
                        };
                    })
                );

                const autoImportItems = nextItems.filter((item) => {
                    return (
                        Boolean(resolvedActiveAccountId) &&
                        getStatusMeta(item).key === "ready" &&
                        cleanString(item.targetAccountId) === cleanString(resolvedActiveAccountId)
                    );
                });

                const reviewItems = nextItems.filter((item) => {
                    return !autoImportItems.some((autoItem) => autoItem.id === item.id);
                });

                let autoImportResult = {
                    importedCount: 0,
                };

                if (autoImportItems.length > 0) {
                    autoImportResult = applyImportItems(autoImportItems);
                }

                setBatchItems((current) => [...current, ...reviewItems]);
                setSelectedBatchId((current) => {
                    if (current) {
                        return current;
                    }

                    return reviewItems[0]?.id || "";
                });

                if (autoImportResult.importedCount > 0 && reviewItems.length === 0) {
                    setStatusBanner({
                        type: "success",
                        title: "Schnellimport fertig",
                        text: `${autoImportResult.importedCount} Datei(en) direkt in den aktiven Account importiert.`,
                    });
                } else if (autoImportResult.importedCount > 0 && reviewItems.length > 0) {
                    setStatusBanner({
                        type: "success",
                        title: "Schnellimport teilweise fertig",
                        text: `${autoImportResult.importedCount} Datei(en) direkt importiert. ${reviewItems.length} Datei(en) bleiben in der Prüfliste.`,
                    });
                } else {
                    setStatusBanner({
                        type: "success",
                        title: "Dateien geprüft",
                        text: `${reviewItems.length} Datei(en) zur Prüfliste hinzugefügt.`,
                    });
                }
            } catch (error) {
                setStatusBanner({
                    type: "error",
                    title: "Lesefehler",
                    text: cleanString(error?.message) || "Dateien konnten nicht gelesen werden.",
                });
            } finally {
                setIsReadingFiles(false);
            }
        },
        [accounts, resolvedActiveAccountId, applyImportItems, provider, providerLabel]
    );

    const handleFileSelection = useCallback(
        async (event) => {
            const files = event.target.files;
            await addFilesToBatch(files);
            event.target.value = "";
        },
        [addFilesToBatch]
    );

    const handleDrop = useCallback(
        async (event) => {
            event.preventDefault();
            await addFilesToBatch(event.dataTransfer?.files);
        },
        [addFilesToBatch]
    );

    const handleDragOver = useCallback((event) => {
        event.preventDefault();
    }, []);

    const updateBatchTarget = useCallback((itemId, targetAccountId) => {
        setBatchItems((current) =>
            current.map((item) =>
                item.id === itemId
                    ? {
                        ...item,
                        targetAccountId,
                        accountConflict: false,
                    }
                    : item
            )
        );
    }, []);

    const removeBatchItem = useCallback((itemId) => {
        setBatchItems((current) => current.filter((item) => item.id !== itemId));
        setSelectedBatchId((current) => (current === itemId ? "" : current));
    }, []);

    const clearBatch = useCallback(() => {
        setBatchItems([]);
        setSelectedBatchId("");
        setStatusBanner({
            type: "success",
            title: "Prüfliste geleert",
            text: "Alle offenen Dateien wurden entfernt.",
        });
    }, []);

    const resetActiveAccountImports = useCallback(() => {
        if (!resolvedActiveAccountId) {
            setStatusBanner({
                type: "warning",
                title: "Kein aktiver Account",
                text: "Wähle zuerst einen App Account.",
            });
            return;
        }

        clearImportedOrders(resolvedActiveAccountId);
        clearImportedFills(resolvedActiveAccountId);
        clearCashHistory(resolvedActiveAccountId);
        clearParsedCsvImport(resolvedActiveAccountId, "orders", provider);
        clearParsedCsvImport(resolvedActiveAccountId, "trades", provider);
        clearParsedCsvImport(resolvedActiveAccountId, "cashHistory", provider);
        clearParsedCsvImport(resolvedActiveAccountId, "performance", provider);
        clearParsedCsvImport(resolvedActiveAccountId, "positionHistory", provider);

        setStatusBanner({
            type: "success",
            title: "Imports gelöscht",
            text: `Der aktive ${providerLabel} Import wurde zurückgesetzt.`,
        });
    }, [resolvedActiveAccountId, provider, providerLabel]);

    const importBatch = useCallback(async () => {
        const readyItems = batchItems.filter((item) => getStatusMeta(item).key === "ready");

        if (readyItems.length === 0) {
            setStatusBanner({
                type: "warning",
                title: "Nichts importierbar",
                text: "Prüfe Typ und Ziel Account in der Liste.",
            });
            return;
        }

        setIsImporting(true);
        setStatusBanner(null);

        try {
            const result = applyImportItems(readyItems);
            const skippedCount = batchItems.length - readyItems.length;

            setBatchItems((current) =>
                current.filter((item) => getStatusMeta(item).key !== "ready")
            );
            setSelectedBatchId("");

            setStatusBanner({
                type: "success",
                title: "Offene Imports fertig",
                text:
                    skippedCount > 0
                        ? `${result.importedCount} Datei(en) importiert. ${skippedCount} Datei(en) bleiben offen.`
                        : `${result.importedCount} Datei(en) importiert.`,
            });
        } catch (error) {
            setStatusBanner({
                type: "error",
                title: "Importfehler",
                text: cleanString(error?.message) || "Der Import ist fehlgeschlagen.",
            });
        } finally {
            setIsImporting(false);
        }
    }, [applyImportItems, batchItems]);

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
                padding: 18,
                boxShadow: COLORS.shadow,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 16,
                }}
            >
                <div>
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 18,
                            fontWeight: 700,
                            marginBottom: 6,
                        }}
                    >
                        Import Center
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 13,
                            lineHeight: 1.5,
                        }}
                    >
                        Mehrfach Import mit starker Account Zuordnung pro Provider.
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            marginTop: 8,
                        }}
                    >
                        Aktiver Provider Account:{" "}
                        <span style={{ color: COLORS.title, fontWeight: 600 }}>
                            {activeProviderAccountLabel}
                        </span>
                    </div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 13,
                            marginTop: 6,
                        }}
                    >
                        Provider:{" "}
                        <span
                            style={{
                                color: normalizeProvider(provider) === "atas"
                                    ? COLORS.purple
                                    : COLORS.cyan,
                                fontWeight: 700,
                            }}
                        >
                            {providerLabel}
                        </span>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                    }}
                >
                    <label
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.buttonBorder}`,
                            background: COLORS.buttonBg,
                            color: COLORS.text,
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        CSV wählen
                        <input
                            type="file"
                            accept=".csv"
                            multiple
                            onChange={handleFileSelection}
                            style={{ display: "none" }}
                        />
                    </label>

                    <button
                        type="button"
                        onClick={importBatch}
                        disabled={isImporting || readyCount === 0}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.buttonBorder}`,
                            background:
                                isImporting || readyCount === 0
                                    ? "rgba(148, 163, 184, 0.12)"
                                    : "rgba(34, 197, 94, 0.18)",
                            color: COLORS.text,
                            cursor: isImporting || readyCount === 0 ? "not-allowed" : "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        {isImporting ? "Import läuft..." : `Offene Imports ${readyCount}`}
                    </button>

                    <button
                        type="button"
                        onClick={clearBatch}
                        disabled={batchItems.length === 0}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.buttonBorder}`,
                            background: COLORS.buttonBg,
                            color: COLORS.text,
                            cursor: batchItems.length === 0 ? "not-allowed" : "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        Prüfliste leeren
                    </button>

                    <button
                        type="button"
                        onClick={resetActiveAccountImports}
                        disabled={!resolvedActiveAccountId}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.buttonBorder}`,
                            background: "rgba(239, 68, 68, 0.12)",
                            color: COLORS.text,
                            cursor: !resolvedActiveAccountId ? "not-allowed" : "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        Aktiven Import löschen
                    </button>
                </div>
            </div>

            {statusBanner ? (
                <div
                    style={{
                        marginBottom: 16,
                        borderRadius: 14,
                        padding: 12,
                        border: `1px solid ${statusBanner.type === "error"
                            ? "rgba(239, 68, 68, 0.28)"
                            : statusBanner.type === "warning"
                                ? "rgba(245, 158, 11, 0.28)"
                                : "rgba(34, 197, 94, 0.28)"
                            }`,
                        background:
                            statusBanner.type === "error"
                                ? "rgba(239, 68, 68, 0.08)"
                                : statusBanner.type === "warning"
                                    ? "rgba(245, 158, 11, 0.08)"
                                    : "rgba(34, 197, 94, 0.08)",
                    }}
                >
                    <div
                        style={{
                            color: COLORS.text,
                            fontWeight: 700,
                            marginBottom: 4,
                        }}
                    >
                        {statusBanner.title}
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 13,
                        }}
                    >
                        {statusBanner.text}
                    </div>
                </div>
            ) : null}

            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                style={{
                    border: `1px dashed ${COLORS.borderStrong}`,
                    borderRadius: 16,
                    padding: 18,
                    textAlign: "center",
                    color: COLORS.muted,
                    background: COLORS.cardBg,
                    marginBottom: 16,
                }}
            >
                {isReadingFiles
                    ? "CSV Dateien werden gelesen..."
                    : `Ziehe mehrere ${providerLabel} CSV Dateien hier hinein oder wähle sie oben aus.`}
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1.35fr 1fr",
                    gap: 16,
                }}
            >
                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 16,
                        padding: 14,
                        minHeight: 320,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 14,
                            fontWeight: 700,
                            marginBottom: 12,
                        }}
                    >
                        Prüfliste
                    </div>

                    {batchItems.length === 0 ? (
                        <div
                            style={{
                                color: COLORS.muted,
                                fontSize: 13,
                            }}
                        >
                            Keine offenen Dateien in der Prüfliste.
                        </div>
                    ) : (
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            {batchItems.map((item) => {
                                const status = getStatusMeta(item);
                                const bestMatch = item.matchedAccounts[0] ?? null;

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedBatchId(item.id)}
                                        style={{
                                            textAlign: "left",
                                            background:
                                                selectedItem?.id === item.id
                                                    ? COLORS.cardBgStrong
                                                    : COLORS.cardBg,
                                            border: `1px solid ${COLORS.border}`,
                                            borderRadius: 14,
                                            padding: 12,
                                            cursor: "pointer",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                gap: 10,
                                                marginBottom: 6,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: COLORS.text,
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {item.file.name}
                                            </div>
                                            <div
                                                style={{
                                                    color: status.color,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {status.label}
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 1fr",
                                                gap: 8,
                                                marginBottom: 10,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                }}
                                            >
                                                Typ
                                                <div
                                                    style={{
                                                        color: COLORS.text,
                                                        fontSize: 13,
                                                        marginTop: 2,
                                                    }}
                                                >
                                                    {IMPORT_TYPE_META[item.type]?.label ||
                                                        IMPORT_TYPE_META.unknown.label}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                }}
                                            >
                                                Provider
                                                <div
                                                    style={{
                                                        color: normalizeProvider(item.provider) === "atas"
                                                            ? COLORS.purple
                                                            : COLORS.cyan,
                                                        fontSize: 13,
                                                        marginTop: 2,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {item.providerLabel || providerLabel}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                }}
                                            >
                                                Trading Account
                                                <div
                                                    style={{
                                                        color: COLORS.text,
                                                        fontSize: 13,
                                                        marginTop: 2,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {item.tradingAccount || "Nicht erkannt"}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                }}
                                            >
                                                Quelle
                                                <div
                                                    style={{
                                                        color: COLORS.text,
                                                        fontSize: 13,
                                                        marginTop: 2,
                                                    }}
                                                >
                                                    {item.tradingAccountSource || "—"}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    color: COLORS.muted,
                                                    fontSize: 12,
                                                    gridColumn: "1 / -1",
                                                }}
                                            >
                                                Bester Match
                                                <div
                                                    style={{
                                                        color: COLORS.text,
                                                        fontSize: 13,
                                                        marginTop: 2,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {bestMatch
                                                        ? `${bestMatch.account.displayName} · ${bestMatch.reason} · ${bestMatch.score}`
                                                        : "Kein Treffer"}
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr auto",
                                                gap: 10,
                                                alignItems: "center",
                                            }}
                                        >
                                            <select
                                                value={item.targetAccountId}
                                                onChange={(event) =>
                                                    updateBatchTarget(item.id, event.target.value)
                                                }
                                                style={{
                                                    width: "100%",
                                                    borderRadius: 10,
                                                    border: `1px solid ${COLORS.borderStrong}`,
                                                    background: "rgba(15, 23, 42, 0.9)",
                                                    color: COLORS.text,
                                                    padding: "9px 10px",
                                                    fontSize: 13,
                                                }}
                                            >
                                                <option value="">Ziel App Account wählen</option>
                                                {accounts.map((entry) => (
                                                    <option key={entry.id} value={entry.id}>
                                                        {entry.displayName}
                                                    </option>
                                                ))}
                                            </select>

                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeBatchItem(item.id);
                                                }}
                                                style={{
                                                    borderRadius: 10,
                                                    border: `1px solid ${COLORS.borderStrong}`,
                                                    background: "rgba(239, 68, 68, 0.12)",
                                                    color: COLORS.text,
                                                    padding: "9px 10px",
                                                    fontSize: 12,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Entfernen
                                            </button>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        background: COLORS.cardBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 16,
                        padding: 14,
                        minHeight: 320,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 14,
                            fontWeight: 700,
                            marginBottom: 12,
                        }}
                    >
                        Dateivorschau
                    </div>

                    {!selectedItem ? (
                        <div
                            style={{
                                color: COLORS.muted,
                                fontSize: 13,
                            }}
                        >
                            Keine offene Datei ausgewählt.
                        </div>
                    ) : (
                        <div>
                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    marginBottom: 10,
                                }}
                            >
                                {selectedItem.file.name}
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 10,
                                    marginBottom: 12,
                                }}
                            >
                                <div
                                    style={{
                                        background: COLORS.cardBgStrong,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 12,
                                        padding: 10,
                                    }}
                                >
                                    <div style={{ color: COLORS.muted, fontSize: 12 }}>Typ</div>
                                    <div style={{ color: COLORS.text, fontSize: 13, marginTop: 4 }}>
                                        {IMPORT_TYPE_META[selectedItem.type]?.label ||
                                            IMPORT_TYPE_META.unknown.label}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        background: COLORS.cardBgStrong,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 12,
                                        padding: 10,
                                    }}
                                >
                                    <div style={{ color: COLORS.muted, fontSize: 12 }}>Zeilen</div>
                                    <div style={{ color: COLORS.text, fontSize: 13, marginTop: 4 }}>
                                        {selectedItem.rows.length}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        background: COLORS.cardBgStrong,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 12,
                                        padding: 10,
                                    }}
                                >
                                    <div style={{ color: COLORS.muted, fontSize: 12 }}>
                                        Provider
                                    </div>
                                    <div
                                        style={{
                                            color: normalizeProvider(selectedItem.provider) === "atas"
                                                ? COLORS.purple
                                                : COLORS.cyan,
                                            fontSize: 13,
                                            fontWeight: 700,
                                            marginTop: 4,
                                        }}
                                    >
                                        {selectedItem.providerLabel || providerLabel}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        background: COLORS.cardBgStrong,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 12,
                                        padding: 10,
                                    }}
                                >
                                    <div style={{ color: COLORS.muted, fontSize: 12 }}>
                                        Trading Account
                                    </div>
                                    <div style={{ color: COLORS.text, fontSize: 13, marginTop: 4 }}>
                                        {selectedItem.tradingAccount || "Nicht erkannt"}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        background: COLORS.cardBgStrong,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 12,
                                        padding: 10,
                                        gridColumn: "1 / -1",
                                    }}
                                >
                                    <div style={{ color: COLORS.muted, fontSize: 12 }}>
                                        Quelle
                                    </div>
                                    <div style={{ color: COLORS.text, fontSize: 13, marginTop: 4 }}>
                                        {selectedItem.tradingAccountSource || "—"}
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{
                                    marginBottom: 12,
                                    background: COLORS.cardBgStrong,
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: 12,
                                    padding: 10,
                                }}
                            >
                                <div
                                    style={{
                                        color: COLORS.muted,
                                        fontSize: 12,
                                        marginBottom: 6,
                                    }}
                                >
                                    Match Kandidaten
                                </div>

                                {selectedItem.matchedAccounts.length === 0 ? (
                                    <div
                                        style={{
                                            color: COLORS.text,
                                            fontSize: 13,
                                        }}
                                    >
                                        Kein Treffer.
                                    </div>
                                ) : (
                                    selectedItem.matchedAccounts.slice(0, 3).map((match) => (
                                        <div
                                            key={`${selectedItem.id}-${match.account.id}`}
                                            style={{
                                                color: COLORS.text,
                                                fontSize: 13,
                                                marginBottom: 4,
                                            }}
                                        >
                                            {match.account.displayName} · {match.reason} · Score {match.score}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 12,
                                    marginBottom: 8,
                                }}
                            >
                                Header
                            </div>
                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                    background: "rgba(15, 23, 42, 0.75)",
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: 12,
                                    padding: 10,
                                    marginBottom: 12,
                                    wordBreak: "break-word",
                                }}
                            >
                                {selectedItem.headers.join(" | ") || "Keine Header"}
                            </div>

                            <div
                                style={{
                                    color: COLORS.muted,
                                    fontSize: 12,
                                    marginBottom: 8,
                                }}
                            >
                                Vorschau
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    maxHeight: 260,
                                    overflowY: "auto",
                                }}
                            >
                                {selectedItem.previewRows.length === 0 ? (
                                    <div
                                        style={{
                                            color: COLORS.muted,
                                            fontSize: 13,
                                        }}
                                    >
                                        Keine Datenzeilen gefunden.
                                    </div>
                                ) : (
                                    selectedItem.previewRows.map((row, rowIndex) => (
                                        <div
                                            key={`${selectedItem.id}-row-${rowIndex}`}
                                            style={{
                                                background: COLORS.cardBgStrong,
                                                border: `1px solid ${COLORS.border}`,
                                                borderRadius: 12,
                                                padding: 10,
                                            }}
                                        >
                                            {selectedItem.headers.slice(0, 6).map((header) => (
                                                <div
                                                    key={`${selectedItem.id}-${rowIndex}-${header}`}
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: "120px 1fr",
                                                        gap: 8,
                                                        marginBottom: 4,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    <div style={{ color: COLORS.muted }}>
                                                        {header}
                                                    </div>
                                                    <div
                                                        style={{
                                                            color: COLORS.text,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {cleanString(row[header]) || "—"}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div
                style={{
                    marginTop: 16,
                    background: COLORS.cardBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16,
                    padding: 14,
                }}
            >
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 14,
                        fontWeight: 700,
                        marginBottom: 12,
                    }}
                >
                    Aktueller Importstand des aktiven Accounts
                </div>

                <div
                    style={{
                        color: normalizeProvider(provider) === "atas"
                            ? COLORS.purple
                            : COLORS.cyan,
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 12,
                    }}
                >
                    Provider {providerLabel}
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 10,
                    }}
                >
                    {activeImportSummary.map((entry) => (
                        <div
                            key={entry.key}
                            style={{
                                background: COLORS.cardBgStrong,
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 12,
                                padding: 12,
                                minWidth: 0,
                                display: "grid",
                                gap: 8,
                                alignContent: "start",
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 13,
                                    fontWeight: 700,
                                }}
                            >
                                {entry.label}
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gap: 6,
                                    color: COLORS.muted,
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                    minWidth: 0,
                                }}
                            >
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 2,
                                        minWidth: 0,
                                    }}
                                >
                                    <div>Datei</div>
                                    <div
                                        style={{
                                            color: COLORS.text,
                                            wordBreak: "break-word",
                                            overflowWrap: "anywhere",
                                            whiteSpace: "normal",
                                            lineHeight: 1.45,
                                        }}
                                    >
                                        {entry.fileName || "Keine"}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gap: 2,
                                    }}
                                >
                                    <div>Zeilen</div>
                                    <div style={{ color: COLORS.text }}>
                                        {entry.rows}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gap: 2,
                                        minWidth: 0,
                                    }}
                                >
                                    <div>Import</div>
                                    <div
                                        style={{
                                            color: COLORS.text,
                                            wordBreak: "break-word",
                                            overflowWrap: "anywhere",
                                            whiteSpace: "normal",
                                            lineHeight: 1.45,
                                        }}
                                    >
                                        {entry.importedAt ? formatDateTime(entry.importedAt) : "—"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}