import { useMemo, useState } from "react";
import { buildFillAnalytics } from "../utils/fillAnalytics";
import { formatDateTime } from "../utils/dateFormat";
import { buildApexRiskSnapshot } from "../utils/apexRiskSnapshot";
import { buildRiskLimitState, getRiskStatusColors } from "../utils/riskLimitState";
import { detectAccountSize } from "../utils/storage";
import RiskTestRunner from "../components/RiskTestRunner";

const SHOW_INTERNAL_TEST_UI = import.meta.env.DEV;

const COLORS = {
    panelBg: "rgba(255, 255, 255, 0.04)",
    panelBgStrong: "rgba(255, 255, 255, 0.06)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
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

const DEFAULT_SIMULATION_DRAFT = {
    instrument: "MNQ",
    side: "long",
    qty: 1,
    pnl: 0,
};

const EMPTY_SIMULATION = {
    trades: [],
    updatedAt: null,
};

const INSTRUMENT_CONFIG = {
    MNQ: {
        label: "MNQ",
        tickSize: 0.25,
        tickValue: 0.5,
        pointValue: 2,
    },
    NQ: {
        label: "NQ",
        tickSize: 0.25,
        tickValue: 5,
        pointValue: 20,
    },
    MES: {
        label: "MES",
        tickSize: 0.25,
        tickValue: 1.25,
        pointValue: 5,
    },
    ES: {
        label: "ES",
        tickSize: 0.25,
        tickValue: 12.5,
        pointValue: 50,
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
    "account",
    "accountId",
    "account_id",
    "Account",
    "Account ID",
    "accountName",
    "account_name",
];

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function toNumber(value, fallback = 0) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    const safeValue = cleanString(value).replace(",", ".");
    const parsed = Number(safeValue);
    return Number.isFinite(parsed) ? parsed : fallback;
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

function formatDecimal(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return Number(value).toLocaleString("de-CH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatPoints(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, 2)} P`;
}

function formatTicks(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, 0)} Ticks`;
}

function formatRatio(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, 2)}R`;
}

function formatPercent(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return `${formatDecimal(value, digits)}%`;
}

function normalizeString(value) {
    return cleanString(value).toLowerCase();
}

function normalizeDigits(value) {
    return cleanString(value).replace(/\D/g, "");
}

function getSimulationStorageKey(accountId) {
    const normalized = normalizeString(accountId) || "__unknown_account__";
    return `trade-simulation:${normalized}`;
}

function toSafeInteger(value, fallback = 1) {
    const parsed = Math.round(toNumber(value, fallback));

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTradeSimulationForAccount(accountId) {
    if (typeof window === "undefined") {
        return EMPTY_SIMULATION;
    }

    try {
        const raw = window.localStorage.getItem(getSimulationStorageKey(accountId));

        if (!raw) {
            return EMPTY_SIMULATION;
        }

        const parsed = JSON.parse(raw);

        return {
            trades: Array.isArray(parsed?.trades)
                ? parsed.trades.filter(Boolean).map((trade) => ({
                    id: cleanString(trade?.id) || createId(),
                    accountId: cleanString(trade?.accountId),
                    instrument: cleanString(trade?.instrument) || "MNQ",
                    side: cleanString(trade?.side) === "short" ? "short" : "long",
                    qty: toSafeInteger(trade?.qty, 1),
                    pnl: toNumber(trade?.pnl, 0),
                    createdAt: cleanString(trade?.createdAt) || new Date().toISOString(),
                }))
                : [],
            updatedAt: cleanString(parsed?.updatedAt) || null,
        };
    } catch {
        return EMPTY_SIMULATION;
    }
}

function persistTradeSimulationForAccount(accountId, simulation) {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(
        getSimulationStorageKey(accountId),
        JSON.stringify(simulation)
    );
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
    return (
        toDateOrNull(
            firstString(row, [
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
        const parsed = toNumber(value, null);
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

    const candidates = [firstString(row, ACCOUNT_MATCH_KEYS)].filter(Boolean);

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
    return Boolean(firstString(row, ACCOUNT_MATCH_KEYS));
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
    return (
        toDateOrNull(
            firstString(row, [
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
    const keys = [
        "totalAmount",
        "currentBalance",
        "balance",
        "Balance",
        "accountBalance",
        "Account Balance",
        "endBalance",
        "endingBalance",
        "equity",
        "netLiq",
        "Net Liq",
        "cashBalance",
        "amount",
    ];

    for (const key of keys) {
        const parsed = toNumber(row?.[key], null);
        if (parsed !== null) {
            return parsed;
        }
    }

    return null;
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

function getRiskStatus(tradeCount) {
    if (tradeCount >= 4) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            badgeText: "STOPP !!!",
            subline: "Auf dem Weg dein Account zu schrotten.",
            message: "Auf dem Weg dein Account zu schrotten.",
        };
    }

    if (tradeCount === 3) {
        return {
            label: "Orange",
            color: COLORS.orange,
            background: "rgba(251, 146, 60, 0.10)",
            border: COLORS.orange,
            badgeText: "WARNUNG !!!",
            subline: "FÜR HEUTE IST SCHLUSS.",
            message:
                "Drei Trades erreicht. Noch ein Klick bringt dich weg von sauberer Ausführung. Für heute ist Schluss.",
        };
    }

    return {
        label: "Grün",
        color: COLORS.green,
        background: "rgba(74, 222, 128, 0.10)",
        border: COLORS.green,
        badgeText: "",
        subline: "",
        message:
            "Im Plan. Null bis zwei Trades. Fokus auf saubere Ausführung und Regelkonformität.",
    };
}

function getInstrumentConfig(value) {
    const key = cleanString(value).toUpperCase();
    return INSTRUMENT_CONFIG[key] || INSTRUMENT_CONFIG.MNQ;
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

function createDefaultRiskDraft(detectedAccountSize, resolvedAccount) {
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

function getCalculatorStatus({
    hasInputError,
    hasDirectionError,
    totalRisk,
    remainingThresholdRoom,
    remainingDllRoom,
    rrRatio,
    isOverAllowedContracts,
    hasLiveContractBreach,
}) {
    if (hasInputError || hasDirectionError) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Stop, Ziel oder Richtung passen noch nicht.",
        };
    }

    if (hasLiveContractBreach) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Live Position liegt bereits über der erlaubten Max Kontraktzahl.",
        };
    }

    if (isOverAllowedContracts) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Kontraktzahl liegt über der erlaubten Safe Size.",
        };
    }

    if (!Number.isFinite(totalRisk) || totalRisk <= 0) {
        return {
            label: "Neutral",
            color: COLORS.textSoft,
            background: "rgba(148, 163, 184, 0.08)",
            border: COLORS.border,
            message: "Trade Daten eingeben, dann rechnet der Block live.",
        };
    }

    if (totalRisk > remainingThresholdRoom) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Trade ist zu gross für den aktiven Threshold.",
        };
    }

    if (remainingDllRoom !== null && remainingDllRoom !== undefined && totalRisk > remainingDllRoom) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Trade ist zu gross für das aktive DLL.",
        };
    }

    const thresholdShare =
        remainingThresholdRoom > 0 ? totalRisk / remainingThresholdRoom : Number.POSITIVE_INFINITY;

    const dllShare =
        remainingDllRoom !== null &&
            remainingDllRoom !== undefined &&
            remainingDllRoom > 0
            ? totalRisk / remainingDllRoom
            : 0;

    if (thresholdShare >= 0.6 || dllShare >= 0.6 || rrRatio < 1) {
        return {
            label: "Orange",
            color: COLORS.orange,
            background: "rgba(251, 146, 60, 0.10)",
            border: COLORS.orange,
            message: "Trade ist eng am Limit oder das CRV ist schwach.",
        };
    }

    return {
        label: "Grün",
        color: COLORS.green,
        background: "rgba(74, 222, 128, 0.10)",
        border: COLORS.green,
        message: "Trade passt sauber in dein aktuelles Risiko.",
    };
}

function InfoCard({ label, value, hint, color, background, borderColor }) {
    return (
        <div
            style={{
                background: background || COLORS.panelBg,
                border: `1px solid ${borderColor || color || COLORS.border}`,
                borderRadius: 16,
                padding: 14,
                minHeight: 78,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 11,
                    marginBottom: 6,
                }}
            >
                {label}
            </div>

            <div
                style={{
                    color: color || COLORS.text,
                    fontSize: 14,
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
                        fontSize: 11,
                        marginTop: 6,
                        lineHeight: 1.4,
                    }}
                >
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

function InputField({ label, children }) {
    return (
        <label
            style={{
                display: "grid",
                gap: 6,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 12,
                    fontWeight: 600,
                }}
            >
                {label}
            </div>
            {children}
        </label>
    );
}

function CenterAlertBox({ riskStatus }) {
    if (!riskStatus.badgeText) {
        return null;
    }

    return (
        <div
            style={{
                width: "100%",
                minHeight: 150,
                border: `1px solid ${riskStatus.border}`,
                borderRadius: 18,
                background: "rgba(255, 255, 255, 0.02)",
                display: "grid",
                justifyItems: "center",
                alignContent: "center",
                gap: 14,
                padding: "20px 24px",
            }}
        >
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 76,
                    padding: "0 36px",
                    borderRadius: 14,
                    border: `1px solid ${riskStatus.border}`,
                    background: "rgba(255, 255, 255, 0.05)",
                    color: riskStatus.color,
                    fontSize: 44,
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    boxShadow:
                        riskStatus.label === "Orange"
                            ? "0 0 20px rgba(251, 146, 60, 0.18)"
                            : "0 0 20px rgba(248, 113, 113, 0.18)",
                }}
            >
                {riskStatus.badgeText}
            </div>

            <div
                style={{
                    color: riskStatus.color,
                    fontSize: 30,
                    fontWeight: 900,
                    lineHeight: 1,
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    textShadow:
                        riskStatus.label === "Orange"
                            ? "0 0 20px rgba(251, 146, 60, 0.28)"
                            : "0 0 20px rgba(248, 113, 113, 0.28)",
                }}
            >
                {riskStatus.subline}
            </div>
        </div>
    );
}

function RiskPanelContent({
    resolvedAccount,
    resolvedAccountId,
    accountFills,
    accountBalanceRows,
    liveTodayTradeCount,
    liveTodayPnl,
    currentBalance,
    startBalance,
    detectedAccountSize,
    balanceDelta,
    liveOpenContracts,
    livePositions,
}) {
    const [tradeSimulation, setTradeSimulation] = useState(() => {
        return getTradeSimulationForAccount(resolvedAccountId);
    });

    const [simulationDraft, setSimulationDraft] = useState(
        DEFAULT_SIMULATION_DRAFT
    );

    const [riskDraft, setRiskDraft] = useState(() =>
        createDefaultRiskDraft(detectedAccountSize, resolvedAccount)
    );

    const simulatedTradeCount = Array.isArray(tradeSimulation?.trades)
        ? tradeSimulation.trades.length
        : 0;

    const simulatedPnl = sumNumbers(
        (tradeSimulation?.trades || []).map((trade) => trade?.pnl || 0)
    );

    const testModeActive =
        SHOW_INTERNAL_TEST_UI && simulatedTradeCount > 0;

    const effectiveTradeCount = testModeActive
        ? simulatedTradeCount
        : liveTodayTradeCount;

    const effectivePnl = testModeActive ? simulatedPnl : liveTodayPnl;
    const riskStatus = getRiskStatus(effectiveTradeCount);

    const riskSnapshot = useMemo(() => {
        return buildApexRiskSnapshot({
            account: resolvedAccount,
            mode: riskDraft.mode,
            accountSize: riskDraft.accountSize,
            balanceHistoryRows: accountBalanceRows,
            currentBalance,
            currentContracts: liveOpenContracts,
        });
    }, [
        resolvedAccount,
        riskDraft.mode,
        riskDraft.accountSize,
        accountBalanceRows,
        currentBalance,
        liveOpenContracts,
    ]);

    const currentInstrumentOpenContracts = useMemo(() => {
        const selectedInstrument = cleanString(riskDraft.instrument).toUpperCase();

        if (!selectedInstrument) {
            return 0;
        }

        const positions = Array.isArray(livePositions) ? livePositions : [];

        return positions.reduce((sum, position) => {
            const instrumentKey = cleanString(
                position?.instrument ||
                position?.symbol ||
                position?.ticker ||
                position?.contract ||
                position?.name
            ).toUpperCase();

            const matchesInstrument =
                instrumentKey === selectedInstrument ||
                instrumentKey.startsWith(selectedInstrument) ||
                selectedInstrument.startsWith(instrumentKey);

            if (!matchesInstrument) {
                return sum;
            }

            return sum + Math.abs(toNumber(position?.quantity, 0));
        }, 0);
    }, [livePositions, riskDraft.instrument]);

    function handleDraftChange(key, value) {
        setSimulationDraft((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

    function handleRiskDraftChange(key, value) {
        setRiskDraft((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

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

    function handleResetRiskDraft() {
        setRiskDraft(createDefaultRiskDraft(detectedAccountSize, resolvedAccount));
    }

    function handleAddTestTrade() {
        const nextTrade = {
            id: createId(),
            accountId: resolvedAccountId,
            instrument: cleanString(simulationDraft.instrument) || "MNQ",
            side: simulationDraft.side === "short" ? "short" : "long",
            qty: toSafeInteger(simulationDraft.qty, 1),
            pnl: toNumber(simulationDraft.pnl, 0),
            createdAt: new Date().toISOString(),
        };

        setTradeSimulation((prev) => {
            const previousTrades = Array.isArray(prev?.trades) ? prev.trades : [];
            const next = {
                trades: [...previousTrades, nextTrade],
                updatedAt: new Date().toISOString(),
            };

            persistTradeSimulationForAccount(resolvedAccountId, next);
            return next;
        });
    }

    function handleResetSimulation() {
        persistTradeSimulationForAccount(resolvedAccountId, EMPTY_SIMULATION);
        setTradeSimulation(EMPTY_SIMULATION);
        setSimulationDraft(DEFAULT_SIMULATION_DRAFT);
    }

    const calculator = (() => {
        const accountSize = riskSnapshot.startBalance;
        const dailyTarget = Math.max(toNumber(riskDraft.dailyTarget, 0), 0);
        const instrument = getInstrumentConfig(riskDraft.instrument);
        const side = riskDraft.side === "short" ? "short" : "long";
        const entry = toNumber(riskDraft.entry, 0);
        const stop = toNumber(riskDraft.stop, 0);
        const target = toNumber(riskDraft.target, 0);
        const qty = toSafeInteger(riskDraft.qty, 1);

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
        const riskPerPoint = instrument.pointValue * qty;

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
        const activeDll = riskSnapshot.dll;
        const remainingDllRoom =
            activeDll === null || activeDll === undefined
                ? null
                : Math.max(riskSnapshot.remainingDll || 0, 0);

        const liveContractCount = Math.max(toNumber(liveOpenContracts, 0), 0);
        const maxContractsByRule = Math.max(riskSnapshot.maxContracts || 0, 0);
        const remainingContractSlots = maxContractsByRule - liveContractCount;

        const maxContractsByThreshold =
            riskPerContract > 0
                ? Math.max(Math.floor(remainingThresholdRoom / riskPerContract), 0)
                : 0;

        const maxContractsByDll =
            riskPerContract > 0 &&
                remainingDllRoom !== null &&
                remainingDllRoom !== undefined
                ? Math.max(Math.floor(remainingDllRoom / riskPerContract), 0)
                : null;

        let allowedContracts = maxContractsByThreshold;

        if (maxContractsByDll !== null && maxContractsByDll !== undefined) {
            allowedContracts = Math.min(allowedContracts, maxContractsByDll);
        }

        allowedContracts = Math.min(allowedContracts, Math.max(remainingContractSlots, 0));

        const projectedPnlAfterStop = effectivePnl - totalRisk;
        const projectedPnlAfterTarget = effectivePnl + totalReward;
        const projectedBalanceAfterStop =
            currentBalance !== null && currentBalance !== undefined
                ? currentBalance - totalRisk
                : null;
        const projectedBalanceAfterTarget =
            currentBalance !== null && currentBalance !== undefined
                ? currentBalance + totalReward
                : null;

        const remainingThresholdAfterTrade = Math.max(
            remainingThresholdRoom - totalRisk,
            0
        );

        const remainingDllAfterTrade =
            remainingDllRoom === null || remainingDllRoom === undefined
                ? null
                : Math.max(remainingDllRoom - totalRisk, 0);

        const targetGap = Math.max(dailyTarget - Math.max(effectivePnl, 0), 0);

        const riskPercentOfAccount =
            accountSize > 0 ? (totalRisk / accountSize) * 100 : null;

        const riskPercentOfDll =
            activeDll && activeDll > 0 ? (totalRisk / activeDll) * 100 : null;

        const remainingDllPercentAfterTrade =
            activeDll &&
                activeDll > 0 &&
                remainingDllAfterTrade !== null &&
                remainingDllAfterTrade !== undefined
                ? (remainingDllAfterTrade / activeDll) * 100
                : null;

        const hasLiveContractBreach = Boolean(riskSnapshot.status?.contractBreached);

        const isOverAllowedContracts =
            !hasInputError &&
            !hasDirectionError &&
            qty > allowedContracts;

        const status = getCalculatorStatus({
            hasInputError,
            hasDirectionError,
            totalRisk,
            remainingThresholdRoom,
            remainingDllRoom,
            rrRatio,
            isOverAllowedContracts,
            hasLiveContractBreach,
        });

        return {
            accountSize,
            dailyTarget,
            instrument,
            side,
            entry,
            stop,
            target,
            qty,
            stopDistancePoints,
            targetDistancePoints,
            stopTicks,
            targetTicks,
            riskPerContract,
            rewardPerContract,
            riskPerPoint,
            totalRisk,
            totalReward,
            rrRatio,
            hasDirectionError,
            hasInputError,
            remainingThresholdRoom,
            activeDll,
            remainingDllRoom,
            maxContractsByThreshold,
            maxContractsByDll,
            maxContractsByRule,
            liveContractCount,
            remainingContractSlots,
            allowedContracts,
            projectedPnlAfterStop,
            projectedPnlAfterTarget,
            projectedBalanceAfterStop,
            projectedBalanceAfterTarget,
            remainingThresholdAfterTrade,
            remainingDllAfterTrade,
            targetGap,
            riskPercentOfAccount,
            riskPercentOfDll,
            remainingDllPercentAfterTrade,
            status,
            isOverAllowedContracts,
            hasLiveContractBreach,
        };
    })();

    const riskLimitState = useMemo(() => {
        const currentContracts = Math.max(toNumber(calculator.liveContractCount, 0), 0);
        const plannedContracts = toSafeInteger(riskDraft.qty, 1);
        const maxContracts = Math.max(toNumber(calculator.maxContractsByRule, 0), 0);
        const safeSize = Math.max(toNumber(calculator.allowedContracts, 0), 0);
        const instrumentContracts = Math.max(toNumber(currentInstrumentOpenContracts, 0), 0);

        return buildRiskLimitState({
            maxContracts,
            safeSize,
            currentContracts,
            plannedContracts,
            currentInstrumentContracts: instrumentContracts,
            openAfterEntry: currentContracts + plannedContracts,
            instrumentAfterEntry: instrumentContracts + plannedContracts,
            freeSlotsNow: maxContracts - currentContracts,
            freeSlotsAfterEntry: maxContracts - (currentContracts + plannedContracts),
            liveOverLimit: Boolean(calculator.hasLiveContractBreach),
        });
    }, [
        calculator.liveContractCount,
        calculator.maxContractsByRule,
        calculator.allowedContracts,
        calculator.hasLiveContractBreach,
        currentInstrumentOpenContracts,
        riskDraft.qty,
    ]);

    const safeSizeCard = riskLimitState.blocks.safeSize;
    const safeSizeColors = getRiskStatusColors(safeSizeCard.status);

    const openAfterEntryCard = riskLimitState.blocks.openAfterEntry;
    const openAfterEntryColors = getRiskStatusColors(openAfterEntryCard.status);

    const freeSlotsAfterEntryCard = riskLimitState.blocks.freeSlotsAfterEntry;
    const freeSlotsAfterEntryColors = getRiskStatusColors(freeSlotsAfterEntryCard.status);

    const liveOverLimitCard = riskLimitState.blocks.liveOverLimit;
    const liveOverLimitColors = getRiskStatusColors(liveOverLimitCard.status);

    const instrumentAfterEntryCard = riskLimitState.blocks.instrumentAfterEntry;
    const instrumentAfterEntryColors = getRiskStatusColors(instrumentAfterEntryCard.status);

    const safeSizeAvailable =
        !calculator.hasInputError &&
        !calculator.hasDirectionError &&
        !calculator.hasLiveContractBreach &&
        calculator.allowedContracts > 0;

    function handleApplySafeSize() {
        if (!safeSizeAvailable) {
            return;
        }

        handleRiskDraftChange("qty", calculator.allowedContracts);
    }

    return (
        <div
            style={{
                display: "grid",
                gap: 16,
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
                            fontSize: 18,
                            fontWeight: 800,
                        }}
                    >
                        Risk Übersicht
                    </div>
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 13,
                            marginTop: 4,
                            wordBreak: "break-word",
                        }}
                    >
                        Account {resolvedAccount?.displayName || resolvedAccountId || "Unbekannt"}
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
            </div>

            <div
                style={{
                    background: COLORS.panelBg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 20,
                    padding: 18,
                    boxShadow: COLORS.shadow,
                    display: "grid",
                    gap: 14,
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
                                fontSize: 16,
                                fontWeight: 800,
                            }}
                        >
                            Apex Snapshot
                        </div>
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 13,
                                marginTop: 4,
                            }}
                        >
                            Direkte Ableitung aus Account Balance History und Modus
                        </div>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${riskSnapshot.status.level === "danger"
                                    ? COLORS.red
                                    : riskSnapshot.status.level === "warning"
                                        ? COLORS.orange
                                        : COLORS.border
                                }`,
                            borderRadius: 999,
                            padding: "8px 14px",
                            color:
                                riskSnapshot.status.level === "danger"
                                    ? COLORS.red
                                    : riskSnapshot.status.level === "warning"
                                        ? COLORS.orange
                                        : COLORS.text,
                            background:
                                riskSnapshot.status.level === "danger"
                                    ? "rgba(248, 113, 113, 0.10)"
                                    : riskSnapshot.status.level === "warning"
                                        ? "rgba(251, 146, 60, 0.10)"
                                        : "rgba(255,255,255,0.03)",
                            fontSize: 12,
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
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 12,
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
                                            ? "rgba(34, 211, 238, 0.16)"
                                            : "rgba(0, 0, 0, 0.20)",
                                        color: isActive ? COLORS.cyan : COLORS.text,
                                        borderRadius: 14,
                                        padding: "12px 14px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        boxShadow: isActive
                                            ? "0 0 0 1px rgba(34, 211, 238, 0.18), 0 0 18px rgba(34, 211, 238, 0.12)"
                                            : "none",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 800,
                                            marginBottom: 4,
                                        }}
                                    >
                                        {option.label}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: isActive ? COLORS.title : COLORS.textSoft,
                                            lineHeight: 1.45,
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
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 12,
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
                                            ? "rgba(34, 211, 238, 0.16)"
                                            : "rgba(0, 0, 0, 0.20)",
                                        color: isActive ? COLORS.cyan : COLORS.text,
                                        borderRadius: 14,
                                        padding: "12px 14px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        boxShadow: isActive
                                            ? "0 0 0 1px rgba(34, 211, 238, 0.18), 0 0 18px rgba(34, 211, 238, 0.12)"
                                            : "none",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 800,
                                            marginBottom: 4,
                                        }}
                                    >
                                        {formatAccountSizeLabel(size)}
                                    </div>

                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: isActive ? COLORS.title : COLORS.textSoft,
                                            lineHeight: 1.45,
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
                    <InfoCard
                        label="Referenz Balance"
                        value={formatCurrency(riskSnapshot.referenceBalance)}
                        hint="Direkt aus Snapshot"
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="Peak Balance"
                        value={formatCurrency(riskSnapshot.peakBalance)}
                        hint={riskSnapshot.thresholdModel}
                        color={COLORS.yellow}
                    />
                    <InfoCard
                        label="Threshold"
                        value={formatCurrency(riskSnapshot.thresholdBalance)}
                        hint={`Abstand ${formatCurrency(riskSnapshot.distanceToThreshold)}`}
                        color={
                            riskSnapshot.status.thresholdBreached
                                ? COLORS.red
                                : COLORS.orange
                        }
                    />
                    <InfoCard
                        label="Aktives DLL"
                        value={
                            riskSnapshot.dll === null
                                ? "Kein DLL"
                                : formatCurrency(riskSnapshot.dll)
                        }
                        hint={
                            riskSnapshot.dll === null
                                ? "In diesem Modus nicht aktiv"
                                : `Rest ${formatCurrency(riskSnapshot.remainingDll)}`
                        }
                        color={COLORS.purple}
                    />
                    <InfoCard
                        label="Max Kontrakte"
                        value={String(riskSnapshot.maxContracts)}
                        hint={
                            riskSnapshot.tier
                                ? `PA Level ${riskSnapshot.tier.level}`
                                : "Regelbasierter Wert"
                        }
                        color={COLORS.green}
                    />
                    <InfoCard
                        label="Live Kontrakte"
                        value={formatDecimal(liveOpenContracts, 0)}
                        hint={`Frei ${formatDecimal(Math.max((riskSnapshot.maxContracts || 0) - toNumber(liveOpenContracts, 0), 0), 0)}`}
                        color={
                            riskSnapshot.status.contractBreached
                                ? COLORS.red
                                : COLORS.cyan
                        }
                    />
                    <InfoCard
                        label="Liquidation"
                        value={formatCurrency(riskSnapshot.liquidationBalance)}
                        hint="Aktive Grenzlinie"
                        color={COLORS.red}
                    />
                </div>

                {riskSnapshot.status.contractBreached ? (
                    <div
                        style={{
                            border: `1px solid ${COLORS.red}`,
                            borderRadius: 14,
                            padding: 14,
                            background: "rgba(248, 113, 113, 0.10)",
                            color: COLORS.red,
                            fontSize: 15,
                            lineHeight: 1.5,
                            fontWeight: 800,
                        }}
                    >
                        Live Überlimit. Offen sind {formatDecimal(liveOpenContracts, 0)} Kontrakte.
                        Erlaubt sind {riskSnapshot.maxContracts}.
                    </div>
                ) : null}
            </div>

            {SHOW_INTERNAL_TEST_UI ? (
                <div
                    style={{
                        background: riskStatus.background,
                        border: `1px solid ${riskStatus.border}`,
                        borderRadius: 20,
                        padding: 18,
                        boxShadow: COLORS.shadow,
                        display: "grid",
                        gap: 14,
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "220px minmax(320px, 1fr) 160px",
                            gap: 16,
                            alignItems: "stretch",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-start",
                            }}
                        >
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 13,
                                    fontWeight: 700,
                                }}
                            >
                                Trades heute
                            </div>

                            <div
                                style={{
                                    color: COLORS.text,
                                    fontSize: 34,
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    marginTop: 6,
                                }}
                            >
                                {effectiveTradeCount}
                            </div>

                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 12,
                                    marginTop: 8,
                                }}
                            >
                                Quelle {testModeActive ? "Testmodus" : "Live CSV"}
                            </div>
                        </div>

                        <CenterAlertBox riskStatus={riskStatus} />

                        <div
                            style={{
                                display: "grid",
                                gap: 8,
                                alignContent: "start",
                            }}
                        >
                            <InfoCard
                                label="Live Trades heute"
                                value={String(liveTodayTradeCount)}
                                hint={`${accountFills.length} Fills für Account`}
                            />
                            <InfoCard
                                label="Test Trades"
                                value={String(simulatedTradeCount)}
                            />
                            <InfoCard
                                label="PnL"
                                value={formatSignedCurrency(effectivePnl)}
                            />
                        </div>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 14,
                            padding: 14,
                            background: "rgba(255, 255, 255, 0.04)",
                            color: COLORS.text,
                            fontSize: 15,
                            lineHeight: 1.5,
                            fontWeight: 700,
                        }}
                    >
                        {riskStatus.message}
                    </div>
                </div>
            ) : null}

            <div
                style={{
                    background: COLORS.panelBg,
                    border: `1px solid ${calculator.status.border}`,
                    borderRadius: 20,
                    padding: 18,
                    boxShadow: COLORS.shadow,
                    display: "grid",
                    gap: 14,
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
                                fontSize: 16,
                                fontWeight: 800,
                            }}
                        >
                            Riskrechner
                        </div>
                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 13,
                                marginTop: 4,
                            }}
                        >
                            Direkte Trade Prüfung vor dem Entry
                        </div>
                    </div>

                    <div
                        style={{
                            border: `1px solid ${calculator.status.border}`,
                            borderRadius: 999,
                            padding: "8px 14px",
                            color: calculator.status.color,
                            background: calculator.status.background,
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {calculator.status.label}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 12,
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
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                            }}
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
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                            }}
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
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                            }}
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
                                handleRiskDraftChange(
                                    "entry",
                                    event.target.value
                                )
                            }
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                            }}
                            placeholder="z. B. 18250.25"
                        />
                    </InputField>

                    <InputField label="Stop">
                        <input
                            type="number"
                            step="0.25"
                            value={riskDraft.stop}
                            onChange={(event) =>
                                handleRiskDraftChange(
                                    "stop",
                                    event.target.value
                                )
                            }
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                            }}
                            placeholder="z. B. 18235.25"
                        />
                    </InputField>

                    <InputField label="Target">
                        <input
                            type="number"
                            step="0.25"
                            value={riskDraft.target}
                            onChange={(event) =>
                                handleRiskDraftChange(
                                    "target",
                                    event.target.value
                                )
                            }
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.borderStrong}`,
                                background: "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                            }}
                            placeholder="z. B. 18280.25"
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
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                borderRadius: 12,
                                border: `1px solid ${calculator.isOverAllowedContracts
                                        ? COLORS.red
                                        : COLORS.borderStrong
                                    }`,
                                background: calculator.isOverAllowedContracts
                                    ? "rgba(248, 113, 113, 0.10)"
                                    : "rgba(0,0,0,0.25)",
                                color: COLORS.text,
                                outline: "none",
                                boxShadow: calculator.isOverAllowedContracts
                                    ? "0 0 0 1px rgba(248, 113, 113, 0.18)"
                                    : "none",
                            }}
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
                        onClick={handleApplySafeSize}
                        disabled={!safeSizeAvailable}
                        style={{
                            border: `1px solid ${safeSizeAvailable ? COLORS.green : COLORS.borderStrong}`,
                            color: safeSizeAvailable ? COLORS.green : COLORS.textSoft,
                            background: safeSizeAvailable
                                ? "rgba(74, 222, 128, 0.08)"
                                : "rgba(255,255,255,0.02)",
                            borderRadius: 12,
                            padding: "12px 14px",
                            fontWeight: 800,
                            cursor: safeSizeAvailable ? "pointer" : "not-allowed",
                            opacity: safeSizeAvailable ? 1 : 0.7,
                        }}
                    >
                        Safe Size übernehmen
                    </button>

                    <button
                        type="button"
                        onClick={handleResetRiskDraft}
                        style={{
                            border: `1px solid ${COLORS.cyan}`,
                            color: COLORS.cyan,
                            background: "transparent",
                            borderRadius: 12,
                            padding: "12px 14px",
                            fontWeight: 800,
                            cursor: "pointer",
                        }}
                    >
                        Rechner zurücksetzen
                    </button>
                </div>

                <div
                    style={{
                        border: `1px solid ${safeSizeColors.border}`,
                        borderRadius: 14,
                        padding: 14,
                        background: safeSizeColors.background,
                        color: safeSizeColors.text,
                        fontSize: 13,
                        lineHeight: 1.5,
                        fontWeight: 600,
                    }}
                >
                    {safeSizeAvailable
                        ? `Safe Size bereit. Mit einem Klick werden ${calculator.allowedContracts} zusätzliche Kontrakte übernommen.`
                        : "Safe Size noch nicht bereit. Entry, Stop und Target vollständig setzen."}
                </div>

                {calculator.hasLiveContractBreach ? (
                    <div
                        style={{
                            border: `1px solid ${COLORS.red}`,
                            borderRadius: 14,
                            padding: 14,
                            background: "rgba(248, 113, 113, 0.10)",
                            color: COLORS.red,
                            fontSize: 15,
                            lineHeight: 1.5,
                            fontWeight: 800,
                        }}
                    >
                        Live Position ist bereits über dem Limit.
                        Offen sind {formatDecimal(calculator.liveContractCount, 0)} Kontrakte.
                        Erlaubt sind {calculator.maxContractsByRule}.
                    </div>
                ) : null}

                {calculator.isOverAllowedContracts ? (
                    <div
                        style={{
                            border: `1px solid ${COLORS.red}`,
                            borderRadius: 14,
                            padding: 14,
                            background: "rgba(248, 113, 113, 0.10)",
                            color: COLORS.red,
                            fontSize: 15,
                            lineHeight: 1.5,
                            fontWeight: 800,
                        }}
                    >
                        Achtung. Deine Kontraktzahl liegt über der erlaubten Safe Size.
                        Erlaubt sind {calculator.allowedContracts} zusätzliche Kontrakte.
                        Eingegeben sind {calculator.qty}.
                    </div>
                ) : null}

                <div
                    style={{
                        border: `1px solid ${calculator.status.border}`,
                        borderRadius: 14,
                        padding: 14,
                        background: calculator.status.background,
                        color: calculator.status.color,
                        fontSize: 15,
                        lineHeight: 1.5,
                        fontWeight: 700,
                    }}
                >
                    {calculator.status.message}
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
                        hint={`${formatPoints(calculator.stopDistancePoints)} · ${formatTicks(calculator.stopTicks)}`}
                        color={COLORS.red}
                    />
                    <InfoCard
                        label="Chance pro Kontrakt"
                        value={formatCurrency(calculator.rewardPerContract)}
                        hint={`${formatPoints(calculator.targetDistancePoints)} · ${formatTicks(calculator.targetTicks)}`}
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
                        hint={`${calculator.instrument.label} · Tick ${formatDecimal(calculator.instrument.tickSize, 2)} · ${formatCurrency(calculator.instrument.tickValue)}`}
                        color={COLORS.purple}
                    />
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 16,
                        padding: 14,
                        background: "rgba(255, 255, 255, 0.03)",
                        display: "grid",
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        Limit Lage
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCard
                            label="Live Kontrakte gesamt"
                            value={formatDecimal(riskLimitState.currentContracts, 0)}
                            hint={`Max ${formatDecimal(riskLimitState.maxContracts, 0)}`}
                            color={liveOverLimitCard.value ? COLORS.red : COLORS.cyan}
                        />
                        <InfoCard
                            label="Live Kontrakte im Instrument"
                            value={formatDecimal(riskLimitState.currentInstrumentContracts, 0)}
                            hint={`Instrument ${calculator.instrument.label}`}
                            color={COLORS.cyan}
                        />
                        <InfoCard
                            label="Neu geplante Kontrakte"
                            value={formatDecimal(riskLimitState.plannedContracts, 0)}
                            hint={`Instrument ${calculator.instrument.label}`}
                            color={COLORS.purple}
                        />
                        <InfoCard
                            label="Freie Slots jetzt"
                            value={formatDecimal(riskLimitState.freeSlotsNow, 0)}
                            hint={`Max ${formatDecimal(riskLimitState.maxContracts, 0)}`}
                            color={
                                riskLimitState.freeSlotsNow < 0
                                    ? COLORS.red
                                    : riskLimitState.freeSlotsNow <= 1
                                        ? COLORS.orange
                                        : COLORS.text
                            }
                        />
                        <InfoCard
                            label="Max Kontrakte"
                            value={formatDecimal(riskLimitState.maxContracts, 0)}
                            hint="Regelbasierte Obergrenze"
                            color={COLORS.green}
                        />
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCard
                            label="Offen nach Entry"
                            value={formatDecimal(openAfterEntryCard.value, 0)}
                            hint={openAfterEntryCard.reason}
                            color={openAfterEntryColors.text}
                            background={openAfterEntryColors.background}
                            borderColor={openAfterEntryColors.border}
                        />
                        <InfoCard
                            label="Freie Slots nach Entry"
                            value={formatDecimal(freeSlotsAfterEntryCard.value, 0)}
                            hint={freeSlotsAfterEntryCard.reason}
                            color={freeSlotsAfterEntryColors.text}
                            background={freeSlotsAfterEntryColors.background}
                            borderColor={freeSlotsAfterEntryColors.border}
                        />
                        <InfoCard
                            label="Safe Size"
                            value={formatDecimal(safeSizeCard.value, 0)}
                            hint={safeSizeCard.reason}
                            color={safeSizeColors.text}
                            background={safeSizeColors.background}
                            borderColor={safeSizeColors.border}
                        />
                        <InfoCard
                            label="Live Überlimit"
                            value={liveOverLimitCard.value ? "Ja" : "Nein"}
                            hint={liveOverLimitCard.reason}
                            color={liveOverLimitColors.text}
                            background={liveOverLimitColors.background}
                            borderColor={liveOverLimitColors.border}
                        />
                        <InfoCard
                            label="Instrument nach Entry"
                            value={formatDecimal(instrumentAfterEntryCard.value, 0)}
                            hint={instrumentAfterEntryCard.reason}
                            color={instrumentAfterEntryColors.text}
                            background={instrumentAfterEntryColors.background}
                            borderColor={instrumentAfterEntryColors.border}
                        />
                    </div>
                </div>

                <div
                    style={{
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 16,
                        padding: 14,
                        background: "rgba(255, 255, 255, 0.03)",
                        display: "grid",
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        Risiko in Punkten und Prozent
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCard
                            label="Risiko pro Punkt"
                            value={formatCurrency(calculator.riskPerPoint)}
                            hint={`${formatCurrency(calculator.instrument.pointValue)} pro Kontrakt · ${calculator.qty} Kontrakte`}
                            color={COLORS.cyan}
                        />
                        <InfoCard
                            label="Risiko in Prozent Konto"
                            value={formatPercent(calculator.riskPercentOfAccount)}
                            hint={`Basis ${formatCurrency(calculator.accountSize)}`}
                            color={COLORS.yellow}
                        />
                        <InfoCard
                            label="Risiko in Prozent DLL"
                            value={formatPercent(calculator.riskPercentOfDll)}
                            hint={
                                calculator.activeDll === null
                                    ? "Kein DLL aktiv"
                                    : `Basis ${formatCurrency(calculator.activeDll)}`
                            }
                            color={COLORS.orange}
                        />
                        <InfoCard
                            label="Rest DLL nach Stop"
                            value={formatPercent(calculator.remainingDllPercentAfterTrade)}
                            hint={
                                calculator.remainingDllAfterTrade === null
                                    ? "Kein DLL aktiv"
                                    : `${formatCurrency(calculator.remainingDllAfterTrade)} frei`
                            }
                            color={COLORS.green}
                        />
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
                        label="Rest Threshold"
                        value={formatCurrency(calculator.remainingThresholdRoom)}
                        hint={`Liquidation ${formatCurrency(riskSnapshot.thresholdBalance)}`}
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="Rest DLL"
                        value={
                            calculator.remainingDllRoom === null
                                ? "Kein DLL"
                                : formatCurrency(calculator.remainingDllRoom)
                        }
                        hint={
                            calculator.activeDll === null
                                ? "In diesem Modus nicht aktiv"
                                : `Aktiv ${formatCurrency(calculator.activeDll)}`
                        }
                        color={COLORS.yellow}
                    />
                    <InfoCard
                        label="Balance nach Stop"
                        value={formatCurrency(calculator.projectedBalanceAfterStop)}
                        hint={`PnL ${formatSignedCurrency(calculator.projectedPnlAfterStop)}`}
                        color={COLORS.red}
                    />
                    <InfoCard
                        label="Balance nach Ziel"
                        value={formatCurrency(calculator.projectedBalanceAfterTarget)}
                        hint={`Zum Tagesziel fehlen ${formatCurrency(calculator.targetGap)}`}
                        color={COLORS.green}
                    />
                </div>

                {(calculator.hasDirectionError || calculator.hasInputError) ? (
                    <div
                        style={{
                            border: `1px solid ${COLORS.red}`,
                            borderRadius: 14,
                            padding: 14,
                            background: "rgba(248, 113, 113, 0.08)",
                            color: COLORS.red,
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1.5,
                        }}
                    >
                        {calculator.hasInputError
                            ? "Entry, Stop und Target müssen gesetzt sein und Abstand haben."
                            : ""}
                        {calculator.hasInputError && calculator.hasDirectionError ? " " : ""}
                        {calculator.hasDirectionError
                            ? calculator.side === "long"
                                ? "Bei long muss Stop unter Entry und Target über Entry liegen."
                                : "Bei short muss Stop über Entry und Target unter Entry liegen."
                            : ""}
                    </div>
                ) : null}
            </div>

            {SHOW_INTERNAL_TEST_UI ? <RiskTestRunner /> : null}

            {SHOW_INTERNAL_TEST_UI ? (
                <div
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 20,
                        padding: 18,
                        boxShadow: COLORS.shadow,
                        display: "grid",
                        gap: 14,
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
                                    fontSize: 16,
                                    fontWeight: 800,
                                }}
                            >
                                Simulation
                            </div>
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 13,
                                    marginTop: 4,
                                }}
                            >
                                Testet Grün, Orange und Rot direkt im UI
                            </div>
                        </div>

                        <div
                            style={{
                                color: COLORS.textSoft,
                                fontSize: 12,
                            }}
                        >
                            Letzte Änderung{" "}
                            {tradeSimulation?.updatedAt
                                ? formatDateTime(tradeSimulation.updatedAt)
                                : "Keine"}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <InputField label="Instrument">
                            <input
                                value={simulationDraft.instrument}
                                onChange={(event) =>
                                    handleDraftChange(
                                        "instrument",
                                        event.target.value.toUpperCase()
                                    )
                                }
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                                placeholder="MNQ"
                            />
                        </InputField>

                        <InputField label="Seite">
                            <select
                                value={simulationDraft.side}
                                onChange={(event) =>
                                    handleDraftChange(
                                        "side",
                                        event.target.value === "short" ? "short" : "long"
                                    )
                                }
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            >
                                <option value="long">long</option>
                                <option value="short">short</option>
                            </select>
                        </InputField>

                        <InputField label="Menge">
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={simulationDraft.qty}
                                onChange={(event) =>
                                    handleDraftChange(
                                        "qty",
                                        toSafeInteger(event.target.value, 1)
                                    )
                                }
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
                            />
                        </InputField>

                        <InputField label="PnL">
                            <input
                                type="number"
                                step="0.01"
                                value={simulationDraft.pnl}
                                onChange={(event) =>
                                    handleDraftChange("pnl", toNumber(event.target.value, 0))
                                }
                                style={{
                                    width: "100%",
                                    padding: "12px 14px",
                                    borderRadius: 12,
                                    border: `1px solid ${COLORS.borderStrong}`,
                                    background: "rgba(0,0,0,0.25)",
                                    color: COLORS.text,
                                    outline: "none",
                                }}
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
                            onClick={handleAddTestTrade}
                            style={{
                                border: `1px solid ${COLORS.green}`,
                                color: COLORS.green,
                                background: "transparent",
                                borderRadius: 12,
                                padding: "12px 14px",
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            Test Trade hinzufügen
                        </button>

                        <button
                            type="button"
                            onClick={handleResetSimulation}
                            style={{
                                border: `1px solid ${COLORS.orange}`,
                                color: COLORS.orange,
                                background: "transparent",
                                borderRadius: 12,
                                padding: "12px 14px",
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            Reset
                        </button>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                        }}
                    >
                        <InfoCard
                            label="Test Trades"
                            value={String(simulatedTradeCount)}
                            hint="Nur Simulation"
                        />
                        <InfoCard
                            label="Test PnL"
                            value={formatSignedCurrency(simulatedPnl)}
                            hint="Nur Simulation"
                        />
                        <InfoCard
                            label="Status Vorschau"
                            value={getRiskStatus(simulatedTradeCount).label}
                            hint={
                                simulatedTradeCount > 0
                                    ? getRiskStatus(simulatedTradeCount).message
                                    : "Keine Test Trades"
                            }
                        />
                    </div>

                    <div
                        style={{
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 16,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "160px 100px 90px 90px 1fr",
                                gap: 10,
                                padding: "12px 14px",
                                background: COLORS.panelBgStrong,
                                color: COLORS.textSoft,
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: "uppercase",
                            }}
                        >
                            <div>Zeit</div>
                            <div>Instrument</div>
                            <div>Seite</div>
                            <div>Menge</div>
                            <div>PnL</div>
                        </div>

                        {simulatedTradeCount === 0 ? (
                            <div
                                style={{
                                    padding: 16,
                                    color: COLORS.textSoft,
                                    fontSize: 14,
                                }}
                            >
                                Keine Test Trades vorhanden
                            </div>
                        ) : (
                            tradeSimulation.trades
                                .slice()
                                .reverse()
                                .map((trade) => (
                                    <div
                                        key={trade.id}
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "160px 100px 90px 90px 1fr",
                                            gap: 10,
                                            padding: "12px 14px",
                                            borderTop: `1px solid ${COLORS.border}`,
                                            color: COLORS.text,
                                            fontSize: 13,
                                        }}
                                    >
                                        <div>{formatDateTime(trade.createdAt)}</div>
                                        <div>{trade.instrument}</div>
                                        <div>{trade.side}</div>
                                        <div>{trade.qty}</div>
                                        <div>{formatSignedCurrency(trade.pnl)}</div>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function RiskPanel(props) {
    const resolvedAccount =
        props?.account || props?.activeAccount || props?.selectedAccount || null;

    const resolvedAccountId =
        cleanString(props?.resolvedAccountId) ||
        cleanString(props?.accountId) ||
        cleanString(props?.activeAccountId) ||
        cleanString(props?.selectedAccountId) ||
        cleanString(resolvedAccount?.id);

    const fillsProp = props?.fills;
    const accountBalanceHistoryProp = props?.accountBalanceHistory;

    const rawFills = useMemo(() => {
        return Array.isArray(fillsProp) ? fillsProp : [];
    }, [fillsProp]);

    const rawAccountBalanceHistory = useMemo(() => {
        return Array.isArray(accountBalanceHistoryProp)
            ? accountBalanceHistoryProp
            : [];
    }, [accountBalanceHistoryProp]);

    const accountFills = useMemo(() => {
        return scopeRowsByAccount(rawFills, resolvedAccountId);
    }, [rawFills, resolvedAccountId]);

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

    const liveOpenContracts = useMemo(() => {
        return livePositions.reduce((sum, position) => {
            return sum + Math.abs(toNumber(position?.quantity, 0));
        }, 0);
    }, [livePositions]);

    const accountBalanceRows = useMemo(() => {
        const filtered = scopeRowsByAccount(rawAccountBalanceHistory, resolvedAccountId);

        return [...filtered].sort((a, b) => {
            const aTime = (getBalanceTimestamp(a) || new Date(0)).getTime();
            const bTime = (getBalanceTimestamp(b) || new Date(0)).getTime();
            return aTime - bTime;
        });
    }, [rawAccountBalanceHistory, resolvedAccountId]);

    const liveTodayTrades = useMemo(() => {
        return getUniqueTradesForToday(accountFills);
    }, [accountFills]);

    const liveTodayTradeCount = liveTodayTrades.length;

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
        accountBalanceRows.length > 0 ? getBalanceValue(accountBalanceRows[0]) : null;

    const accountCurrentBalance = toNumber(resolvedAccount?.currentBalance, null);
    const accountStartingBalance = toNumber(resolvedAccount?.startingBalance, null);
    const accountDeclaredSize = toNumber(resolvedAccount?.accountSize, null);

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
        accountId: resolvedAccountId,
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

    return (
        <RiskPanelContent
            key={`risk-panel-${resolvedAccountId || "unknown"}-${detectedAccountSize || 0}`}
            resolvedAccount={resolvedAccount}
            resolvedAccountId={resolvedAccountId}
            accountFills={accountFills}
            accountBalanceRows={accountBalanceRows}
            liveTodayTradeCount={liveTodayTradeCount}
            liveTodayPnl={liveTodayPnl}
            currentBalance={currentBalance}
            startBalance={startBalance}
            detectedAccountSize={detectedAccountSize}
            balanceDelta={balanceDelta}
            liveOpenContracts={liveOpenContracts}
            livePositions={livePositions}
        />
    );
}