import { useEffect, useMemo, useRef, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";
import { buildApexRiskSnapshot } from "../utils/apexRiskSnapshot";
import { saveRiskStatusForAccount } from "../utils/accountRiskStatus";
import { resolveAccountImportsFromSources } from "../utils/accountImports";
import * as csvImportUtils from "../utils/csvImportUtils";
import {
    detectAccountSize,
    getLiveAccountSnapshot,
    saveDailyState,
    saveLiveAccountSnapshot,
} from "../utils/storage";
import { RISK_ALERT_EVENT_NAME } from "../utils/riskAlertEvents";

const COLORS = {
    panelBg: "rgba(255, 255, 255, 0.04)",
    border: "rgba(125, 211, 252, 0.16)",
    borderStrong: "rgba(125, 211, 252, 0.24)",
    shadow: "0 0 14px rgba(0, 0, 0, 0.16)",
    title: "#e0f2fe",
    text: "#dbeafe",
    textSoft: "#94a3b8",
    cyan: "#22d3ee",
    green: "#4ade80",
    orange: "#fb923c",
    red: "#f87171",
    purple: "#a78bfa",
    yellow: "#facc15",
};

const INSTRUMENT_CONFIG = {
    MNQ: {
        label: "MNQ",
        tickSize: 0.25,
        tickValue: 0.5,
        pointValue: 2,
        apexUnit: 0.1,
        family: "NQ",
    },
    NQ: {
        label: "NQ",
        tickSize: 0.25,
        tickValue: 5,
        pointValue: 20,
        apexUnit: 1,
        family: "NQ",
    },
    MES: {
        label: "MES",
        tickSize: 0.25,
        tickValue: 1.25,
        pointValue: 5,
        apexUnit: 0.1,
        family: "ES",
    },
    ES: {
        label: "ES",
        tickSize: 0.25,
        tickValue: 12.5,
        pointValue: 50,
        apexUnit: 1,
        family: "ES",
    },
};

const APEX_MODE_OPTIONS = [
    { value: "EVAL_EOD", label: "EVAL EOD" },
    { value: "EVAL_INTRADAY", label: "EVAL Intraday" },
    { value: "PA_EOD", label: "PA EOD" },
    { value: "PA_INTRADAY", label: "PA Intraday" },
];

const APEX_ACCOUNT_SIZE_OPTIONS = [25000, 50000, 100000, 150000];
const TRADING_TIMEZONE = "America/New_York";

const ACCOUNT_MATCH_KEYS = [
    "_accountId",
    "_accountid",
    "account",
    "accountId",
    "account_id",
    "accountNumber",
    "account_name",
    "accountName",
    "Account",
    "Account ID",
    "Account Id",
    "Account Name",
    "Account Number",
    "Trading Account",
    "Trading Account ID",
    "Trading Account Name",
    "tradingAccountId",
    "tradingAccountName",
];

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

function resolvePanelProvider(props, resolvedAccount, liveSnapshot = null) {
    const candidates = [
        props?.dataProvider,
        props?.activeProvider,
        props?.provider,
        props?.sourceProvider,

        liveSnapshot?.dataProvider,
        liveSnapshot?.activeProvider,
        liveSnapshot?.sourceProvider,
        liveSnapshot?.source?.provider,
        liveSnapshot?.provider,

        resolvedAccount?.dataProvider,
        resolvedAccount?.activeProvider,
        resolvedAccount?.sourceProvider,
        resolvedAccount?.source?.provider,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeProvider(candidate);

        if (normalized === "atas" || normalized === "tradovate") {
            return normalized;
        }
    }

    const snapshotAccountId = cleanString(liveSnapshot?.accountId).toLowerCase();
    const snapshotAccountName = cleanString(liveSnapshot?.accountName).toLowerCase();
    const snapshotTradingAccountId = cleanString(liveSnapshot?.tradingAccountId).toLowerCase();
    const snapshotSourceName = cleanString(liveSnapshot?.sourceName).toLowerCase();

    if (
        snapshotAccountId === "replay" ||
        snapshotAccountName === "replay" ||
        snapshotTradingAccountId === "replay" ||
        snapshotSourceName === "replay"
    ) {
        return "atas";
    }

    return "tradovate";
}

function hasImportRows(importEntry) {
    if (!importEntry || typeof importEntry !== "object") {
        return false;
    }

    if (Array.isArray(importEntry.rows) && importEntry.rows.length) {
        return true;
    }

    if (Array.isArray(importEntry.previewRows) && importEntry.previewRows.length) {
        return true;
    }

    if (Array.isArray(importEntry.headers) && importEntry.headers.length) {
        return true;
    }

    if (cleanString(importEntry.rawText)) {
        return true;
    }

    return false;
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

function hasImportCollectionContent(value) {
    if (!looksLikeImportCollection(value)) {
        return false;
    }

    const keys = [
        "orders",
        "trades",
        "cashHistory",
        "dailySummary",
        "performance",
        "positionHistory",
    ];

    return keys.some((key) => hasImportRows(value?.[key]));
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

        if (hasImportCollectionContent(source)) {
            return source;
        }
    }

    for (const source of sources) {
        if (looksLikeImportCollection(source)) {
            return source;
        }
    }

    return {};
}

function loadParsedImportsForProvider(accountId, provider) {
    if (typeof csvImportUtils.getAllParsedImports !== "function") {
        return {};
    }

    const attempts = [
        () => csvImportUtils.getAllParsedImports(accountId, { provider }),
        () => csvImportUtils.getAllParsedImports(accountId, provider),
        () => csvImportUtils.getAllParsedImports(accountId),
    ];

    let fallback = {};

    for (const attempt of attempts) {
        try {
            const result = attempt();

            if (!result || typeof result !== "object") {
                continue;
            }

            const scoped = resolveImportsForProvider(provider, result);

            if (hasImportCollectionContent(scoped)) {
                return scoped;
            }

            if (hasImportCollectionContent(result)) {
                return result;
            }

            if (!Array.isArray(result) && Object.keys(result).length) {
                fallback = result;
            }
        } catch {
            continue;
        }
    }

    return fallback;
}

function getImportEventNames(provider) {
    const names = new Set([
        "tradovate-csv-imports-updated",
        "csv-imports-updated",
    ]);

    const normalizedProvider = normalizeProvider(provider);

    if (normalizedProvider) {
        names.add(`${normalizedProvider}-csv-imports-updated`);
    }

    if (typeof csvImportUtils.getCsvImportEventName === "function") {
        const attempts = [
            () => csvImportUtils.getCsvImportEventName({ provider: normalizedProvider }),
            () => csvImportUtils.getCsvImportEventName(normalizedProvider),
            () => csvImportUtils.getCsvImportEventName(),
        ];

        attempts.forEach((attempt) => {
            try {
                const value = cleanString(attempt());
                if (value) {
                    names.add(value);
                }
            } catch {
                return;
            }
        });
    }

    return Array.from(names);
}

function callImportBuilder(builderName, imports, accountId, provider) {
    const builder = csvImportUtils?.[builderName];

    if (typeof builder !== "function") {
        return { entries: [] };
    }

    const attempts = [
        () => builder(imports, accountId, { provider }),
        () => builder(imports, accountId, provider),
        () => builder(imports, accountId),
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

function looksLikeInternalAccountId(value) {
    const text = cleanString(value);

    if (!text) {
        return false;
    }

    return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ||
        /^acc-\d+-[a-z0-9]+$/i.test(text)
    );
}

function normalizeString(value) {
    return cleanString(value).toLowerCase();
}

function normalizeDigits(value) {
    return cleanString(value).replace(/\D/g, "");
}

function buildFlexibleSource(source) {
    const map = {};

    if (!source || typeof source !== "object") {
        return map;
    }

    Object.keys(source).forEach((key) => {
        const normalizedKey = cleanString(key).toLowerCase().replace(/[^a-z0-9]/g, "");

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
    for (const key of keys) {
        const normalizedKey = cleanString(key).toLowerCase().replace(/[^a-z0-9]/g, "");

        if (!normalizedKey) {
            continue;
        }

        const value = source[normalizedKey];

        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }

    return "";
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

function toSafeInteger(value, fallback = 1) {
    const parsed = Math.round(toNumber(value, fallback));

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

function normalizeAccountSize(value, fallback = 0) {
    const numeric = toNumber(value, 0);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return fallback;
    }

    const standardSizes = [25000, 50000, 100000, 150000];

    let closest = standardSizes[0];
    let smallestDistance = Math.abs(numeric - closest);

    for (const size of standardSizes) {
        const distance = Math.abs(numeric - size);

        if (distance < smallestDistance) {
            smallestDistance = distance;
            closest = size;
        }
    }

    return closest;
}

function formatAccountSizeLabel(value) {
    const normalized = normalizeAccountSize(value, 0);

    if (!normalized) {
        return "";
    }

    return `${Math.round(normalized / 1000)}K`;
}

function formatAccountSizeValue(value) {
    const label = formatAccountSizeLabel(value);

    if (label) {
        return label;
    }

    const numeric = toNumber(value, 0);

    if (numeric <= 0) {
        return "–";
    }

    return String(numeric);
}

function formatCurrency(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "–";
    }

    return Number(value).toLocaleString("de-CH", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatSignedCurrency(value) {
    const numeric = toNumber(value, 0);
    const absolute = formatCurrency(Math.abs(numeric));

    return numeric >= 0 ? `+${absolute}` : `-${absolute}`;
}

function formatDecimal(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return Number(value).toLocaleString("de-CH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatPercent(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, digits)}%`;
}

function formatRatio(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, 2)}R`;
}

function formatExposureUnits(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, 2)} AE`;
}

function formatTradingDayLabel(isoDate) {
    const value = cleanString(isoDate);

    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "–";
    }

    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
}

function getStatusUi(status) {
    if (status === "red" || status === "danger") {
        return {
            border: "rgba(248, 113, 113, 0.28)",
            background: "rgba(248, 113, 113, 0.08)",
            text: COLORS.red,
        };
    }

    if (status === "yellow" || status === "warning") {
        return {
            border: "rgba(251, 146, 60, 0.26)",
            background: "rgba(251, 146, 60, 0.08)",
            text: COLORS.orange,
        };
    }

    return {
        border: "rgba(74, 222, 128, 0.26)",
        background: "rgba(74, 222, 128, 0.08)",
        text: COLORS.green,
    };
}

function firstString(row, keys) {
    if (!row || typeof row !== "object") {
        return "";
    }

    for (const key of keys) {
        const value = row[key];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return "";
}

function toDateOrNull(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    const direct = new Date(trimmed);

    if (!Number.isNaN(direct.getTime())) {
        return direct;
    }

    const european = trimmed.match(
        /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!european) {
        return null;
    }

    const day = Number(european[1]);
    const month = Number(european[2]) - 1;
    const year = Number(european[3]);
    const hour = Number(european[4] || 0);
    const minute = Number(european[5] || 0);
    const second = Number(european[6] || 0);

    const date = new Date(year, month, day, hour, minute, second);

    return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysToIsoDate(isoDate, days) {
    const parts = cleanString(isoDate).split("-").map(Number);

    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
        return isoDate;
    }

    const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));

    const year = next.getUTCFullYear();
    const month = String(next.getUTCMonth() + 1).padStart(2, "0");
    const day = String(next.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getNyDateParts(date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: TRADING_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const valueByType = {};

    parts.forEach((part) => {
        if (part.type !== "literal") {
            valueByType[part.type] = part.value;
        }
    });

    return {
        year: Number(valueByType.year),
        month: Number(valueByType.month),
        day: Number(valueByType.day),
        hour: Number(valueByType.hour),
        minute: Number(valueByType.minute),
        second: Number(valueByType.second),
    };
}

function getTradingDayKey(input) {
    const date = input instanceof Date ? input : toDateOrNull(input);

    if (!date) {
        return "";
    }

    const ny = getNyDateParts(date);
    const isoDate = `${String(ny.year).padStart(4, "0")}-${String(ny.month).padStart(2, "0")}-${String(ny.day).padStart(2, "0")}`;

    if (ny.hour >= 18) {
        return addDaysToIsoDate(isoDate, 1);
    }

    return isoDate;
}

function getFillTimestamp(row) {
    const flexible = buildFlexibleSource(row);

    return (
        toDateOrNull(
            pickFlexibleValue(flexible, [
                "timestamp",
                "timestampIso",
                "time",
                "dateTime",
                "datetime",
                "filledAt",
                "fillTime",
                "executionTime",
                "execTime",
                "tradeDate",
                "date",
                "createdAt",
                "Created At",
            ]) || firstString(row, [
                "timestamp",
                "timestampIso",
                "time",
                "dateTime",
                "datetime",
                "filledAt",
                "fillTime",
                "executionTime",
                "execTime",
                "tradeDate",
                "date",
                "Date",
                "Created At",
            ])
        ) || null
    );
}

function getFillPnl(row) {
    return [
        "pnl",
        "PnL",
        "realizedPnl",
        "realized_pnl",
        "profit",
        "profitLoss",
        "netPnl",
        "dailyPnl",
        "Realized PnL",
        "Net PnL",
        "P/L",
    ].reduce((result, key) => {
        if (result !== null) {
            return result;
        }

        const value = row?.[key];

        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }

        const parsed = parseFlexibleNumber(value);
        return parsed !== null ? parsed : null;
    }, null);
}

function getFillCommission(row) {
    return [
        "commission",
        "Commission",
    ].reduce((result, key) => {
        if (result !== null) {
            return result;
        }

        const value = row?.[key];

        if (typeof value === "number" && Number.isFinite(value)) {
            return Math.abs(value);
        }

        const parsed = parseFlexibleNumber(value);
        return parsed !== null ? Math.abs(parsed) : null;
    }, null);
}

function getTradeKey(row, timestamp) {
    const explicitId = firstString(row, [
        "fillId",
        "execId",
        "executionId",
        "tradeId",
        "orderId",
        "order_id",
        "Execution ID",
        "Order ID",
    ]);

    if (explicitId) {
        return explicitId;
    }

    const instrument =
        firstString(row, ["instrument", "symbol", "ticker", "contract"]) || "NA";
    const side = firstString(row, ["side", "action"]) || "NA";
    const qty = toNumber(row?.qty ?? row?.quantity ?? row?.filledQty ?? row?.size, 0);

    return `${instrument}|${side}|${qty}|${timestamp.toISOString()}`;
}

function getUniqueTradesForDay(rows, tradingDayKey) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const targetTradingDayKey = cleanString(tradingDayKey);
    const seen = new Set();
    const result = [];

    if (!targetTradingDayKey) {
        return [];
    }

    for (const row of safeRows) {
        const timestamp = getFillTimestamp(row);

        if (!timestamp) {
            continue;
        }

        if (getTradingDayKey(timestamp) !== targetTradingDayKey) {
            continue;
        }

        const tradeKey = getTradeKey(row, timestamp);

        if (seen.has(tradeKey)) {
            continue;
        }

        seen.add(tradeKey);
        result.push(row);
    }

    return result.sort((a, b) => {
        const aTime = (getFillTimestamp(a) || new Date(0)).getTime();
        const bTime = (getFillTimestamp(b) || new Date(0)).getTime();
        return aTime - bTime;
    });
}

function rowMatchesAccount(row, accountId) {
    const targetKey = normalizeString(accountId);
    const targetDigits = normalizeDigits(accountId);

    if (!targetKey && !targetDigits) {
        return true;
    }

    const candidates = ACCOUNT_MATCH_KEYS.map((key) => {
        if (row && Object.prototype.hasOwnProperty.call(row, key)) {
            return cleanString(row[key]);
        }

        const flexible = buildFlexibleSource(row);
        return cleanString(pickFlexibleValue(flexible, [key]));
    }).filter(Boolean);

    if (!candidates.length) {
        return false;
    }

    return candidates.some((candidate) => {
        const candidateKey = normalizeString(candidate);
        const candidateDigits = normalizeDigits(candidate);

        const keyMatch =
            Boolean(candidateKey) &&
            Boolean(targetKey) &&
            (
                candidateKey === targetKey ||
                candidateKey.includes(targetKey) ||
                targetKey.includes(candidateKey)
            );

        const digitMatch =
            Boolean(candidateDigits) &&
            Boolean(targetDigits) &&
            (
                candidateDigits === targetDigits ||
                candidateDigits.includes(targetDigits) ||
                targetDigits.includes(candidateDigits)
            );

        return keyMatch || digitMatch;
    });
}

function rowHasAccountReference(row) {
    const flexible = buildFlexibleSource(row);

    return ACCOUNT_MATCH_KEYS.some((key) => {
        if (row && Object.prototype.hasOwnProperty.call(row, key) && cleanString(row[key])) {
            return true;
        }

        return Boolean(cleanString(pickFlexibleValue(flexible, [key])));
    });
}

function scopeRowsByAccount(rows, accountId) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const cleanAccountId = cleanString(accountId);

    if (!cleanAccountId) {
        return safeRows;
    }

    const matched = safeRows.filter((row) => rowMatchesAccount(row, cleanAccountId));

    if (matched.length > 0) {
        return matched;
    }

    const rowsWithAccountReference = safeRows.filter((row) => rowHasAccountReference(row));

    if (rowsWithAccountReference.length === 0) {
        return safeRows;
    }

    return [];
}

function getBalanceTimestamp(row) {
    const flexible = buildFlexibleSource(row);

    return (
        toDateOrNull(
            pickFlexibleValue(flexible, [
                "timestamp",
                "time",
                "dateTime",
                "datetime",
                "tradeDate",
                "transactionDate",
                "businessDate",
                "statementDate",
                "runDate",
                "date",
                "createdAt",
                "updatedAt",
            ]) || firstString(row, [
                "timestamp",
                "time",
                "dateTime",
                "datetime",
                "tradeDate",
                "transactionDate",
                "businessDate",
                "statementDate",
                "runDate",
                "date",
                "Date",
                "createdAt",
                "updatedAt",
            ])
        ) || null
    );
}
function getBalanceValue(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "currentBalance",
        "endingBalance",
        "endBalance",
        "closingBalance",
        "endOfDayBalance",
        "eodBalance",
        "balanceAfter",
        "endingCash",
        "cashAfter",
        "netLiq",
        "accountBalance",
        "cashBalance",
        "totalAmount",
        "amount",
        "balance",
        "Current Balance",
        "Ending Balance",
        "End Balance",
        "Closing Balance",
        "End Of Day Balance",
        "Net Liq",
        "Account Balance",
        "Cash Balance",
        "Total Amount",
        "Amount",
        "Balance",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getExplicitStartingBalanceValue(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "startingBalance",
        "startBalance",
        "beginningBalance",
        "openingBalance",
        "initialBalance",
        "balanceBefore",
        "cashBefore",
        "priorBalance",
        "previousBalance",
        "startOfDayBalance",
        "Start Balance",
        "Starting Balance",
        "Beginning Balance",
        "Opening Balance",
        "Initial Balance",
        "Previous Balance",
        "Prior Balance",
        "Start Of Day Balance",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getBalanceRealizedPnl(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "totalRealizedPnl",
        "realizedPnl",
        "netPnl",
        "totalNetPnl",
        "dayPnl",
        "dailyPnl",
        "pnl",
        "profitLoss",
        "Total Realized PNL",
        "Realized PnL",
        "Net PnL",
        "Daily PnL",
        "P/L",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getBalanceNetChange(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "delta",
        "cashChange",
        "netChange",
        "change",
        "dayChange",
        "dailyPnl",
        "dailyPnL",
        "realizedPnl",
        "profitLoss",
        "profit",
        "pnl",
        "Delta",
        "Cash Change",
        "Net Change",
        "Daily PnL",
        "Profit Loss",
        "P/L",
        "PnL",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getBalanceDayPnlValue(row) {
    const realized = getBalanceRealizedPnl(row);

    if (realized !== null && realized !== undefined) {
        return realized;
    }

    return getBalanceNetChange(row);
}

function buildBalanceSummary(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (!safeRows.length) {
        return {
            startBalance: null,
            currentBalance: null,
            latestTradingDayKey: "",
        };
    }

    const entries = [...safeRows]
        .map((row) => {
            const timestamp = getBalanceTimestamp(row);
            const explicitStart = getExplicitStartingBalanceValue(row);
            let end = getBalanceValue(row);
            const change = getBalanceNetChange(row);

            if (
                (end === null || end === undefined) &&
                explicitStart !== null &&
                explicitStart !== undefined &&
                change !== null
            ) {
                end = explicitStart + change;
            }

            return {
                row,
                timestamp,
                explicitStart,
                end,
                change,
            };
        })
        .sort((a, b) => {
            const aTime = (a.timestamp || new Date(0)).getTime();
            const bTime = (b.timestamp || new Date(0)).getTime();
            return aTime - bTime;
        });

    let startBalance = null;
    let currentBalance = null;

    for (const entry of entries) {
        if (startBalance === null || startBalance === undefined) {
            if (entry.explicitStart !== null && entry.explicitStart !== undefined) {
                startBalance = entry.explicitStart;
            }
        }

        if (entry.end !== null && entry.end !== undefined) {
            currentBalance = entry.end;
        }
    }

    const latestEntryWithTimestamp = [...entries].reverse().find((entry) => entry.timestamp);

    return {
        startBalance,
        currentBalance,
        latestTradingDayKey: latestEntryWithTimestamp
            ? getTradingDayKey(latestEntryWithTimestamp.timestamp)
            : "",
    };
}

function deriveAccountSize({
    accountId,
    account,
    startBalance,
    currentBalance,
    fallbackSize,
}) {
    const explicitFallback = normalizeAccountSize(fallbackSize, 0);

    if (explicitFallback > 0) {
        return explicitFallback;
    }

    const candidates = [
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.displayName,
        account?.id,
        account?.accountId,
        account?.accountName,
        account?.name,
        accountId,
    ];

    for (const candidate of candidates) {
        const detected = detectAccountSize(candidate);

        if (detected > 0) {
            return detected;
        }
    }

    const reference =
        startBalance !== null && startBalance !== undefined && startBalance > 0
            ? startBalance
            : currentBalance;

    return normalizeAccountSize(reference, 0);
}

function sumNumbers(values) {
    const safeValues = Array.isArray(values) ? values : [];
    return safeValues.reduce((sum, value) => sum + toNumber(value, 0), 0);
}

function getLatestTradingDayKey(rows, getTimestamp) {
    const safeRows = Array.isArray(rows) ? rows : [];
    let latestTimestamp = null;
    let latestTradingDayKey = "";

    for (const row of safeRows) {
        const timestamp = getTimestamp(row);

        if (!timestamp) {
            continue;
        }

        if (!latestTimestamp || timestamp.getTime() > latestTimestamp.getTime()) {
            latestTimestamp = timestamp;
            latestTradingDayKey = getTradingDayKey(timestamp);
        }
    }

    return latestTradingDayKey;
}

function getRowsForTradingDay(rows, tradingDayKey, getTimestamp) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const targetTradingDayKey = cleanString(tradingDayKey);

    if (!targetTradingDayKey) {
        return [];
    }

    return safeRows.filter((row) => {
        const timestamp = getTimestamp(row);

        if (!timestamp) {
            return false;
        }

        return getTradingDayKey(timestamp) === targetTradingDayKey;
    });
}

function getInstrumentConfig(value) {
    const key = cleanString(value).toUpperCase();

    if (key.startsWith("MNQ")) {
        return INSTRUMENT_CONFIG.MNQ;
    }

    if (key.startsWith("NQ")) {
        return INSTRUMENT_CONFIG.NQ;
    }

    if (key.startsWith("MES")) {
        return INSTRUMENT_CONFIG.MES;
    }

    if (key.startsWith("ES")) {
        return INSTRUMENT_CONFIG.ES;
    }

    return INSTRUMENT_CONFIG.MNQ;
}

function getPositionInstrumentKey(position) {
    return cleanString(
        position?.instrument ||
        position?.symbol ||
        position?.ticker ||
        position?.contract ||
        position?.name
    ).toUpperCase();
}

function getPositionApexUnit(position) {
    return getInstrumentConfig(getPositionInstrumentKey(position)).apexUnit;
}

function getOrderStatusValue(order) {
    return normalizeString(
        order?.status ||
        order?.orderStatus ||
        order?.state
    );
}

function isWorkingOrder(order) {
    const status = getOrderStatusValue(order);

    if (!status) {
        return false;
    }

    return (
        status.includes("open") ||
        status.includes("working") ||
        status.includes("pending") ||
        status.includes("submit") ||
        status.includes("accepted") ||
        status.includes("new")
    );
}

function countOpenOrders(orders) {
    const safeOrders = Array.isArray(orders) ? orders : [];
    return safeOrders.filter((order) => isWorkingOrder(order)).length;
}

function normalizeRiskMode(value) {
    const raw = cleanString(value).toUpperCase().replace(/[^A-Z]+/g, "_");

    if (raw === "EVAL_EOD") {
        return "EVAL_EOD";
    }

    if (raw === "EVAL_INTRADAY") {
        return "EVAL_INTRADAY";
    }

    if (raw === "PA_EOD") {
        return "PA_EOD";
    }

    if (raw === "PA_INTRADAY") {
        return "PA_INTRADAY";
    }

    const source = cleanString(value).toUpperCase();

    if (source.includes("PA") && source.includes("INTRADAY")) {
        return "PA_INTRADAY";
    }

    if (source.includes("PA") && source.includes("EOD")) {
        return "PA_EOD";
    }

    if ((source.includes("EVAL") || source.includes("EVALUATION")) && source.includes("INTRADAY")) {
        return "EVAL_INTRADAY";
    }

    if ((source.includes("EVAL") || source.includes("EVALUATION")) && source.includes("EOD")) {
        return "EVAL_EOD";
    }

    return "EVAL_EOD";
}

function getModeLabel(mode) {
    return (
        APEX_MODE_OPTIONS.find((option) => option.value === mode)?.label ||
        "EVAL EOD"
    );
}

function getDefaultDailyTarget(accountSize) {
    switch (normalizeAccountSize(accountSize, 25000)) {
        case 50000:
            return 500;
        case 100000:
            return 1000;
        case 150000:
            return 1500;
        default:
            return 250;
    }
}

function resolveDefaultRiskMode(resolvedAccount) {
    const phase = cleanString(resolvedAccount?.accountPhase).toLowerCase();
    const productType = cleanString(resolvedAccount?.productType).toLowerCase();

    if (phase === "pa" && productType === "intraday") {
        return "PA_INTRADAY";
    }

    if (phase === "pa" && productType === "eod") {
        return "PA_EOD";
    }

    if (phase === "eval" && productType === "intraday") {
        return "EVAL_INTRADAY";
    }

    if (phase === "eval" && productType === "eod") {
        return "EVAL_EOD";
    }

    return normalizeRiskMode(
        resolvedAccount?.mode ||
        resolvedAccount?.accountMode ||
        resolvedAccount?.phaseMode ||
        resolvedAccount?.name ||
        "EVAL_EOD"
    );
}

function hasActiveAccountContext(resolvedAccount, resolvedAccountId) {
    if (cleanString(resolvedAccountId)) {
        return true;
    }

    if (!resolvedAccount || typeof resolvedAccount !== "object") {
        return false;
    }

    return Boolean(
        cleanString(resolvedAccount.id) ||
        cleanString(resolvedAccount.accountId) ||
        cleanString(resolvedAccount.accountName) ||
        cleanString(resolvedAccount.name) ||
        cleanString(resolvedAccount.label) ||
        cleanString(resolvedAccount.apexId) ||
        cleanString(resolvedAccount.tradingAccountId)
    );
}

function resolveScopeAccountId(resolvedAccount, resolvedAccountId) {
    const candidates = [
        resolvedAccount?.tradingAccountId,
        resolvedAccount?.tradingAccountName,
        resolvedAccount?.apexId,
        resolvedAccount?.accountId,
        resolvedAccount?.accountName,
        resolvedAccount?.displayName,
        resolvedAccount?.name,
        resolvedAccount?.label,
        resolvedAccountId,
    ]
        .map(cleanString)
        .filter(Boolean);

    for (const candidate of candidates) {
        if (looksLikeInternalAccountId(candidate)) {
            continue;
        }

        return candidate;
    }

    return "";
}

function createDefaultRiskDraft(detectedAccountSize, resolvedAccount, hasActiveAccount = true) {
    if (!hasActiveAccount) {
        return {
            mode: "",
            accountSize: null,
            dailyTarget: 0,
            instrument: "MNQ",
            side: "long",
            entry: "",
            stop: "",
            target: "",
            qty: 1,
        };
    }

    const normalizedAccountSize = normalizeAccountSize(
        detectedAccountSize || resolvedAccount?.accountSize,
        25000
    );

    return {
        mode: resolveDefaultRiskMode(resolvedAccount),
        accountSize: normalizedAccountSize,
        dailyTarget: getDefaultDailyTarget(normalizedAccountSize),
        instrument: "MNQ",
        side: "long",
        entry: "",
        stop: "",
        target: "",
        qty: 1,
    };
}

function buildTopAlert({
    accountName,
    thresholdRuleStatus,
    dllRuleStatus,
    exposureRuleStatus,
    payoutRuleStatus,
    inactivityRuleStatus,
}) {
    const rules = [
        { key: "Threshold", ...thresholdRuleStatus },
        { key: "DLL", ...dllRuleStatus },
        { key: "Exposure", ...exposureRuleStatus },
        { key: "Payout", ...payoutRuleStatus },
        { key: "Inactivity", ...inactivityRuleStatus },
    ];

    const redRule = rules.find((rule) => rule.status === "red");

    if (redRule) {
        return {
            status: "red",
            title: `${accountName}. Regel verletzt.`,
            message: `${redRule.key} ist verletzt.`,
            detail: redRule.hint,
        };
    }

    const yellowRule = rules.find((rule) => rule.status === "yellow");

    if (yellowRule) {
        return {
            status: "yellow",
            title: `${accountName}. Achtung.`,
            message: `${yellowRule.key} ist kritisch.`,
            detail: yellowRule.hint,
        };
    }

    return {
        status: "green",
        title: `${accountName}. Alles sauber.`,
        message: "Aktuell liegt keine kritische Regelverletzung vor.",
        detail: "Threshold, DLL, Exposure, Payout und Inactivity sind grün oder nicht aktiv.",
    };
}
function TopAlertBar({ alert }) {
    const ui = getStatusUi(alert.status);

    return (
        <div
            style={{
                border: `1px solid ${ui.border}`,
                borderRadius: 18,
                padding: 14,
                background: ui.background,
                boxShadow: COLORS.shadow,
                display: "grid",
                gap: 5,
            }}
        >
            <div
                style={{
                    color: ui.text,
                    fontSize: 16,
                    fontWeight: 900,
                }}
            >
                {alert.title}
            </div>

            <div
                style={{
                    color: COLORS.text,
                    fontSize: 14,
                    fontWeight: 800,
                    lineHeight: 1.45,
                }}
            >
                {alert.message}
            </div>

            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 11,
                    lineHeight: 1.45,
                }}
            >
                {alert.detail}
            </div>
        </div>
    );
}

function RuleStatusCard({ title, value, hint, status = "green" }) {
    const ui = getStatusUi(status);

    return (
        <div
            style={{
                background: ui.background,
                border: `1px solid ${ui.border}`,
                borderRadius: 14,
                padding: 12,
                minHeight: 86,
                display: "grid",
                gap: 5,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 10,
                }}
            >
                {title}
            </div>

            <div
                style={{
                    color: ui.text,
                    fontSize: 14,
                    fontWeight: 800,
                    wordBreak: "break-word",
                }}
            >
                {value}
            </div>

            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 10,
                    lineHeight: 1.4,
                }}
            >
                {hint}
            </div>
        </div>
    );
}

function InfoCard({ label, value, hint, color, background, borderColor }) {
    return (
        <div
            style={{
                background: background || COLORS.panelBg,
                border: `1px solid ${borderColor || color || COLORS.border}`,
                borderRadius: 14,
                padding: 12,
                minHeight: 72,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 10,
                    marginBottom: 5,
                }}
            >
                {label}
            </div>

            <div
                style={{
                    color: color || COLORS.text,
                    fontSize: 13,
                    fontWeight: 700,
                    wordBreak: "break-word",
                }}
            >
                {value || "–"}
            </div>

            {hint ? (
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 10,
                        marginTop: 5,
                        lineHeight: 1.35,
                    }}
                >
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

function CompactMetricCard({
    label,
    value,
    hint = "",
    color = COLORS.text,
    background = "rgba(255, 255, 255, 0.03)",
    borderColor = COLORS.border,
}) {
    return (
        <div
            style={{
                background,
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                padding: 8,
                minHeight: 58,
                display: "grid",
                gap: 3,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 8,
                    lineHeight: 1.2,
                }}
            >
                {label}
            </div>

            <div
                style={{
                    color,
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1.15,
                    wordBreak: "break-word",
                }}
            >
                {value || "–"}
            </div>

            {hint ? (
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 8,
                        lineHeight: 1.25,
                    }}
                >
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

function CompactRulePill({ title, value, status = "green" }) {
    const ui = getStatusUi(status);

    return (
        <div
            style={{
                border: `1px solid ${ui.border}`,
                borderRadius: 10,
                padding: "6px 7px",
                background: ui.background,
                display: "grid",
                gap: 2,
                minHeight: 44,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 7,
                    lineHeight: 1.1,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                }}
            >
                {title}
            </div>

            <div
                style={{
                    color: ui.text,
                    fontSize: 9,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    wordBreak: "break-word",
                }}
            >
                {value}
            </div>
        </div>
    );
}

function InputField({ label, children }) {
    return (
        <label
            style={{
                display: "grid",
                gap: 5,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 11,
                    fontWeight: 600,
                }}
            >
                {label}
            </div>
            {children}
        </label>
    );
}

function NeutralRiskPanel() {
    return (
        <div
            style={{
                display: "grid",
                gap: 14,
            }}
        >
            <div
                style={{
                    color: COLORS.title,
                    fontSize: 16,
                    fontWeight: 800,
                }}
            >
                Risk Übersicht
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                }}
            >
                <InfoCard
                    label="Balance"
                    value="–"
                    hint="Kein aktiver Account gewählt"
                    color={COLORS.cyan}
                />
                <InfoCard
                    label="Startbalance"
                    value="–"
                    hint="Kein aktiver Account gewählt"
                    color={COLORS.yellow}
                />
                <InfoCard
                    label="Kontogrösse"
                    value="–"
                    hint="Kein aktiver Account gewählt"
                    color={COLORS.purple}
                />
            </div>
        </div>
    );
}

function RiskPanelContent({
    provider,
    resolvedAccount,
    resolvedAccountId,
    scopeAccountId,
    accountBalanceRows,
    accountFills,
    accountOrders,
    activeTradingDayKey,
    liveTodayPnl,
    currentBalance,
    startBalance,
    detectedAccountSize,
    balanceDelta,
    liveExposureUnits,
    livePositions,
    showCalculator = true,
}) {
    const persistenceRef = useRef("");
    const [riskDraft, setRiskDraft] = useState(() =>
        createDefaultRiskDraft(detectedAccountSize, resolvedAccount, true)
    );

    const compactMode = showCalculator === false;
    const providerLabel = formatProviderLabel(provider);

    const openPositionCount = useMemo(() => {
        return livePositions.filter((position) => Math.abs(toNumber(position?.quantity, 0)) > 0).length;
    }, [livePositions]);

    const openOrderCount = useMemo(() => {
        return countOpenOrders(accountOrders);
    }, [accountOrders]);

    const riskSnapshot = useMemo(() => {
        return buildApexRiskSnapshot({
            account: {
                ...resolvedAccount,
                provider,
                dataProvider: provider,
            },
            mode: riskDraft.mode,
            accountSize: riskDraft.accountSize,
            balanceHistoryRows: accountBalanceRows,
            currentBalance,
            currentContracts: liveExposureUnits,
            fills: accountFills,
        });
    }, [
        provider,
        resolvedAccount,
        riskDraft.mode,
        riskDraft.accountSize,
        accountBalanceRows,
        currentBalance,
        liveExposureUnits,
        accountFills,
    ]);

    const thresholdRuleStatus = useMemo(() => {
        if (riskSnapshot.status?.thresholdBreached) {
            return {
                status: "red",
                value: "Verletzt",
                hint: `Threshold ${formatCurrency(riskSnapshot.thresholdBalance)}`,
            };
        }

        if ((riskSnapshot.distanceToThreshold || 0) <= 250) {
            return {
                status: "yellow",
                value: "Kritisch",
                hint: `Rest ${formatCurrency(riskSnapshot.distanceToThreshold)}`,
            };
        }

        return {
            status: "green",
            value: "Sauber",
            hint: `Rest ${formatCurrency(riskSnapshot.distanceToThreshold)}`,
        };
    }, [riskSnapshot]);

    const dllRuleStatus = useMemo(() => {
        if (riskSnapshot.dll === null || riskSnapshot.dll === undefined) {
            return {
                status: "green",
                value: "Nicht aktiv",
                hint: "In diesem Modus gibt es kein DLL.",
            };
        }

        if (riskSnapshot.status?.dllBreached) {
            return {
                status: "red",
                value: "Verletzt",
                hint: `Rest ${formatCurrency(riskSnapshot.remainingDll)}`,
            };
        }

        if ((riskSnapshot.remainingDll || 0) <= 150) {
            return {
                status: "yellow",
                value: "Kritisch",
                hint: `Rest ${formatCurrency(riskSnapshot.remainingDll)}`,
            };
        }

        return {
            status: "green",
            value: "Sauber",
            hint: `Rest ${formatCurrency(riskSnapshot.remainingDll)}`,
        };
    }, [riskSnapshot]);

    const exposureRuleStatus = useMemo(() => {
        if (riskSnapshot.status?.contractBreached) {
            return {
                status: "red",
                value: "Verletzt",
                hint: `${formatExposureUnits(liveExposureUnits)} von ${formatExposureUnits(riskSnapshot.maxContracts)}`,
            };
        }

        const freeExposure = Math.max((riskSnapshot.maxContracts || 0) - toNumber(liveExposureUnits, 0), 0);

        if (freeExposure <= 1) {
            return {
                status: "yellow",
                value: "Kritisch",
                hint: `Frei ${formatExposureUnits(freeExposure)}`,
            };
        }

        return {
            status: "green",
            value: "Sauber",
            hint: `Frei ${formatExposureUnits(freeExposure)}`,
        };
    }, [riskSnapshot, liveExposureUnits]);

    const payoutRuleStatus = useMemo(() => {
        if (riskSnapshot.accountPhase !== "pa") {
            return {
                status: "green",
                value: "Später aktiv",
                hint: "Payout gilt erst in PA.",
            };
        }

        if (!riskSnapshot.payout) {
            return {
                status: "yellow",
                value: "Offen",
                hint: "Payout Daten fehlen.",
            };
        }

        if (riskSnapshot.payout.eligible) {
            return {
                status: "green",
                value: "Frei",
                hint: `Requestable ${formatCurrency(riskSnapshot.payout.requestableAmountAfterMinimumCheck)}`,
            };
        }

        if (riskSnapshot.payout.status === "red") {
            return {
                status: "red",
                value: "Blockiert",
                hint: riskSnapshot.payout.reasons?.[0] || "Payout blockiert.",
            };
        }

        return {
            status: "yellow",
            value: "Noch nicht frei",
            hint: riskSnapshot.payout.reasons?.[0] || "Payout Bedingungen noch offen.",
        };
    }, [riskSnapshot]);

    const inactivityRuleStatus = useMemo(() => {
        if (riskSnapshot.accountPhase !== "pa") {
            return {
                status: "green",
                value: "Später aktiv",
                hint: "Inactivity gilt erst in PA.",
            };
        }

        if (!riskSnapshot.inactivity) {
            return {
                status: "yellow",
                value: "Offen",
                hint: "Inactivity Daten fehlen.",
            };
        }

        if (riskSnapshot.inactivity.status === "red") {
            return {
                status: "red",
                value: "Verletzt",
                hint: `Tage seit Referenz ${formatDecimal(riskSnapshot.inactivity.daysSinceReference, 0)}`,
            };
        }

        if (riskSnapshot.inactivity.status === "yellow") {
            return {
                status: "yellow",
                value: "Kritisch",
                hint: `Noch ${formatDecimal(riskSnapshot.inactivity.daysRemaining, 0)} Tage`,
            };
        }

        return {
            status: "green",
            value: "Sauber",
            hint: `Noch ${formatDecimal(riskSnapshot.inactivity.daysRemaining, 0)} Tage`,
        };
    }, [riskSnapshot]);

    const topAlert = useMemo(() => {
        const accountName =
            resolvedAccount?.tradingAccountName ||
            resolvedAccount?.displayName ||
            scopeAccountId ||
            resolvedAccountId ||
            "Account";

        return buildTopAlert({
            accountName,
            thresholdRuleStatus,
            dllRuleStatus,
            exposureRuleStatus,
            payoutRuleStatus,
            inactivityRuleStatus,
        });
    }, [
        resolvedAccount,
        scopeAccountId,
        resolvedAccountId,
        thresholdRuleStatus,
        dllRuleStatus,
        exposureRuleStatus,
        payoutRuleStatus,
        inactivityRuleStatus,
    ]);

    const calculator = useMemo(() => {
        const instrument = getInstrumentConfig(riskDraft.instrument);
        const side = riskDraft.side === "short" ? "short" : "long";
        const entry = toNumber(riskDraft.entry, 0);
        const stop = toNumber(riskDraft.stop, 0);
        const target = toNumber(riskDraft.target, 0);
        const qty = toSafeInteger(riskDraft.qty, 1);
        const dailyTarget = Math.max(toNumber(riskDraft.dailyTarget, 0), 0);

        const hasEntry = entry > 0;
        const hasStop = stop > 0;
        const hasTarget = target > 0;

        const stopDistancePoints =
            hasEntry && hasStop ? Math.abs(entry - stop) : 0;
        const targetDistancePoints =
            hasEntry && hasTarget ? Math.abs(target - entry) : 0;

        const stopTicks =
            stopDistancePoints > 0 ? stopDistancePoints / instrument.tickSize : 0;
        const targetTicks =
            targetDistancePoints > 0 ? targetDistancePoints / instrument.tickSize : 0;

        const riskPerContract = stopTicks * instrument.tickValue;
        const rewardPerContract = targetTicks * instrument.tickValue;
        const totalRisk = riskPerContract * qty;
        const totalReward = rewardPerContract * qty;
        const rrRatio = totalRisk > 0 ? totalReward / totalRisk : null;

        const hasDirectionError =
            (side === "long" && ((hasStop && stop >= entry) || (hasTarget && target <= entry))) ||
            (side === "short" && ((hasStop && stop <= entry) || (hasTarget && target >= entry)));

        const hasInputError =
            !hasEntry ||
            !hasStop ||
            !hasTarget ||
            stopDistancePoints <= 0 ||
            targetDistancePoints <= 0;

        const remainingThresholdRoom = Math.max(riskSnapshot.distanceToThreshold || 0, 0);
        const remainingDllRoom =
            riskSnapshot.dll === null || riskSnapshot.dll === undefined
                ? null
                : Math.max(riskSnapshot.remainingDll || 0, 0);

        let status = "green";
        let message = "Trade passt sauber in dein aktuelles Risiko.";

        if (hasInputError || hasDirectionError) {
            status = "red";
            message = "Entry, Stop, Target oder Richtung passen noch nicht.";
        } else if (totalRisk > remainingThresholdRoom) {
            status = "red";
            message = "Trade ist zu gross für den aktiven Threshold.";
        } else if (
            remainingDllRoom !== null &&
            remainingDllRoom !== undefined &&
            totalRisk > remainingDllRoom
        ) {
            status = "red";
            message = "Trade ist zu gross für das aktive DLL.";
        } else if ((rrRatio || 0) < 1) {
            status = "yellow";
            message = "CRV ist schwach.";
        }

        const projectedBalanceAfterStop =
            currentBalance !== null && currentBalance !== undefined
                ? currentBalance - totalRisk
                : null;

        const projectedBalanceAfterTarget =
            currentBalance !== null && currentBalance !== undefined
                ? currentBalance + totalReward
                : null;

        const targetGap = Math.max(dailyTarget - Math.max(liveTodayPnl, 0), 0);

        return {
            instrument,
            qty,
            stopDistancePoints,
            targetDistancePoints,
            stopTicks,
            targetTicks,
            riskPerContract,
            rewardPerContract,
            totalRisk,
            totalReward,
            rrRatio,
            hasInputError,
            hasDirectionError,
            projectedBalanceAfterStop,
            projectedBalanceAfterTarget,
            targetGap,
            status,
            message,
        };
    }, [riskDraft, riskSnapshot, currentBalance, liveTodayPnl]);
        const persistencePayload = useMemo(() => {
        const tradingDayKey = cleanString(activeTradingDayKey) || getTradingDayKey(new Date());
        const safeCurrentBalance = toNumber(currentBalance, 0);
        const safeStartBalance = toNumber(startBalance, 0);
        const safeDailyPnl = toNumber(liveTodayPnl, 0);

        const drawdownLimit = toNumber(
            riskSnapshot.thresholdBalance ?? riskSnapshot.liquidationBalance,
            0
        );

        const maxDailyLoss = toNumber(riskSnapshot.dll, 0);
        const liquidationValue = toNumber(
            riskSnapshot.liquidationBalance ?? riskSnapshot.thresholdBalance,
            0
        );

        const stopRiskViolation = Boolean(riskSnapshot.status?.thresholdBreached);
        const trailingDrawdownViolation = Boolean(riskSnapshot.status?.dllBreached);
        const contractViolation = Boolean(riskSnapshot.status?.contractBreached);
        const isLocked = stopRiskViolation || trailingDrawdownViolation || contractViolation;

        return {
            sessionKey: tradingDayKey,
            tradingDate: tradingDayKey,
            dailyPnL: safeDailyPnl,
            realizedPnL: safeDailyPnl,
            unrealizedPnL: 0,
            startingBalance: safeStartBalance,
            currentBalance: safeCurrentBalance,
            liquidationPrice: liquidationValue,
            liquidationPriceBreached: stopRiskViolation || trailingDrawdownViolation,
            stopRiskViolation,
            trailingDrawdownViolation,
            isLocked,
            drawdownLimit,
            maxDailyLoss,
            openPositionCount,
            openOrderCount,
            accountSize: toNumber(detectedAccountSize, 0),
            balance: safeCurrentBalance,
            tradingAccountId: cleanString(
                resolvedAccount?.tradingAccountId ||
                resolvedAccount?.apexId ||
                resolvedAccount?.accountId ||
                scopeAccountId
            ),
            tradingAccountName: cleanString(
                resolvedAccount?.tradingAccountName ||
                resolvedAccount?.displayName ||
                resolvedAccount?.name ||
                resolvedAccount?.accountName ||
                scopeAccountId
            ),
            provider,
            dataProvider: provider,
        };
    }, [
        provider,
        activeTradingDayKey,
        currentBalance,
        startBalance,
        liveTodayPnl,
        riskSnapshot,
        openPositionCount,
        openOrderCount,
        detectedAccountSize,
        resolvedAccount,
        scopeAccountId,
    ]);

    useEffect(() => {
        if (!cleanString(resolvedAccountId)) {
            return;
        }

        const signature = JSON.stringify(persistencePayload);

        if (persistenceRef.current === signature) {
            return;
        }

        saveDailyState(resolvedAccountId, persistencePayload);
        saveLiveAccountSnapshot(resolvedAccountId, persistencePayload);

        const hasRedStatus =
            thresholdRuleStatus.status === "red" ||
            dllRuleStatus.status === "red" ||
            exposureRuleStatus.status === "red" ||
            payoutRuleStatus.status === "red" ||
            inactivityRuleStatus.status === "red";

        const hasYellowStatus =
            thresholdRuleStatus.status === "yellow" ||
            dllRuleStatus.status === "yellow" ||
            exposureRuleStatus.status === "yellow" ||
            payoutRuleStatus.status === "yellow" ||
            inactivityRuleStatus.status === "yellow";

        const riskLevel = hasRedStatus ? "red" : hasYellowStatus ? "yellow" : "green";
        const riskLabel = hasRedStatus
            ? "Regel verletzt"
            : hasYellowStatus
                ? "Kritisch"
                : "Alles sauber";

        saveRiskStatusForAccount(resolvedAccountId, {
            level: riskLevel,
            label: riskLabel,
            source: "risk-panel",
            provider,
            flags: {
                threshold: thresholdRuleStatus.status !== "green",
                dll: dllRuleStatus.status !== "green",
                exposure: exposureRuleStatus.status !== "green",
                payout: payoutRuleStatus.status !== "green",
                inactivity: inactivityRuleStatus.status !== "green",
            },
            meta: {
                provider,
                threshold: thresholdRuleStatus,
                dll: dllRuleStatus,
                exposure: exposureRuleStatus,
                payout: payoutRuleStatus,
                inactivity: inactivityRuleStatus,
                dailyPnL: persistencePayload.dailyPnL,
                currentBalance: persistencePayload.currentBalance,
                startBalance: persistencePayload.startingBalance,
                openPositionCount: persistencePayload.openPositionCount,
                openOrderCount: persistencePayload.openOrderCount,
                tradingDate: persistencePayload.tradingDate,
            },
        });

        persistenceRef.current = signature;
    }, [
        provider,
        resolvedAccountId,
        persistencePayload,
        thresholdRuleStatus,
        dllRuleStatus,
        exposureRuleStatus,
        payoutRuleStatus,
        inactivityRuleStatus,
    ]);

    useEffect(() => {
        persistenceRef.current = "";
    }, [resolvedAccountId, provider]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(RISK_ALERT_EVENT_NAME, {
                detail: {
                    accountId: resolvedAccountId || "",
                    accountName:
                        resolvedAccount?.tradingAccountName ||
                        resolvedAccount?.displayName ||
                        resolvedAccount?.name ||
                        resolvedAccountId ||
                        "Account",
                    provider,
                    alert: topAlert,
                    emittedAt: Date.now(),
                },
            })
        );
    }, [
        provider,
        resolvedAccountId,
        resolvedAccount?.tradingAccountName,
        resolvedAccount?.displayName,
        resolvedAccount?.name,
        topAlert,
    ]);

    function handleModeChange(nextMode) {
        setRiskDraft((prev) => ({
            ...prev,
            mode: normalizeRiskMode(nextMode),
        }));
    }

    function handleAccountSizeChange(nextAccountSize) {
        const normalizedSize = normalizeAccountSize(nextAccountSize, 25000);

        setRiskDraft((prev) => ({
            ...prev,
            accountSize: normalizedSize,
            dailyTarget: getDefaultDailyTarget(normalizedSize),
        }));
    }

    function handleRiskDraftChange(key, value) {
        setRiskDraft((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

    function handleResetRiskDraft() {
        setRiskDraft(createDefaultRiskDraft(detectedAccountSize, resolvedAccount, true));
    }

    if (compactMode) {
        const compactStatusUi = getStatusUi(topAlert.status);

        const compactRules = [
            {
                title: "Threshold",
                value: thresholdRuleStatus.value,
                status: thresholdRuleStatus.status,
            },
            {
                title: "DLL",
                value: dllRuleStatus.value,
                status: dllRuleStatus.status,
            },
            {
                title: "Exposure",
                value: exposureRuleStatus.value,
                status: exposureRuleStatus.status,
            },
            {
                title: "Payout",
                value: payoutRuleStatus.value,
                status: payoutRuleStatus.status,
            },
            {
                title: "Inactivity",
                value: inactivityRuleStatus.value,
                status: inactivityRuleStatus.status,
            },
        ];

        return (
            <div
                style={{
                    display: "grid",
                    gap: 8,
                }}
            >
                <div
                    style={{
                        border: `1px solid ${compactStatusUi.border}`,
                        borderRadius: 12,
                        padding: 10,
                        background: compactStatusUi.background,
                        boxShadow: COLORS.shadow,
                        display: "grid",
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 12,
                                    fontWeight: 800,
                                }}
                            >
                                Risk Fokus
                            </div>

                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    wordBreak: "break-word",
                                }}
                            >
                                {resolvedAccount?.tradingAccountName ||
                                    resolvedAccount?.displayName ||
                                    scopeAccountId ||
                                    resolvedAccountId ||
                                    "Unbekannt"}
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                            }}
                        >
                            <div
                                style={{
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    color: COLORS.cyan,
                                    background: "rgba(34,211,238,0.08)",
                                    fontSize: 8,
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {providerLabel}
                            </div>

                            <div
                                style={{
                                    border: `1px solid ${compactStatusUi.border}`,
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    color: compactStatusUi.text,
                                    background: "rgba(255,255,255,0.04)",
                                    fontSize: 8,
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {getModeLabel(riskSnapshot.mode)}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                            gap: 6,
                        }}
                    >
                        <CompactMetricCard
                            label="Balance"
                            value={formatCurrency(currentBalance)}
                            hint="Aktuell"
                            color={COLORS.cyan}
                            borderColor="rgba(34, 211, 238, 0.20)"
                            background="rgba(34, 211, 238, 0.04)"
                        />

                        <CompactMetricCard
                            label="Tages PnL"
                            value={formatSignedCurrency(liveTodayPnl)}
                            hint={formatTradingDayLabel(activeTradingDayKey)}
                            color={liveTodayPnl >= 0 ? COLORS.green : COLORS.red}
                            borderColor={liveTodayPnl >= 0 ? "rgba(74, 222, 128, 0.22)" : "rgba(248, 113, 113, 0.22)"}
                            background={liveTodayPnl >= 0 ? "rgba(74, 222, 128, 0.04)" : "rgba(248, 113, 113, 0.04)"}
                        />

                        <CompactMetricCard
                            label="Threshold Rest"
                            value={formatCurrency(riskSnapshot.distanceToThreshold)}
                            hint={thresholdRuleStatus.hint}
                            color={
                                thresholdRuleStatus.status === "red"
                                    ? COLORS.red
                                    : thresholdRuleStatus.status === "yellow"
                                        ? COLORS.orange
                                        : COLORS.green
                            }
                            borderColor={
                                thresholdRuleStatus.status === "red"
                                    ? "rgba(248, 113, 113, 0.22)"
                                    : thresholdRuleStatus.status === "yellow"
                                        ? "rgba(251, 146, 60, 0.22)"
                                        : "rgba(74, 222, 128, 0.22)"
                            }
                            background={
                                thresholdRuleStatus.status === "red"
                                    ? "rgba(248, 113, 113, 0.04)"
                                    : thresholdRuleStatus.status === "yellow"
                                        ? "rgba(251, 146, 60, 0.04)"
                                        : "rgba(74, 222, 128, 0.04)"
                            }
                        />

                        <CompactMetricCard
                            label="DLL Rest"
                            value={
                                riskSnapshot.dll === null
                                    ? "Kein DLL"
                                    : formatCurrency(riskSnapshot.remainingDll)
                            }
                            hint={
                                riskSnapshot.dll === null
                                    ? "Nicht aktiv"
                                    : dllRuleStatus.hint
                            }
                            color={
                                dllRuleStatus.status === "red"
                                    ? COLORS.red
                                    : dllRuleStatus.status === "yellow"
                                        ? COLORS.orange
                                        : COLORS.green
                            }
                            borderColor={
                                dllRuleStatus.status === "red"
                                    ? "rgba(248, 113, 113, 0.22)"
                                    : dllRuleStatus.status === "yellow"
                                        ? "rgba(251, 146, 60, 0.22)"
                                        : "rgba(74, 222, 128, 0.22)"
                            }
                            background={
                                dllRuleStatus.status === "red"
                                    ? "rgba(248, 113, 113, 0.04)"
                                    : dllRuleStatus.status === "yellow"
                                        ? "rgba(251, 146, 60, 0.04)"
                                        : "rgba(74, 222, 128, 0.04)"
                            }
                        />

                        <CompactMetricCard
                            label="Exposure"
                            value={formatExposureUnits(liveExposureUnits)}
                            hint={`Max ${formatExposureUnits(riskSnapshot.maxContracts)}`}
                            color={
                                exposureRuleStatus.status === "red"
                                    ? COLORS.red
                                    : exposureRuleStatus.status === "yellow"
                                        ? COLORS.orange
                                        : COLORS.green
                            }
                            borderColor={
                                exposureRuleStatus.status === "red"
                                    ? "rgba(248, 113, 113, 0.22)"
                                    : exposureRuleStatus.status === "yellow"
                                        ? "rgba(251, 146, 60, 0.22)"
                                        : "rgba(74, 222, 128, 0.22)"
                            }
                            background={
                                exposureRuleStatus.status === "red"
                                    ? "rgba(248, 113, 113, 0.04)"
                                    : exposureRuleStatus.status === "yellow"
                                        ? "rgba(251, 146, 60, 0.04)"
                                        : "rgba(74, 222, 128, 0.04)"
                            }
                        />

                        <CompactMetricCard
                            label="Kontogrösse"
                            value={formatAccountSizeValue(detectedAccountSize)}
                            hint={balanceDelta === null ? "Kein Delta" : `Delta ${formatSignedCurrency(balanceDelta)}`}
                            color={COLORS.purple}
                            borderColor="rgba(167, 139, 250, 0.22)"
                            background="rgba(167, 139, 250, 0.04)"
                        />

                        <CompactMetricCard
                            label="Positionen"
                            value={formatDecimal(openPositionCount, 0)}
                            hint="Offen"
                            color={COLORS.text}
                            borderColor={COLORS.border}
                            background="rgba(255,255,255,0.025)"
                        />

                        <CompactMetricCard
                            label="Orders"
                            value={formatDecimal(openOrderCount, 0)}
                            hint="Working"
                            color={COLORS.text}
                            borderColor={COLORS.border}
                            background="rgba(255,255,255,0.025)"
                        />
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                            gap: 6,
                        }}
                    >
                        {compactRules.map((rule) => (
                            <CompactRulePill
                                key={rule.title}
                                title={rule.title}
                                value={rule.value}
                                status={rule.status}
                            />
                        ))}
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 999,
                                padding: "3px 7px",
                                background: "rgba(255,255,255,0.04)",
                                color: COLORS.textSoft,
                                fontSize: 8,
                                fontWeight: 700,
                            }}
                        >
                            Tag {formatTradingDayLabel(activeTradingDayKey)}
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 999,
                                padding: "3px 7px",
                                background: "rgba(255,255,255,0.04)",
                                color: COLORS.textSoft,
                                fontSize: 8,
                                fontWeight: 700,
                            }}
                        >
                            Liq. {formatCurrency(riskSnapshot.liquidationBalance)}
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 999,
                                padding: "3px 7px",
                                background: "rgba(34,211,238,0.08)",
                                color: COLORS.cyan,
                                fontSize: 8,
                                fontWeight: 800,
                            }}
                        >
                            {providerLabel}
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 999,
                                padding: "3px 7px",
                                background: "rgba(255,255,255,0.04)",
                                color: compactStatusUi.text,
                                fontSize: 8,
                                fontWeight: 800,
                            }}
                        >
                            {topAlert.message}
                        </div>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${compactStatusUi.border}`,
                            borderRadius: 10,
                            padding: "7px 8px",
                            background: "rgba(255,255,255,0.025)",
                            color: COLORS.textSoft,
                            fontSize: 9,
                            lineHeight: 1.3,
                        }}
                    >
                        {topAlert.detail}
                    </div>
                </div>
            </div>
        );
    }
        const calculatorUi = getStatusUi(calculator.status);

    return (
        <div
            style={{
                display: "grid",
                gap: 14,
            }}
        >
            <TopAlertBar alert={topAlert} />

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                }}
            >
                <InfoCard
                    label="Balance"
                    value={formatCurrency(currentBalance)}
                    hint={
                        accountBalanceRows.length
                            ? `Letzter Eintrag ${formatDateTime(
                                getBalanceTimestamp(
                                    accountBalanceRows[accountBalanceRows.length - 1]
                                )
                            )}`
                            : "Aktueller Account Wert"
                    }
                    color={COLORS.cyan}
                />

                <InfoCard
                    label="Startbalance"
                    value={formatCurrency(startBalance)}
                    hint={detectedAccountSize > 0 ? `Basis ${formatAccountSizeLabel(detectedAccountSize)}` : "Startwert aus Account"}
                    color={COLORS.yellow}
                />

                <InfoCard
                    label="Tages PnL"
                    value={formatSignedCurrency(liveTodayPnl)}
                    hint={`Trading Day ${formatTradingDayLabel(activeTradingDayKey)}`}
                    color={liveTodayPnl >= 0 ? COLORS.green : COLORS.red}
                />

                <InfoCard
                    label="Kontogrösse"
                    value={formatAccountSizeValue(detectedAccountSize)}
                    hint={
                        balanceDelta === null
                            ? "Kein Delta"
                            : `Delta ${formatSignedCurrency(balanceDelta)}`
                    }
                    color={COLORS.purple}
                />

                <InfoCard
                    label="Provider"
                    value={providerLabel}
                    hint="Aktiver Datenweg"
                    color={COLORS.cyan}
                />

                <InfoCard
                    label="Live Exposure"
                    value={formatExposureUnits(liveExposureUnits)}
                    hint={`Max ${formatExposureUnits(riskSnapshot.maxContracts)}`}
                    color={
                        exposureRuleStatus.status === "red"
                            ? COLORS.red
                            : exposureRuleStatus.status === "yellow"
                                ? COLORS.orange
                                : COLORS.green
                    }
                />
            </div>

            <div
                style={{
                    background: COLORS.panelBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: 16,
                    boxShadow: COLORS.shadow,
                    display: "grid",
                    gap: 12,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                    }}
                >
                    <div>
                        <div
                            style={{
                                color: COLORS.title,
                                fontSize: 15,
                                fontWeight: 800,
                            }}
                        >
                            Apex Snapshot
                        </div>
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 12,
                                marginTop: 3,
                            }}
                        >
                            Direkte Ableitung aus Account Balance History und Modus
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${COLORS.borderStrong}`,
                                borderRadius: 999,
                                padding: "7px 12px",
                                color: COLORS.cyan,
                                background: "rgba(34,211,238,0.08)",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {providerLabel}
                        </div>

                        <div
                            style={{
                                border: `1px solid ${riskSnapshot.status?.level === "danger"
                                    ? "rgba(248, 113, 113, 0.24)"
                                    : riskSnapshot.status?.level === "warning"
                                        ? "rgba(251, 146, 60, 0.24)"
                                        : COLORS.border
                                    }`,
                                borderRadius: 999,
                                padding: "7px 12px",
                                color:
                                    riskSnapshot.status?.level === "danger"
                                        ? COLORS.red
                                        : riskSnapshot.status?.level === "warning"
                                            ? COLORS.orange
                                            : COLORS.text,
                                background:
                                    riskSnapshot.status?.level === "danger"
                                        ? "rgba(248, 113, 113, 0.08)"
                                        : riskSnapshot.status?.level === "warning"
                                            ? "rgba(251, 146, 60, 0.08)"
                                            : "rgba(255,255,255,0.03)",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {getModeLabel(riskSnapshot.mode)}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gap: 7,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 11,
                            fontWeight: 600,
                        }}
                    >
                        Modus
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                            gap: 10,
                        }}
                    >
                        {APEX_MODE_OPTIONS.map((option) => {
                            const isActive = riskDraft.mode === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleModeChange(option.value)}
                                    style={{
                                        border: `1px solid ${isActive ? COLORS.cyan : COLORS.borderStrong}`,
                                        background: isActive
                                            ? "rgba(34, 211, 238, 0.14)"
                                            : "rgba(0, 0, 0, 0.18)",
                                        color: isActive ? COLORS.cyan : COLORS.text,
                                        borderRadius: 13,
                                        padding: "11px 13px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 800,
                                            marginBottom: 4,
                                        }}
                                    >
                                        {option.label}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: isActive ? COLORS.title : COLORS.textSoft,
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {option.value.includes("INTRADAY")
                                            ? "Trailing aktiv"
                                            : "EOD basierte Grenze"}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gap: 7,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 11,
                            fontWeight: 600,
                        }}
                    >
                        Kontogrösse
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                            gap: 10,
                        }}
                    >
                        {APEX_ACCOUNT_SIZE_OPTIONS.map((size) => {
                            const isActive =
                                normalizeAccountSize(riskDraft.accountSize, 25000) === size;

                            return (
                                <button
                                    key={size}
                                    type="button"
                                    onClick={() => handleAccountSizeChange(size)}
                                    style={{
                                        border: `1px solid ${isActive ? COLORS.cyan : COLORS.borderStrong}`,
                                        background: isActive
                                            ? "rgba(34, 211, 238, 0.14)"
                                            : "rgba(0, 0, 0, 0.18)",
                                        color: isActive ? COLORS.cyan : COLORS.text,
                                        borderRadius: 13,
                                        padding: "11px 13px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 800,
                                            marginBottom: 4,
                                        }}
                                    >
                                        {formatAccountSizeLabel(size)}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 10,
                                            color: isActive ? COLORS.title : COLORS.textSoft,
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        Start {formatCurrency(size)}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 10,
                    }}
                >
                    <RuleStatusCard
                        title="Threshold"
                        value={thresholdRuleStatus.value}
                        hint={thresholdRuleStatus.hint}
                        status={thresholdRuleStatus.status}
                    />
                    <RuleStatusCard
                        title="DLL"
                        value={dllRuleStatus.value}
                        hint={dllRuleStatus.hint}
                        status={dllRuleStatus.status}
                    />
                    <RuleStatusCard
                        title="Exposure"
                        value={exposureRuleStatus.value}
                        hint={exposureRuleStatus.hint}
                        status={exposureRuleStatus.status}
                    />
                    <RuleStatusCard
                        title="Payout"
                        value={payoutRuleStatus.value}
                        hint={payoutRuleStatus.hint}
                        status={payoutRuleStatus.status}
                    />
                    <RuleStatusCard
                        title="Inactivity"
                        value={inactivityRuleStatus.value}
                        hint={inactivityRuleStatus.hint}
                        status={inactivityRuleStatus.status}
                    />
                </div>
            </div>

            {showCalculator ? (
                <div
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${calculatorUi.border}`,
                        borderRadius: 18,
                        padding: 16,
                        boxShadow: COLORS.shadow,
                        display: "grid",
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 15,
                                    fontWeight: 800,
                                }}
                            >
                                Riskrechner
                            </div>
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 12,
                                    marginTop: 3,
                                }}
                            >
                                Direkte Trade Prüfung vor dem Entry
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                            }}
                        >
                            <div
                                style={{
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    borderRadius: 999,
                                    padding: "7px 12px",
                                    color: COLORS.cyan,
                                    background: "rgba(34,211,238,0.08)",
                                    fontSize: 11,
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {providerLabel}
                            </div>

                            <div
                                style={{
                                    border: `1px solid ${calculatorUi.border}`,
                                    borderRadius: 999,
                                    padding: "7px 12px",
                                    color: calculatorUi.text,
                                    background: calculatorUi.background,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {calculator.status === "green"
                                    ? "Grün"
                                    : calculator.status === "yellow"
                                        ? "Gelb"
                                        : "Rot"}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InputField label="Tagesziel">
                            <input
                                type="number"
                                step="1"
                                value={riskDraft.dailyTarget}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "dailyTarget",
                                        toNumber(event.target.value, 0)
                                    )
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Instrument">
                            <select
                                value={riskDraft.instrument}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "instrument",
                                        cleanString(event.target.value).toUpperCase()
                                    )
                                }
                                style={inputStyle}
                            >
                                <option value="MNQ">MNQ</option>
                                <option value="NQ">NQ</option>
                                <option value="MES">MES</option>
                                <option value="ES">ES</option>
                            </select>
                        </InputField>

                        <InputField label="Seite">
                            <select
                                value={riskDraft.side}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "side",
                                        event.target.value === "short" ? "short" : "long"
                                    )
                                }
                                style={inputStyle}
                            >
                                <option value="long">long</option>
                                <option value="short">short</option>
                            </select>
                        </InputField>

                        <InputField label="Entry">
                            <input
                                type="number"
                                step="0.25"
                                value={riskDraft.entry}
                                onChange={(event) =>
                                    handleRiskDraftChange("entry", event.target.value)
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Stop">
                            <input
                                type="number"
                                step="0.25"
                                value={riskDraft.stop}
                                onChange={(event) =>
                                    handleRiskDraftChange("stop", event.target.value)
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Target">
                            <input
                                type="number"
                                step="0.25"
                                value={riskDraft.target}
                                onChange={(event) =>
                                    handleRiskDraftChange("target", event.target.value)
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Kontrakte">
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={riskDraft.qty}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "qty",
                                        toSafeInteger(event.target.value, 1)
                                    )
                                }
                                style={inputStyle}
                            />
                        </InputField>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                        }}
                    >
                        <button
                            type="button"
                            onClick={handleResetRiskDraft}
                            style={buttonStyle}
                        >
                            Rechner zurücksetzen
                        </button>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${calculatorUi.border}`,
                            borderRadius: 13,
                            padding: 12,
                            background: calculatorUi.background,
                            color: calculatorUi.text,
                            fontSize: 14,
                            lineHeight: 1.45,
                            fontWeight: 700,
                        }}
                    >
                        {calculator.message}
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCard
                            label="Risiko pro Kontrakt"
                            value={formatCurrency(calculator.riskPerContract)}
                            hint={`${formatDecimal(calculator.stopTicks, 0)} Ticks`}
                            color={COLORS.red}
                        />
                        <InfoCard
                            label="Chance pro Kontrakt"
                            value={formatCurrency(calculator.rewardPerContract)}
                            hint={`${formatDecimal(calculator.targetTicks, 0)} Ticks`}
                            color={COLORS.green}
                        />
                        <InfoCard
                            label="Gesamtrisiko"
                            value={formatCurrency(calculator.totalRisk)}
                            hint={`${calculator.qty} neue Kontrakte`}
                            color={COLORS.orange}
                        />
                        <InfoCard
                            label="Gesamtziel"
                            value={formatCurrency(calculator.totalReward)}
                            hint={`${calculator.qty} neue Kontrakte`}
                            color={COLORS.green}
                        />
                        <InfoCard
                            label="CRV"
                            value={formatRatio(calculator.rrRatio)}
                            hint={calculator.instrument.label}
                            color={COLORS.purple}
                        />
                        <InfoCard
                            label="Balance nach Stop"
                            value={formatCurrency(calculator.projectedBalanceAfterStop)}
                            hint={`Tagesziel offen ${formatCurrency(calculator.targetGap)}`}
                            color={COLORS.red}
                        />
                        <InfoCard
                            label="Balance nach Ziel"
                            value={formatCurrency(calculator.projectedBalanceAfterTarget)}
                            hint={`Tagesziel offen ${formatCurrency(calculator.targetGap)}`}
                            color={COLORS.green}
                        />
                        <InfoCard
                            label="Risiko Prozent"
                            value={formatPercent(
                                startBalance > 0 ? (calculator.totalRisk / startBalance) * 100 : null
                            )}
                            hint={`Basis ${formatCurrency(startBalance)}`}
                            color={COLORS.yellow}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
function AtasRiskPanelContent({
    provider,
    resolvedAccount,
    resolvedAccountId,
    scopeAccountId,
    activeTradingDayKey,
    liveTodayPnl,
    currentBalance,
    startBalance,
    balanceDelta,
    liveExposureUnits,
    livePositions,
    liveSnapshot,
    accountOrders,
    accountFills,
    showCalculator = true,
}) {
    const [riskDraft, setRiskDraft] = useState(() => ({
        dailyTarget: 250,
        instrument: "MNQ",
        side: "long",
        entry: "",
        stop: "",
        target: "",
        qty: 1,
    }));

    const providerLabel = formatProviderLabel(provider);
    const isReplay =
        cleanString(liveSnapshot?.accountId).toLowerCase() === "replay" ||
        cleanString(liveSnapshot?.accountName).toLowerCase() === "replay" ||
        cleanString(liveSnapshot?.tradingAccountId).toLowerCase() === "replay" ||
        cleanString(liveSnapshot?.sourceName).toLowerCase() === "replay";

    const modeLabel = isReplay ? "Replay" : "Desktop";

    const providerStatus = cleanString(
        liveSnapshot?.dataProviderStatus ||
        liveSnapshot?.connectionStatus ||
        resolvedAccount?.dataProviderStatus
    );

    const providerStatusLabel = providerStatus
        ? providerStatus === "connected"
            ? "Verbunden"
            : providerStatus === "ready"
                ? "Bereit"
                : providerStatus === "online"
                    ? "Online"
                    : providerStatus
        : "Verbunden";

    const symbol = cleanString(
        liveSnapshot?.symbol ||
        liveSnapshot?.instrument ||
        liveSnapshot?.contract ||
        "–"
    );

    const positionQty = toNumber(
        liveSnapshot?.positionQty ??
            liveSnapshot?.qty ??
            liveSnapshot?.quantity,
        0
    );

    const avgPrice = toNumber(
        liveSnapshot?.avgPrice ??
            liveSnapshot?.averagePrice,
        0
    );

    const openOrderCount = Array.isArray(accountOrders) ? accountOrders.length : 0;
    const fillCount = Array.isArray(accountFills) ? accountFills.length : 0;

    const calculator = useMemo(() => {
        const instrument = getInstrumentConfig(riskDraft.instrument);
        const side = riskDraft.side === "short" ? "short" : "long";
        const entry = toNumber(riskDraft.entry, 0);
        const stop = toNumber(riskDraft.stop, 0);
        const target = toNumber(riskDraft.target, 0);
        const qty = toSafeInteger(riskDraft.qty, 1);
        const dailyTarget = Math.max(toNumber(riskDraft.dailyTarget, 0), 0);

        const hasEntry = entry > 0;
        const hasStop = stop > 0;
        const hasTarget = target > 0;

        const stopDistancePoints =
            hasEntry && hasStop ? Math.abs(entry - stop) : 0;
        const targetDistancePoints =
            hasEntry && hasTarget ? Math.abs(target - entry) : 0;

        const stopTicks =
            stopDistancePoints > 0 ? stopDistancePoints / instrument.tickSize : 0;
        const targetTicks =
            targetDistancePoints > 0 ? targetDistancePoints / instrument.tickSize : 0;

        const riskPerContract = stopTicks * instrument.tickValue;
        const rewardPerContract = targetTicks * instrument.tickValue;
        const totalRisk = riskPerContract * qty;
        const totalReward = rewardPerContract * qty;
        const rrRatio = totalRisk > 0 ? totalReward / totalRisk : null;

        const hasDirectionError =
            (side === "long" && ((hasStop && stop >= entry) || (hasTarget && target <= entry))) ||
            (side === "short" && ((hasStop && stop <= entry) || (hasTarget && target >= entry)));

        const hasInputError =
            !hasEntry ||
            !hasStop ||
            !hasTarget ||
            stopDistancePoints <= 0 ||
            targetDistancePoints <= 0;

        let status = "green";
        let message = "Trade Daten sind rechnerisch sauber.";

        if (hasInputError || hasDirectionError) {
            status = "red";
            message = "Entry, Stop, Target oder Richtung passen noch nicht.";
        } else if ((rrRatio || 0) < 1) {
            status = "yellow";
            message = "CRV ist kleiner als 1R.";
        }

        const projectedBalanceAfterStop =
            currentBalance !== null && currentBalance !== undefined
                ? currentBalance - totalRisk
                : null;

        const projectedBalanceAfterTarget =
            currentBalance !== null && currentBalance !== undefined
                ? currentBalance + totalReward
                : null;

        const targetGap = Math.max(dailyTarget - Math.max(liveTodayPnl, 0), 0);

        return {
            instrument,
            qty,
            stopDistancePoints,
            targetDistancePoints,
            stopTicks,
            targetTicks,
            riskPerContract,
            rewardPerContract,
            totalRisk,
            totalReward,
            rrRatio,
            projectedBalanceAfterStop,
            projectedBalanceAfterTarget,
            targetGap,
            status,
            message,
        };
    }, [riskDraft, currentBalance, liveTodayPnl]);

    const calculatorUi = getStatusUi(calculator.status);

    function handleRiskDraftChange(key, value) {
        setRiskDraft((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

    function handleResetRiskDraft() {
        setRiskDraft({
            dailyTarget: 250,
            instrument: "MNQ",
            side: "long",
            entry: "",
            stop: "",
            target: "",
            qty: 1,
        });
    }

    return (
        <div
            style={{
                display: "grid",
                gap: 14,
            }}
        >
            <div
                style={{
                    background: COLORS.panelBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 18,
                    padding: 16,
                    boxShadow: COLORS.shadow,
                    display: "grid",
                    gap: 12,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                    }}
                >
                    <div>
                        <div
                            style={{
                                color: COLORS.title,
                                fontSize: 15,
                                fontWeight: 800,
                            }}
                        >
                            ATAS Snapshot
                        </div>
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 12,
                                marginTop: 3,
                            }}
                        >
                            Direkte Anzeige aus dem ATAS Live Snapshot.
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${COLORS.borderStrong}`,
                                borderRadius: 999,
                                padding: "7px 12px",
                                color: COLORS.cyan,
                                background: "rgba(34,211,238,0.08)",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {providerLabel}
                        </div>

                        <div
                            style={{
                                border: `1px solid ${COLORS.borderStrong}`,
                                borderRadius: 999,
                                padding: "7px 12px",
                                color: COLORS.purple,
                                background: "rgba(167,139,250,0.08)",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {modeLabel}
                        </div>

                        <div
                            style={{
                                border: "1px solid rgba(34, 197, 94, 0.24)",
                                borderRadius: 999,
                                padding: "7px 12px",
                                color: COLORS.green,
                                background: "rgba(34, 197, 94, 0.08)",
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {providerStatusLabel}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 10,
                    }}
                >
                    <InfoCard
                        label="Provider"
                        value={providerLabel}
                        hint={modeLabel}
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="Status"
                        value={providerStatusLabel}
                        hint="ATAS Verbindung"
                        color={COLORS.green}
                    />
                    <InfoCard
                        label="Trading Ref"
                        value={
                            scopeAccountId ||
                            resolvedAccount?.tradingAccountId ||
                            resolvedAccountId ||
                            "Replay"
                        }
                        hint="ATAS Account"
                        color={COLORS.text}
                    />
                    <InfoCard
                        label="Symbol"
                        value={symbol}
                        hint="ATAS Kontrakt"
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="Position Qty"
                        value={formatDecimal(positionQty, 0)}
                        hint={positionQty === 0 ? "Keine offene Position" : "Offene Kontrakte"}
                        color={positionQty === 0 ? COLORS.text : COLORS.orange}
                    />
                    <InfoCard
                        label="Avg Price"
                        value={formatDecimal(avgPrice, 2)}
                        hint="Durchschnittlicher Entry"
                        color={COLORS.text}
                    />
                    <InfoCard
                        label="Kontogrösse"
                        value="–"
                        hint="ATAS liefert keine Apex Kontogrösse"
                        color={COLORS.purple}
                    />
                    <InfoCard
                        label="Start Balance"
                        value={formatCurrency(startBalance)}
                        hint="ATAS Startwert"
                        color={COLORS.yellow}
                    />
                    <InfoCard
                        label="Live Balance"
                        value={formatCurrency(currentBalance)}
                        hint="ATAS Live Wert"
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="Delta"
                        value={balanceDelta === null ? "–" : formatSignedCurrency(balanceDelta)}
                        hint="Aktuell minus Start"
                        color={balanceDelta !== null && balanceDelta < 0 ? COLORS.red : COLORS.green}
                    />
                    <InfoCard
                        label="Tages PnL"
                        value={formatSignedCurrency(liveTodayPnl)}
                        hint={`Trading Day ${formatTradingDayLabel(activeTradingDayKey)}`}
                        color={liveTodayPnl < 0 ? COLORS.red : COLORS.green}
                    />
                    <InfoCard
                        label="Exposure"
                        value={formatExposureUnits(liveExposureUnits)}
                        hint="Aktuelle offene Exposure"
                        color={COLORS.green}
                    />
                    <InfoCard
                        label="Orders / Fills"
                        value={`${openOrderCount} / ${fillCount}`}
                        hint="ATAS Snapshot Daten"
                        color={COLORS.gold}
                    />
                </div>
            </div>

            {showCalculator ? (
                <div
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${calculatorUi.border}`,
                        borderRadius: 18,
                        padding: 16,
                        boxShadow: COLORS.shadow,
                        display: "grid",
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 15,
                                    fontWeight: 800,
                                }}
                            >
                                Riskrechner
                            </div>
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 12,
                                    marginTop: 3,
                                }}
                            >
                                ATAS neutraler Trade Rechner ohne Apex Regeln.
                            </div>
                        </div>

                        <div
                            style={{
                                border: `1px solid ${calculatorUi.border}`,
                                borderRadius: 999,
                                padding: "7px 12px",
                                color: calculatorUi.text,
                                background: calculatorUi.background,
                                fontSize: 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {calculator.status === "green"
                                ? "Grün"
                                : calculator.status === "yellow"
                                    ? "Gelb"
                                    : "Rot"}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InputField label="Tagesziel">
                            <input
                                type="number"
                                step="1"
                                value={riskDraft.dailyTarget}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "dailyTarget",
                                        toNumber(event.target.value, 0)
                                    )
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Instrument">
                            <select
                                value={riskDraft.instrument}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "instrument",
                                        cleanString(event.target.value).toUpperCase()
                                    )
                                }
                                style={inputStyle}
                            >
                                <option value="MNQ">MNQ</option>
                                <option value="NQ">NQ</option>
                                <option value="MES">MES</option>
                                <option value="ES">ES</option>
                            </select>
                        </InputField>

                        <InputField label="Seite">
                            <select
                                value={riskDraft.side}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "side",
                                        event.target.value === "short" ? "short" : "long"
                                    )
                                }
                                style={inputStyle}
                            >
                                <option value="long">long</option>
                                <option value="short">short</option>
                            </select>
                        </InputField>

                        <InputField label="Entry">
                            <input
                                type="number"
                                step="0.25"
                                value={riskDraft.entry}
                                onChange={(event) =>
                                    handleRiskDraftChange("entry", event.target.value)
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Stop">
                            <input
                                type="number"
                                step="0.25"
                                value={riskDraft.stop}
                                onChange={(event) =>
                                    handleRiskDraftChange("stop", event.target.value)
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Target">
                            <input
                                type="number"
                                step="0.25"
                                value={riskDraft.target}
                                onChange={(event) =>
                                    handleRiskDraftChange("target", event.target.value)
                                }
                                style={inputStyle}
                            />
                        </InputField>

                        <InputField label="Kontrakte">
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={riskDraft.qty}
                                onChange={(event) =>
                                    handleRiskDraftChange(
                                        "qty",
                                        toSafeInteger(event.target.value, 1)
                                    )
                                }
                                style={inputStyle}
                            />
                        </InputField>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                        }}
                    >
                        <button
                            type="button"
                            onClick={handleResetRiskDraft}
                            style={buttonStyle}
                        >
                            Rechner zurücksetzen
                        </button>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${calculatorUi.border}`,
                            borderRadius: 13,
                            padding: 12,
                            background: calculatorUi.background,
                            color: calculatorUi.text,
                            fontSize: 14,
                            lineHeight: 1.45,
                            fontWeight: 700,
                        }}
                    >
                        {calculator.message}
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCard
                            label="Risiko pro Kontrakt"
                            value={formatCurrency(calculator.riskPerContract)}
                            hint={`${formatDecimal(calculator.stopTicks, 0)} Ticks`}
                            color={COLORS.red}
                        />
                        <InfoCard
                            label="Chance pro Kontrakt"
                            value={formatCurrency(calculator.rewardPerContract)}
                            hint={`${formatDecimal(calculator.targetTicks, 0)} Ticks`}
                            color={COLORS.green}
                        />
                        <InfoCard
                            label="Gesamtrisiko"
                            value={formatCurrency(calculator.totalRisk)}
                            hint={`${calculator.qty} neue Kontrakte`}
                            color={COLORS.orange}
                        />
                        <InfoCard
                            label="Gesamtziel"
                            value={formatCurrency(calculator.totalReward)}
                            hint={`${calculator.qty} neue Kontrakte`}
                            color={COLORS.green}
                        />
                        <InfoCard
                            label="CRV"
                            value={formatRatio(calculator.rrRatio)}
                            hint={calculator.instrument.label}
                            color={COLORS.purple}
                        />
                        <InfoCard
                            label="Balance nach Stop"
                            value={formatCurrency(calculator.projectedBalanceAfterStop)}
                            hint={`Tagesziel offen ${formatCurrency(calculator.targetGap)}`}
                            color={COLORS.red}
                        />
                        <InfoCard
                            label="Balance nach Ziel"
                            value={formatCurrency(calculator.projectedBalanceAfterTarget)}
                            hint={`Tagesziel offen ${formatCurrency(calculator.targetGap)}`}
                            color={COLORS.green}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const inputStyle = {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 11,
    border: `1px solid ${COLORS.borderStrong}`,
    background: "rgba(0,0,0,0.22)",
    color: COLORS.text,
    outline: "none",
};

const buttonStyle = {
    border: `1px solid ${COLORS.cyan}`,
    color: COLORS.cyan,
    background: "transparent",
    borderRadius: 11,
    padding: "10px 13px",
    fontWeight: 800,
    cursor: "pointer",
};

export default function RiskPanel(props) {
    const resolvedAccount =
        props?.account || props?.activeAccount || props?.selectedAccount || null;

    const resolvedAccountId =
        cleanString(props?.resolvedAccountId) ||
        cleanString(props?.accountId) ||
        cleanString(props?.activeAccountId) ||
        cleanString(props?.selectedAccountId) ||
        cleanString(resolvedAccount?.id);

    const liveSnapshot = resolvedAccountId
        ? getLiveAccountSnapshot(resolvedAccountId)
        : null;

    const provider = resolvePanelProvider(props, resolvedAccount, liveSnapshot);

    const scopeAccountId = resolveScopeAccountId(resolvedAccount, resolvedAccountId);
    const hasActiveAccount = hasActiveAccountContext(resolvedAccount, resolvedAccountId);
    const showCalculator = props?.showCalculator !== false;

    const fillsProp = props?.fills;
    const accountBalanceHistoryProp = props?.accountBalanceHistory;
    const ordersProp = props?.orders;
    const effectiveImportsProp = props?.effectiveImports ?? null;
    const importsProp = props?.imports ?? null;

    const [localImports, setLocalImports] = useState(() => {
        return loadParsedImportsForProvider(resolvedAccountId, provider);
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const loadImports = () => {
            const nextImports = loadParsedImportsForProvider(resolvedAccountId, provider);
            setLocalImports(nextImports);
        };

        const eventNames = getImportEventNames(provider);

        loadImports();

        eventNames.forEach((eventName) => {
            window.addEventListener(eventName, loadImports);
        });

        window.addEventListener("storage", loadImports);
        window.addEventListener("focus", loadImports);

        return () => {
            eventNames.forEach((eventName) => {
                window.removeEventListener(eventName, loadImports);
            });

            window.removeEventListener("storage", loadImports);
            window.removeEventListener("focus", loadImports);
        };
    }, [resolvedAccountId, provider]);

    const resolvedAccountImports = useMemo(() => {
        return resolveImportsForProvider(provider, resolvedAccount?.imports);
    }, [provider, resolvedAccount?.imports]);

    const directImports = useMemo(() => {
        return resolveImportsForProvider(provider, importsProp);
    }, [provider, importsProp]);

    const directEffectiveImports = useMemo(() => {
        return resolveImportsForProvider(provider, effectiveImportsProp);
    }, [provider, effectiveImportsProp]);

    const effectiveImports = useMemo(() => {
        if (hasImportCollectionContent(directEffectiveImports)) {
            return directEffectiveImports;
        }

        return resolveAccountImportsFromSources(
            localImports,
            resolvedAccountImports,
            hasImportCollectionContent(directImports) ? directImports : importsProp
        );
    }, [
        localImports,
        resolvedAccountImports,
        directImports,
        directEffectiveImports,
        importsProp,
    ]);

    const importedFillsData = useMemo(() => {
        return callImportBuilder(
            "buildFillsData",
            effectiveImports,
            scopeAccountId || resolvedAccountId,
            provider
        );
    }, [effectiveImports, scopeAccountId, resolvedAccountId, provider]);

    const importedOrdersData = useMemo(() => {
        return callImportBuilder(
            "buildOrdersData",
            effectiveImports,
            scopeAccountId || resolvedAccountId,
            provider
        );
    }, [effectiveImports, scopeAccountId, resolvedAccountId, provider]);

    const importedCashHistoryData = useMemo(() => {
        return callImportBuilder(
            "buildCashHistoryData",
            effectiveImports,
            scopeAccountId || resolvedAccountId,
            provider
        );
    }, [effectiveImports, scopeAccountId, resolvedAccountId, provider]);

    const rawFills = useMemo(() => {
        if (Array.isArray(fillsProp) && fillsProp.length > 0) {
            return fillsProp;
        }

        return Array.isArray(importedFillsData?.entries)
            ? importedFillsData.entries
            : [];
    }, [fillsProp, importedFillsData]);

    const rawOrders = useMemo(() => {
        if (Array.isArray(ordersProp) && ordersProp.length > 0) {
            return ordersProp;
        }

        return Array.isArray(importedOrdersData?.entries)
            ? importedOrdersData.entries
            : [];
    }, [ordersProp, importedOrdersData]);

    const rawAccountBalanceHistory = useMemo(() => {
        if (Array.isArray(accountBalanceHistoryProp) && accountBalanceHistoryProp.length > 0) {
            return accountBalanceHistoryProp;
        }

        return Array.isArray(importedCashHistoryData?.entries)
            ? importedCashHistoryData.entries
            : [];
    }, [accountBalanceHistoryProp, importedCashHistoryData]);

    const accountFills = useMemo(() => {
        return scopeRowsByAccount(rawFills, scopeAccountId);
    }, [rawFills, scopeAccountId]);

    const accountOrders = useMemo(() => {
        return scopeRowsByAccount(rawOrders, scopeAccountId);
    }, [rawOrders, scopeAccountId]);

    const positionAnalytics = useMemo(() => {
        return buildFillAnalytics({
            fills: accountFills,
            accountId: resolvedAccountId,
        });
    }, [accountFills, resolvedAccountId]);

    const livePositions = useMemo(() => {
        return Array.isArray(positionAnalytics?.positions)
            ? positionAnalytics.positions
            : [];
    }, [positionAnalytics]);

    const liveExposureUnits = useMemo(() => {
        return livePositions.reduce((sum, position) => {
            return (
                sum +
                Math.abs(toNumber(position?.quantity, 0)) * getPositionApexUnit(position)
            );
        }, 0);
    }, [livePositions]);

    const accountBalanceRows = useMemo(() => {
        const filtered = scopeRowsByAccount(rawAccountBalanceHistory, scopeAccountId);
        const effectiveRows =
            filtered.length > 0 ? filtered : rawAccountBalanceHistory;

        return [...effectiveRows].sort((a, b) => {
            const aTime = (getBalanceTimestamp(a) || new Date(0)).getTime();
            const bTime = (getBalanceTimestamp(b) || new Date(0)).getTime();
            return aTime - bTime;
        });
    }, [rawAccountBalanceHistory, scopeAccountId]);

    const balanceSummary = useMemo(() => {
        return buildBalanceSummary(accountBalanceRows);
    }, [accountBalanceRows]);

    const latestFillTradingDayKey = useMemo(() => {
        return getLatestTradingDayKey(accountFills, getFillTimestamp);
    }, [accountFills]);

    const activeTradingDayKey = useMemo(() => {
        return (
            cleanString(latestFillTradingDayKey) ||
            cleanString(balanceSummary.latestTradingDayKey) ||
            getTradingDayKey(new Date())
        );
    }, [latestFillTradingDayKey, balanceSummary.latestTradingDayKey]);

    const liveTodayTrades = useMemo(() => {
        return getUniqueTradesForDay(accountFills, activeTradingDayKey);
    }, [accountFills, activeTradingDayKey]);

    const fillsDerivedTodayPnl = useMemo(() => {
        return sumNumbers(
            liveTodayTrades.map((row) => {
                return getFillPnl(row) || 0;
            })
        );
    }, [liveTodayTrades]);

    const balanceRowsForActiveTradingDay = useMemo(() => {
        return getRowsForTradingDay(accountBalanceRows, activeTradingDayKey, getBalanceTimestamp);
    }, [accountBalanceRows, activeTradingDayKey]);

    const balanceDerivedTodayPnl = useMemo(() => {
        if (!balanceRowsForActiveTradingDay.length) {
            return null;
        }

        const values = balanceRowsForActiveTradingDay
            .map((row) => getBalanceDayPnlValue(row))
            .filter((value) => value !== null && value !== undefined);

        if (!values.length) {
            return null;
        }

        const hasDeltaRows = balanceRowsForActiveTradingDay.some((row) => {
            const flexible = buildFlexibleSource(row);

            return cleanString(
                pickFlexibleValue(flexible, [
                    "delta",
                    "cashChange",
                    "netChange",
                    "change",
                    "Delta",
                    "Cash Change",
                    "Net Change",
                ])
            );
        });

        if (hasDeltaRows) {
            return sumNumbers(values);
        }

        return values[values.length - 1];
    }, [balanceRowsForActiveTradingDay]);

    const fillCommissionForActiveTradingDay = useMemo(() => {
        return sumNumbers(
            liveTodayTrades.map((row) => getFillCommission(row) || 0)
        );
    }, [liveTodayTrades]);

    const accountCurrentBalance = parseFlexibleNumber(resolvedAccount?.currentBalance);
    const accountStartingBalance = parseFlexibleNumber(resolvedAccount?.startingBalance);
    const accountDeclaredSize = parseFlexibleNumber(resolvedAccount?.accountSize);

    const baseDetectedAccountSize = useMemo(() => {
        return deriveAccountSize({
            accountId: scopeAccountId || resolvedAccountId,
            account: resolvedAccount,
            startBalance:
                accountStartingBalance !== null && accountStartingBalance > 0
                    ? accountStartingBalance
                    : accountDeclaredSize,
            currentBalance:
                balanceSummary.currentBalance !== null && balanceSummary.currentBalance !== undefined
                    ? balanceSummary.currentBalance
                    : accountCurrentBalance !== null && accountCurrentBalance !== undefined
                        ? accountCurrentBalance
                        : accountDeclaredSize,
            fallbackSize: resolvedAccount?.accountSize,
        });
    }, [
        scopeAccountId,
        resolvedAccountId,
        resolvedAccount,
        accountStartingBalance,
        accountDeclaredSize,
        balanceSummary.currentBalance,
        accountCurrentBalance,
    ]);

    const atasCurrentBalance = provider === "atas"
        ? toNumber(
            liveSnapshot?.currentBalance ??
                liveSnapshot?.balance ??
                liveSnapshot?.cash ??
                liveSnapshot?.accountBalance ??
                liveSnapshot?.cashBalance ??
                liveSnapshot?.netLiq,
            0
        )
        : 0;

    const atasStartBalance = provider === "atas"
        ? toNumber(
            liveSnapshot?.atasStartingBalance ??
                liveSnapshot?.atasStartBalance ??
                liveSnapshot?.providerStartingBalance ??
                liveSnapshot?.providerStartBalance ??
                liveSnapshot?.snapshotStartingBalance ??
                liveSnapshot?.snapshotStartBalance ??
                liveSnapshot?.startingBalance ??
                liveSnapshot?.startBalance,
            0
        )
        : 0;

    const currentBalance =
        provider === "atas"
            ? atasCurrentBalance
            : balanceSummary.currentBalance !== null && balanceSummary.currentBalance !== undefined
                ? balanceSummary.currentBalance
                : accountCurrentBalance !== null && accountCurrentBalance !== undefined
                    ? accountCurrentBalance
                    : accountStartingBalance !== null && accountStartingBalance !== undefined
                        ? accountStartingBalance
                        : accountDeclaredSize !== null && accountDeclaredSize !== undefined
                            ? accountDeclaredSize
                            : baseDetectedAccountSize;

    const startBalance =
        provider === "atas"
            ? atasStartBalance
            : accountStartingBalance !== null && accountStartingBalance > 0
                ? accountStartingBalance
                : baseDetectedAccountSize > 0
                    ? baseDetectedAccountSize
                    : balanceSummary.startBalance !== null && balanceSummary.startBalance !== undefined
                        ? balanceSummary.startBalance
                        : accountDeclaredSize !== null && accountDeclaredSize !== undefined
                            ? accountDeclaredSize
                            : currentBalance;

    const detectedAccountSize = provider === "atas"
        ? 0
        : deriveAccountSize({
            accountId: scopeAccountId || resolvedAccountId,
            account: resolvedAccount,
            startBalance,
            currentBalance,
            fallbackSize: baseDetectedAccountSize || resolvedAccount?.accountSize,
        });

    const liveTodayPnl =
        balanceDerivedTodayPnl !== null && balanceDerivedTodayPnl !== undefined
            ? balanceDerivedTodayPnl
            : fillsDerivedTodayPnl !== 0
                ? fillsDerivedTodayPnl
                : fillCommissionForActiveTradingDay > 0
                    ? -fillCommissionForActiveTradingDay
                    : 0;

    const balanceDelta =
        currentBalance !== null &&
            currentBalance !== undefined &&
            startBalance !== null &&
            startBalance !== undefined
            ? currentBalance - startBalance
            : null;

    if (!hasActiveAccount) {
        return <NeutralRiskPanel />;
    }

    if (provider === "atas") {
        return (
            <AtasRiskPanelContent
                provider={provider}
                resolvedAccount={resolvedAccount}
                resolvedAccountId={resolvedAccountId}
                scopeAccountId={scopeAccountId}
                activeTradingDayKey={activeTradingDayKey}
                liveTodayPnl={liveTodayPnl}
                currentBalance={currentBalance}
                startBalance={startBalance}
                balanceDelta={balanceDelta}
                liveExposureUnits={liveExposureUnits}
                livePositions={livePositions}
                liveSnapshot={liveSnapshot}
                accountOrders={accountOrders}
                accountFills={accountFills}
                showCalculator={showCalculator}
            />
        );
    }

    return (
        <RiskPanelContent
            key={`risk-panel-${provider}-${resolvedAccountId || "unknown"}-${detectedAccountSize || 0}`}
            provider={provider}
            resolvedAccount={resolvedAccount}
            resolvedAccountId={resolvedAccountId}
            scopeAccountId={scopeAccountId}
            accountBalanceRows={accountBalanceRows}
            accountFills={accountFills}
            accountOrders={accountOrders}
            activeTradingDayKey={activeTradingDayKey}
            liveTodayPnl={liveTodayPnl}
            currentBalance={currentBalance}
            startBalance={startBalance}
            detectedAccountSize={detectedAccountSize}
            balanceDelta={balanceDelta}
            liveExposureUnits={liveExposureUnits}
            livePositions={livePositions}
            showCalculator={showCalculator}
        />
    );
}