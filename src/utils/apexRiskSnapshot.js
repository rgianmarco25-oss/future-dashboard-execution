const TRADING_TIMEZONE = "America/New_York";

export const APEX_MODES = {
    EVAL_EOD: "EVAL_EOD",
    EVAL_INTRADAY: "EVAL_INTRADAY",
    PA_EOD: "PA_EOD",
    PA_INTRADAY: "PA_INTRADAY",
};

const APEX_PRESETS = {
    "25K": {
        label: "25K",
        startBalance: 25000,
        drawdownAmount: 1000,
        evalMaxContracts: 4,
        evalEodDll: 500,
        paStaticThresholdStop: 25100,
        payoutSafetyNetBalance: 26100,
        paTiers: [
            { level: 1, minProfit: 0, maxContracts: 1, dll: 500 },
            { level: 2, minProfit: 1000, maxContracts: 2, dll: 500 },
            { level: 3, minProfit: 2000, maxContracts: 2, dll: 1250 },
        ],
    },
    "50K": {
        label: "50K",
        startBalance: 50000,
        drawdownAmount: 2000,
        evalMaxContracts: 6,
        evalEodDll: 1000,
        paStaticThresholdStop: 50100,
        payoutSafetyNetBalance: 52100,
        paTiers: [
            { level: 1, minProfit: 0, maxContracts: 2, dll: 1000 },
            { level: 2, minProfit: 1500, maxContracts: 3, dll: 1000 },
            { level: 3, minProfit: 3000, maxContracts: 4, dll: 2000 },
            { level: 4, minProfit: 6000, maxContracts: 4, dll: 3000 },
        ],
    },
    "100K": {
        label: "100K",
        startBalance: 100000,
        drawdownAmount: 3000,
        evalMaxContracts: 8,
        evalEodDll: 1500,
        paStaticThresholdStop: 100100,
        payoutSafetyNetBalance: 103100,
        paTiers: [
            { level: 1, minProfit: 0, maxContracts: 3, dll: 1750 },
            { level: 2, minProfit: 2000, maxContracts: 4, dll: 1750 },
            { level: 3, minProfit: 3000, maxContracts: 5, dll: 1750 },
            { level: 4, minProfit: 5000, maxContracts: 6, dll: 2500 },
            { level: 5, minProfit: 10000, maxContracts: 6, dll: 3500 },
        ],
    },
    "150K": {
        label: "150K",
        startBalance: 150000,
        drawdownAmount: 4000,
        evalMaxContracts: 12,
        evalEodDll: 2000,
        paStaticThresholdStop: 150100,
        payoutSafetyNetBalance: 154100,
        paTiers: [
            { level: 1, minProfit: 0, maxContracts: 4, dll: 2500 },
            { level: 2, minProfit: 2000, maxContracts: 5, dll: 2500 },
            { level: 3, minProfit: 3000, maxContracts: 7, dll: 2500 },
            { level: 4, minProfit: 5000, maxContracts: 10, dll: 3000 },
            { level: 5, minProfit: 10000, maxContracts: 10, dll: 4000 },
        ],
    },
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function toUpperKey(value) {
    return cleanString(value)
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
}

function parseNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const raw = cleanString(value);

    if (!raw) {
        return null;
    }

    const normalized = raw
        .replace(/\s/g, "")
        .replace(/\$/g, "")
        .replace(/,/g, "");

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === "number") {
        const fromNumber = new Date(value);
        return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
    }

    const raw = cleanString(value);

    if (!raw) {
        return null;
    }

    const parsed = new Date(raw);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFirstNumber(source, keys) {
    for (const key of keys) {
        const parsed = parseNumber(source?.[key]);
        if (parsed !== null) {
            return parsed;
        }
    }

    return null;
}

function getFirstDate(source, keys) {
    for (const key of keys) {
        const parsed = parseDateValue(source?.[key]);
        if (parsed) {
            return parsed;
        }
    }

    return null;
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

function getTradingDayKey(date) {
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

function normalizeMode(rawMode, account) {
    const explicit = toUpperKey(rawMode);

    if (
        explicit === APEX_MODES.EVAL_EOD ||
        explicit === APEX_MODES.EVAL_INTRADAY ||
        explicit === APEX_MODES.PA_EOD ||
        explicit === APEX_MODES.PA_INTRADAY
    ) {
        return explicit;
    }

    const inferredSource = [
        account?.mode,
        account?.accountMode,
        account?.phaseMode,
        account?.status,
        account?.phase,
        account?.type,
        account?.name,
        account?.label,
    ]
        .map(cleanString)
        .join(" ")
        .toUpperCase();

    const isPa = inferredSource.includes("PA") || inferredSource.includes("PERFORMANCE");
    const isEval = inferredSource.includes("EVAL") || inferredSource.includes("EVALUATION");
    const isIntraday = inferredSource.includes("INTRADAY");
    const isEod = inferredSource.includes("EOD");

    if (isPa && isIntraday) {
        return APEX_MODES.PA_INTRADAY;
    }

    if (isPa && isEod) {
        return APEX_MODES.PA_EOD;
    }

    if (isEval && isIntraday) {
        return APEX_MODES.EVAL_INTRADAY;
    }

    if (isEval && isEod) {
        return APEX_MODES.EVAL_EOD;
    }

    return APEX_MODES.EVAL_EOD;
}

function normalizeAccountSize(rawSize, account) {
    const direct = parseNumber(rawSize);

    if (direct === 25 || direct === 50 || direct === 100 || direct === 150) {
        return `${direct}K`;
    }

    if (direct === 25000 || direct === 50000 || direct === 100000 || direct === 150000) {
        return `${Math.round(direct / 1000)}K`;
    }

    const source = [
        rawSize,
        account?.accountSize,
        account?.size,
        account?.name,
        account?.label,
        account?.accountName,
    ]
        .map(cleanString)
        .join(" ")
        .toUpperCase();

    if (source.includes("150K") || source.includes("150000")) {
        return "150K";
    }

    if (source.includes("100K") || source.includes("100000")) {
        return "100K";
    }

    if (source.includes("50K") || source.includes("50000")) {
        return "50K";
    }

    if (source.includes("25K") || source.includes("25000")) {
        return "25K";
    }

    return "25K";
}

function getPreset(accountSize) {
    return APEX_PRESETS[accountSize] || APEX_PRESETS["25K"];
}

function normalizeBalanceHistoryRows(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row, index) => {
            const timestamp = getFirstDate(row, [
                "timestamp",
                "dateTime",
                "datetime",
                "time",
                "date",
                "DateTime",
                "Datetime",
                "Time",
                "Date",
                "CreatedAt",
                "createdAt",
            ]);

            const balance = getFirstNumber(row, [
                "netLiq",
                "netLiquidation",
                "netLiquidatingValue",
                "balance",
                "accountBalance",
                "endingBalance",
                "endBalance",
                "closeBalance",
                "totalEquity",
                "equity",
                "NetLiq",
                "NetLiquidation",
                "Balance",
                "AccountBalance",
                "EndingBalance",
                "EndBalance",
                "CloseBalance",
                "TotalEquity",
                "Equity",
            ]);

            if (!timestamp || balance === null) {
                return null;
            }

            return {
                id: `${timestamp.toISOString()}-${index}`,
                timestamp,
                balance,
                tradingDayKey: getTradingDayKey(timestamp),
                raw: row,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function getDailyCloses(entries) {
    const closesByTradingDay = new Map();

    entries.forEach((entry) => {
        closesByTradingDay.set(entry.tradingDayKey, entry);
    });

    return [...closesByTradingDay.values()].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
}

function getCompletedDailyCloses(entries, nowDate) {
    const currentTradingDayKey = getTradingDayKey(nowDate);
    return getDailyCloses(entries).filter(
        (entry) => entry.tradingDayKey !== currentTradingDayKey
    );
}

function getMaxBalance(entries, fallback) {
    if (!entries.length) {
        return fallback;
    }

    return entries.reduce((highest, entry) => Math.max(highest, entry.balance), fallback);
}

function getLastEntry(entries) {
    return entries.length ? entries[entries.length - 1] : null;
}

function clampFloor(value, floor) {
    if (!Number.isFinite(value)) {
        return floor;
    }

    return Math.max(value, floor);
}

function getPaTier(preset, balanceForTier) {
    const growth = Math.max(0, balanceForTier - preset.startBalance);
    let activeTier = preset.paTiers[0];

    preset.paTiers.forEach((tier) => {
        if (growth >= tier.minProfit) {
            activeTier = tier;
        }
    });

    return {
        ...activeTier,
        growth,
    };
}

function buildStatus({
    currentBalance,
    thresholdBalance,
    dll,
    sessionLoss,
    currentContracts,
    maxContracts,
}) {
    const thresholdBreached = currentBalance <= thresholdBalance;
    const dllBreached = dll !== null && sessionLoss >= dll;
    const contractBreached =
        currentContracts !== null && currentContracts > maxContracts;

    let level = "ok";

    if (thresholdBreached || dllBreached || contractBreached) {
        level = "danger";
    } else if (
        currentBalance - thresholdBalance <= 250 ||
        (dll !== null && dll - sessionLoss <= 150)
    ) {
        level = "warning";
    }

    return {
        level,
        thresholdBreached,
        dllBreached,
        contractBreached,
    };
}

export function buildApexRiskSnapshot({
    account = null,
    mode = "",
    accountSize = "",
    balanceHistoryRows = [],
    currentBalance = null,
    currentContracts = null,
    now = null,
} = {}) {
    const resolvedMode = normalizeMode(mode, account);
    const resolvedAccountSize = normalizeAccountSize(accountSize, account);
    const preset = getPreset(resolvedAccountSize);
    const normalizedEntries = normalizeBalanceHistoryRows(balanceHistoryRows);
    const nowDate = parseDateValue(now) || new Date();

    const allDailyCloses = getDailyCloses(normalizedEntries);
    const completedDailyCloses = getCompletedDailyCloses(normalizedEntries, nowDate);
    const lastEntry = getLastEntry(normalizedEntries);

    const currentBalanceResolved =
        parseNumber(currentBalance) ?? lastEntry?.balance ?? preset.startBalance;

    const currentContractsResolved =
        parseNumber(currentContracts) ??
        parseNumber(account?.currentContracts) ??
        null;

    const peakIntradayBalance = getMaxBalance(
        normalizedEntries,
        Math.max(preset.startBalance, currentBalanceResolved)
    );

    const peakClosedBalance = getMaxBalance(completedDailyCloses, preset.startBalance);
    const latestCompletedCloseBalance =
        getLastEntry(completedDailyCloses)?.balance ?? preset.startBalance;

    const sessionStartBalance = latestCompletedCloseBalance;
    const sessionPnL = currentBalanceResolved - sessionStartBalance;
    const sessionLoss = Math.max(0, -sessionPnL);
    const evaluationFloor = preset.startBalance - preset.drawdownAmount;

    let referenceBalance = currentBalanceResolved;
    let peakBalance = peakIntradayBalance;
    let thresholdBalance = evaluationFloor;
    let dll = null;
    let maxContracts = preset.evalMaxContracts;
    let tier = null;
    let thresholdModel = "intraday";

    if (resolvedMode === APEX_MODES.EVAL_EOD) {
        referenceBalance = latestCompletedCloseBalance;
        peakBalance = peakClosedBalance;
        thresholdBalance = clampFloor(
            peakBalance - preset.drawdownAmount,
            evaluationFloor
        );
        dll = preset.evalEodDll;
        maxContracts = preset.evalMaxContracts;
        thresholdModel = "eod_close_based";
    }

    if (resolvedMode === APEX_MODES.EVAL_INTRADAY) {
        referenceBalance = currentBalanceResolved;
        peakBalance = peakIntradayBalance;
        thresholdBalance = clampFloor(
            peakBalance - preset.drawdownAmount,
            evaluationFloor
        );
        dll = null;
        maxContracts = preset.evalMaxContracts;
        thresholdModel = "intraday_trailing";
    }

    if (resolvedMode === APEX_MODES.PA_EOD) {
        referenceBalance = latestCompletedCloseBalance;
        peakBalance = peakClosedBalance;
        tier = getPaTier(preset, latestCompletedCloseBalance);
        thresholdBalance = clampFloor(
            peakBalance - preset.drawdownAmount,
            evaluationFloor
        );
        thresholdBalance = Math.min(
            thresholdBalance,
            preset.paStaticThresholdStop
        );
        dll = tier.dll;
        maxContracts = tier.maxContracts;
        thresholdModel = "eod_close_based_static_at_safety_stop";
    }

    if (resolvedMode === APEX_MODES.PA_INTRADAY) {
        referenceBalance = currentBalanceResolved;
        peakBalance = peakIntradayBalance;
        tier = getPaTier(preset, latestCompletedCloseBalance);
        thresholdBalance = clampFloor(
            peakBalance - preset.drawdownAmount,
            evaluationFloor
        );
        thresholdBalance = Math.min(
            thresholdBalance,
            preset.paStaticThresholdStop
        );
        dll = tier.dll;
        maxContracts = tier.maxContracts;
        thresholdModel = "intraday_trailing_static_at_safety_stop";
    }

    const distanceToThreshold = Math.max(
        0,
        currentBalanceResolved - thresholdBalance
    );

    const remainingDll =
        dll === null ? null : Math.max(0, dll - sessionLoss);

    const effectiveRiskBudget =
        remainingDll === null
            ? distanceToThreshold
            : Math.min(distanceToThreshold, remainingDll);

    const status = buildStatus({
        currentBalance: currentBalanceResolved,
        thresholdBalance,
        dll,
        sessionLoss,
        currentContracts: currentContractsResolved,
        maxContracts,
    });

    return {
        mode: resolvedMode,
        accountSize: resolvedAccountSize,
        startBalance: preset.startBalance,
        referenceBalance,
        currentBalance: currentBalanceResolved,
        peakBalance,
        thresholdBalance,
        liquidationBalance: thresholdBalance,
        drawdownAmount: preset.drawdownAmount,
        dll,
        sessionStartBalance,
        sessionPnL,
        sessionLoss,
        maxContracts,
        currentContracts: currentContractsResolved,
        distanceToThreshold,
        remainingDll,
        effectiveRiskBudget,
        paStaticThresholdStop: preset.paStaticThresholdStop,
        payoutSafetyNetBalance: preset.payoutSafetyNetBalance,
        thresholdModel,
        tier,
        status,
        debug: {
            entriesLoaded: normalizedEntries.length,
            dailyClosesLoaded: allDailyCloses.length,
            completedDailyClosesLoaded: completedDailyCloses.length,
            latestCompletedCloseBalance,
            evaluationFloor,
            tradingTimezone: TRADING_TIMEZONE,
        },
    };
}