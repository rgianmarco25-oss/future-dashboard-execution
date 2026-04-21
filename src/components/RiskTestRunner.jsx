import { useEffect, useMemo, useRef, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";
import { buildApexRiskSnapshot } from "../utils/apexRiskSnapshot";
import { saveRiskStatusForAccount } from "../utils/accountRiskStatus";
import {
    detectAccountSize,
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
        "netPnl",
        "Realized PnL",
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

function getUniqueTradesForToday(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const todayTradingDayKey = getTradingDayKey(new Date());
    const seen = new Set();
    const result = [];

    for (const row of safeRows) {
        const timestamp = getFillTimestamp(row);

        if (!timestamp) {
            continue;
        }

        if (getTradingDayKey(timestamp) !== todayTradingDayKey) {
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
                "date",
                "createdAt",
                "updatedAt",
                "businessDate",
            ]) || firstString(row, [
                "timestamp",
                "time",
                "dateTime",
                "datetime",
                "tradeDate",
                "transactionDate",
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
        "balance",
        "accountBalance",
        "netLiq",
        "cashBalance",
        "totalAmount",
        "endOfDayBalance",
        "Net Liq",
        "Cash Balance",
        "Total Amount",
        "Balance",
        "Account Balance",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
}

function getStartingBalanceValue(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const flexible = buildFlexibleSource(row);

    const value = pickFlexibleValue(flexible, [
        "startingBalance",
        "startBalance",
        "beginningBalance",
        "openingBalance",
        "balance",
        "accountBalance",
        "netLiq",
        "cashBalance",
        "totalAmount",
        "Balance",
        "Account Balance",
        "Net Liq",
        "Cash Balance",
        "Total Amount",
    ]);

    const parsed = parseFlexibleNumber(value);
    return parsed !== null ? parsed : null;
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
        startBalance !== null && startBalance !== undefined
            ? startBalance
            : currentBalance;

    return normalizeAccountSize(reference, 0);
}

function sumNumbers(values) {
    const safeValues = Array.isArray(values) ? values : [];
    return safeValues.reduce((sum, value) => sum + toNumber(value, 0), 0);
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

function getDisplayAccountName(resolvedAccount, scopeAccountId, resolvedAccountId) {
    return (
        resolvedAccount?.tradingAccountName ||
        resolvedAccount?.displayName ||
        resolvedAccount?.name ||
        scopeAccountId ||
        resolvedAccountId ||
        "Unbekannt"
    );
}

function getBrokerLabel() {
    return "Tradovate";
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
        detail: "Threshold, DLL, Exposure, Payout und Inactivity sind im grünen Bereich oder nicht aktiv.",
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
    resolvedAccount,
    resolvedAccountId,
    scopeAccountId,
    accountBalanceRows,
    accountFills,
    accountOrders,
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
    const displayAccountName = getDisplayAccountName(
        resolvedAccount,
        scopeAccountId,
        resolvedAccountId
    );
    const brokerLabel = getBrokerLabel();

    const openPositionCount = useMemo(() => {
        return livePositions.filter((position) => Math.abs(toNumber(position?.quantity, 0)) > 0).length;
    }, [livePositions]);

    const openOrderCount = useMemo(() => {
        return countOpenOrders(accountOrders);
    }, [accountOrders]);

    const riskSnapshot = useMemo(() => {
        return buildApexRiskSnapshot({
            account: resolvedAccount,
            mode: riskDraft.mode,
            accountSize: riskDraft.accountSize,
            balanceHistoryRows: accountBalanceRows,
            currentBalance,
            currentContracts: liveExposureUnits,
            fills: accountFills,
        });
    }, [
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
        return buildTopAlert({
            accountName: displayAccountName,
            thresholdRuleStatus,
            dllRuleStatus,
            exposureRuleStatus,
            payoutRuleStatus,
            inactivityRuleStatus,
        });
    }, [
        displayAccountName,
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
        const tradingDayKey = getTradingDayKey(new Date());
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
        };
    }, [
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
            flags: {
                threshold: thresholdRuleStatus.status !== "green",
                dll: dllRuleStatus.status !== "green",
                exposure: exposureRuleStatus.status !== "green",
                payout: payoutRuleStatus.status !== "green",
                inactivity: inactivityRuleStatus.status !== "green",
            },
            meta: {
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
            },
        });

        persistenceRef.current = signature;
    }, [
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
    }, [resolvedAccountId]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(RISK_ALERT_EVENT_NAME, {
                detail: {
                    accountId: resolvedAccountId || "",
                    accountName: displayAccountName,
                    alert: topAlert,
                    emittedAt: Date.now(),
                },
            })
        );
    }, [
        resolvedAccountId,
        displayAccountName,
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
                        gap: 6,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
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
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                            }}
                        >
                            <div
                                style={{
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    color: COLORS.cyan,
                                    background: "rgba(34, 211, 238, 0.08)",
                                    fontSize: 8,
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {brokerLabel}
                            </div>

                            <div
                                style={{
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    color: COLORS.textSoft,
                                    background: "rgba(255,255,255,0.04)",
                                    fontSize: 8,
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Größe {formatAccountSizeValue(detectedAccountSize)}
                            </div>
                        </div>
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
                        {displayAccountName}
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 5,
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
                            Account {scopeAccountId || "–"}
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
                    </div>

                    <div
                        style={{
                            color: compactStatusUi.text,
                            fontSize: 9,
                            fontWeight: 700,
                            lineHeight: 1.3,
                        }}
                    >
                        {topAlert.message}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 6,
                    }}
                >
                    <CompactMetricCard
                        label="Balance"
                        value={formatCurrency(currentBalance)}
                        hint="Aktueller Wert"
                        color={COLORS.cyan}
                        borderColor="rgba(34, 211, 238, 0.20)"
                        background="rgba(34, 211, 238, 0.04)"
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
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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
                    label="Broker"
                    value={brokerLabel}
                    hint={displayAccountName}
                    color={COLORS.cyan}
                    borderColor="rgba(34, 211, 238, 0.20)"
                    background="rgba(34, 211, 238, 0.04)"
                />

                <InfoCard
                    label="Account ID"
                    value={scopeAccountId || "–"}
                    hint="Sichtbare Trading Referenz"
                    color={COLORS.text}
                />

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
                    hint={
                        accountBalanceRows.length
                            ? `Erster Eintrag ${formatDateTime(
                                getBalanceTimestamp(accountBalanceRows[0])
                            )}`
                            : "Startwert aus Account"
                    }
                    color={COLORS.yellow}
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

    const scopeAccountId = resolveScopeAccountId(resolvedAccount, resolvedAccountId);
    const hasActiveAccount = hasActiveAccountContext(resolvedAccount, resolvedAccountId);
    const showCalculator = props?.showCalculator !== false;

    const fillsProp = props?.fills;
    const accountBalanceHistoryProp = props?.accountBalanceHistory;
    const ordersProp = props?.orders;

    const rawFills = useMemo(() => {
        return Array.isArray(fillsProp) ? fillsProp : [];
    }, [fillsProp]);

    const rawOrders = useMemo(() => {
        return Array.isArray(ordersProp) ? ordersProp : [];
    }, [ordersProp]);

    const rawAccountBalanceHistory = useMemo(() => {
        return Array.isArray(accountBalanceHistoryProp)
            ? accountBalanceHistoryProp
            : [];
    }, [accountBalanceHistoryProp]);

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

    const liveTodayTrades = useMemo(() => {
        return getUniqueTradesForToday(accountFills);
    }, [accountFills]);

    const liveTodayPnl = useMemo(() => {
        return sumNumbers(
            liveTodayTrades.map((row) => {
                return getFillPnl(row) || 0;
            })
        );
    }, [liveTodayTrades]);

    const historyCurrentBalance =
        accountBalanceRows.length > 0
            ? getBalanceValue(accountBalanceRows[accountBalanceRows.length - 1])
            : null;

    const historyStartBalance =
        accountBalanceRows.length > 0
            ? getStartingBalanceValue(accountBalanceRows[0])
            : null;

    const accountCurrentBalance = parseFlexibleNumber(resolvedAccount?.currentBalance);
    const accountStartingBalance = parseFlexibleNumber(resolvedAccount?.startingBalance);
    const accountDeclaredSize = parseFlexibleNumber(resolvedAccount?.accountSize);

    const currentBalance =
        historyCurrentBalance !== null && historyCurrentBalance !== undefined
            ? historyCurrentBalance
            : accountCurrentBalance !== null && accountCurrentBalance !== undefined
                ? accountCurrentBalance
                : accountStartingBalance !== null && accountStartingBalance !== undefined
                    ? accountStartingBalance
                    : accountDeclaredSize;

    const startBalance =
        historyStartBalance !== null && historyStartBalance !== undefined
            ? historyStartBalance
            : accountStartingBalance !== null && accountStartingBalance !== undefined
                ? accountStartingBalance
                : accountDeclaredSize;

    const detectedAccountSize = deriveAccountSize({
        accountId: scopeAccountId || resolvedAccountId,
        account: resolvedAccount,
        startBalance,
        currentBalance,
        fallbackSize: resolvedAccount?.accountSize,
    });

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

    return (
        <RiskPanelContent
            key={`risk-panel-${resolvedAccountId || "unknown"}-${detectedAccountSize || 0}`}
            resolvedAccount={resolvedAccount}
            resolvedAccountId={resolvedAccountId}
            scopeAccountId={scopeAccountId}
            accountBalanceRows={accountBalanceRows}
            accountFills={accountFills}
            accountOrders={accountOrders}
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