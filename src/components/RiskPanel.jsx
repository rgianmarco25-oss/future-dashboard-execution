import { useMemo, useState } from "react";
import { formatDateTime } from "../utils/dateFormat";

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

    const standardSizes = [25000, 50000, 100000, 150000, 250000, 300000];

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

function firstNumber(row, keys) {
    if (!row || typeof row !== "object") {
        return null;
    }

    for (const key of keys) {
        const value = row[key];

        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === "string" && value.trim()) {
            const parsed = Number(value.replace(/\s/g, "").replace(/,/g, "."));
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }

    return null;
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

function getDayKey(input) {
    const date = input instanceof Date ? input : toDateOrNull(input);

    if (!date) {
        return "";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());

    return `${day}.${month}.${year}`;
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
    return firstNumber(row, [
        "pnl",
        "PnL",
        "realizedPnl",
        "realized_pnl",
        "profit",
        "netPnl",
        "Realized PnL",
    ]);
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
    const qty = firstNumber(row, ["qty", "quantity", "filledQty", "size"]) || 0;

    return `${instrument}|${side}|${qty}|${timestamp.toISOString()}`;
}

function getUniqueTradesForToday(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const todayKey = getDayKey(new Date());
    const seen = new Set();
    const result = [];

    for (const row of safeRows) {
        const timestamp = getFillTimestamp(row);

        if (!timestamp) {
            continue;
        }

        if (getDayKey(timestamp) !== todayKey) {
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

    const candidates = [
        firstString(row, [
            "account",
            "accountId",
            "account_id",
            "Account",
            "Account ID",
            "accountName",
            "account_name",
        ]),
    ].filter(Boolean);

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

    return safeRows;
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
    return firstNumber(row, [
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
    ]);
}

function deriveAccountSize({ accountId, startBalance, currentBalance, fallbackSize }) {
    const explicitFallback = normalizeAccountSize(fallbackSize, 0);

    if (explicitFallback > 0) {
        return explicitFallback;
    }

    const accountIdMatch = cleanString(accountId).match(/(\d{2,3})\s*k/i);

    if (accountIdMatch) {
        return normalizeAccountSize(Number(accountIdMatch[1]) * 1000, 0);
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

function deriveDefaultDailyLimit(accountSize) {
    const safeSize = normalizeAccountSize(accountSize, 25000) || 25000;
    return Math.round(safeSize * 0.01);
}

function deriveDefaultMaxDrawdown(accountSize) {
    const safeSize = normalizeAccountSize(accountSize, 25000) || 25000;
    return Math.round(safeSize * 0.06);
}

function deriveDefaultDailyTarget(accountSize) {
    const safeSize = normalizeAccountSize(accountSize, 25000) || 25000;
    return Math.round(safeSize * 0.01);
}

function createDefaultRiskDraft(accountSize) {
    const safeAccountSize = normalizeAccountSize(accountSize, 25000) || 25000;

    return {
        accountSize: safeAccountSize,
        dailyLossLimit: deriveDefaultDailyLimit(safeAccountSize),
        maxDrawdown: deriveDefaultMaxDrawdown(safeAccountSize),
        dailyTarget: deriveDefaultDailyTarget(safeAccountSize),
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
    remainingDayLossRoom,
    remainingDrawdownRoom,
    rrRatio,
}) {
    const drawdownRoom =
        remainingDrawdownRoom === null || remainingDrawdownRoom === undefined
            ? Number.POSITIVE_INFINITY
            : remainingDrawdownRoom;

    if (hasInputError || hasDirectionError) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Stop, Ziel oder Richtung passen noch nicht.",
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

    if (totalRisk > remainingDayLossRoom || totalRisk > drawdownRoom) {
        return {
            label: "Rot",
            color: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            border: COLORS.red,
            message: "Trade ist zu gross für Tageslimit oder Drawdown.",
        };
    }

    if (totalRisk > remainingDayLossRoom * 0.6 || rrRatio < 1) {
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

function InfoCard({ label, value, hint, color }) {
    return (
        <div
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${color || COLORS.border}`,
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
}) {
    const [tradeSimulation, setTradeSimulation] = useState(() => {
        return getTradeSimulationForAccount(resolvedAccountId);
    });

    const [simulationDraft, setSimulationDraft] = useState(
        DEFAULT_SIMULATION_DRAFT
    );

    const [riskDraft, setRiskDraft] = useState(() =>
        createDefaultRiskDraft(detectedAccountSize)
    );

    const simulatedTradeCount = Array.isArray(tradeSimulation?.trades)
        ? tradeSimulation.trades.length
        : 0;

    const simulatedPnl = sumNumbers(
        (tradeSimulation?.trades || []).map((trade) => trade?.pnl || 0)
    );

    const testModeActive = simulatedTradeCount > 0;
    const effectiveTradeCount = testModeActive
        ? simulatedTradeCount
        : liveTodayTradeCount;

    const effectivePnl = testModeActive ? simulatedPnl : liveTodayPnl;
    const riskStatus = getRiskStatus(effectiveTradeCount);

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

    function handleResetRiskDraft() {
        setRiskDraft(createDefaultRiskDraft(detectedAccountSize));
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
        const accountSize = normalizeAccountSize(riskDraft.accountSize, detectedAccountSize || 25000);
        const dailyLossLimit = Math.max(toNumber(riskDraft.dailyLossLimit, 0), 0);
        const maxDrawdown = Math.max(toNumber(riskDraft.maxDrawdown, 0), 0);
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

        const currentLossUsed = Math.max(Math.abs(Math.min(effectivePnl, 0)), 0);
        const remainingDayLossRoom = Math.max(dailyLossLimit - currentLossUsed, 0);

        const minAllowedBalance =
            accountSize > 0 && maxDrawdown > 0 ? accountSize - maxDrawdown : null;

        const remainingDrawdownRoom =
            minAllowedBalance !== null &&
                currentBalance !== null &&
                currentBalance !== undefined
                ? Math.max(currentBalance - minAllowedBalance, 0)
                : null;

        const maxContractsByDay =
            riskPerContract > 0 ? Math.max(Math.floor(remainingDayLossRoom / riskPerContract), 0) : 0;

        const maxContractsByDrawdown =
            riskPerContract > 0 &&
                remainingDrawdownRoom !== null &&
                remainingDrawdownRoom !== undefined
                ? Math.max(Math.floor(remainingDrawdownRoom / riskPerContract), 0)
                : null;

        let allowedContracts = maxContractsByDay;

        if (maxContractsByDrawdown !== null && maxContractsByDrawdown !== undefined) {
            allowedContracts = Math.min(maxContractsByDay, maxContractsByDrawdown);
        }

        const projectedPnlAfterStop = effectivePnl - totalRisk;
        const projectedPnlAfterTarget = effectivePnl + totalReward;
        const remainingAfterThisTrade = Math.max(remainingDayLossRoom - totalRisk, 0);
        const targetGap = Math.max(dailyTarget - Math.max(effectivePnl, 0), 0);

        const status = getCalculatorStatus({
            hasInputError,
            hasDirectionError,
            totalRisk,
            remainingDayLossRoom,
            remainingDrawdownRoom,
            rrRatio,
        });

        return {
            accountSize,
            dailyLossLimit,
            maxDrawdown,
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
            totalRisk,
            totalReward,
            rrRatio,
            hasDirectionError,
            hasInputError,
            remainingDayLossRoom,
            minAllowedBalance,
            remainingDrawdownRoom,
            maxContractsByDay,
            maxContractsByDrawdown,
            allowedContracts,
            projectedPnlAfterStop,
            projectedPnlAfterTarget,
            remainingAfterThisTrade,
            targetGap,
            status,
        };
    })();

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

                <div
                    style={{
                        border: `1px solid ${riskStatus.border}`,
                        borderRadius: 999,
                        padding: "8px 14px",
                        color: riskStatus.color,
                        fontSize: 12,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        background: riskStatus.background,
                    }}
                >
                    {riskStatus.label}
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
                    <InputField label="Kontogrösse">
                        <input
                            type="number"
                            step="1000"
                            value={riskDraft.accountSize}
                            onChange={(event) =>
                                handleRiskDraftChange(
                                    "accountSize",
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

                    <InputField label="Tageslimit">
                        <input
                            type="number"
                            step="1"
                            value={riskDraft.dailyLossLimit}
                            onChange={(event) =>
                                handleRiskDraftChange(
                                    "dailyLossLimit",
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

                    <InputField label="Max Drawdown">
                        <input
                            type="number"
                            step="1"
                            value={riskDraft.maxDrawdown}
                            onChange={(event) =>
                                handleRiskDraftChange(
                                    "maxDrawdown",
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
                        hint={`${calculator.qty} Kontrakte`}
                        color={COLORS.orange}
                    />
                    <InfoCard
                        label="Gesamtziel"
                        value={formatCurrency(calculator.totalReward)}
                        hint={`${calculator.qty} Kontrakte`}
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
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 10,
                    }}
                >
                    <InfoCard
                        label="Restspielraum Tag"
                        value={formatCurrency(calculator.remainingDayLossRoom)}
                        hint={`Nach aktuellem PnL ${formatSignedCurrency(effectivePnl)}`}
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="Restspielraum Drawdown"
                        value={formatCurrency(calculator.remainingDrawdownRoom)}
                        hint={
                            calculator.minAllowedBalance === null
                                ? "Kein Grenzwert"
                                : `Mindestbalance ${formatCurrency(calculator.minAllowedBalance)}`
                        }
                        color={COLORS.yellow}
                    />
                    <InfoCard
                        label="Erlaubte Kontrakte"
                        value={String(calculator.allowedContracts)}
                        hint={
                            calculator.maxContractsByDrawdown === null
                                ? `Tag ${calculator.maxContractsByDay}`
                                : `Tag ${calculator.maxContractsByDay} · DD ${calculator.maxContractsByDrawdown}`
                        }
                        color={COLORS.cyan}
                    />
                    <InfoCard
                        label="PnL nach Stop"
                        value={formatSignedCurrency(calculator.projectedPnlAfterStop)}
                        hint={`Rest ${formatCurrency(calculator.remainingAfterThisTrade)}`}
                        color={COLORS.red}
                    />
                    <InfoCard
                        label="PnL nach Ziel"
                        value={formatSignedCurrency(calculator.projectedPnlAfterTarget)}
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

    const currentBalance =
        historyCurrentBalance !== null && historyCurrentBalance !== undefined
            ? historyCurrentBalance
            : toNumber(
                resolvedAccount?.currentBalance,
                resolvedAccount?.accountSize || 0
            );

    const startBalance =
        historyStartBalance !== null && historyStartBalance !== undefined
            ? historyStartBalance
            : toNumber(
                resolvedAccount?.startingBalance,
                resolvedAccount?.accountSize || 0
            );

    const detectedAccountSize = deriveAccountSize({
        accountId: resolvedAccountId,
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
        />
    );
}