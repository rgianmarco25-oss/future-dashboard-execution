import {
    getRules,
    resolveCurrentDailyLossLimit,
    resolveCurrentMaxContracts,
    resolveCurrentPaTier,
    resolvePayoutCapForRequest,
    resolveStaticPaThresholdStop,
} from "./apexRules";

const TRADING_TIMEZONE = "America/New_York";

export const APEX_MODES = {
    EVAL_EOD: "EVAL_EOD",
    EVAL_INTRADAY: "EVAL_INTRADAY",
    PA_EOD: "PA_EOD",
    PA_INTRADAY: "PA_INTRADAY",
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

    const phase = cleanString(account?.accountPhase).toLowerCase();
    const productType = cleanString(account?.productType).toLowerCase();

    if (phase === "pa" && productType === "intraday") {
        return APEX_MODES.PA_INTRADAY;
    }

    if (phase === "pa" && productType === "eod") {
        return APEX_MODES.PA_EOD;
    }

    if (phase === "eval" && productType === "intraday") {
        return APEX_MODES.EVAL_INTRADAY;
    }

    if (phase === "eval" && productType === "eod") {
        return APEX_MODES.EVAL_EOD;
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

function normalizeAccountSizeNumber(rawSize, account) {
    const direct = parseNumber(rawSize);

    if (direct === 25 || direct === 50 || direct === 100 || direct === 150) {
        return direct * 1000;
    }

    if (direct === 25000 || direct === 50000 || direct === 100000 || direct === 150000) {
        return direct;
    }

    const source = [
        rawSize,
        account?.accountSize,
        account?.size,
        account?.name,
        account?.label,
        account?.accountName,
        account?.displayName,
    ]
        .map(cleanString)
        .join(" ")
        .toUpperCase();

    if (source.includes("150K") || source.includes("150000")) {
        return 150000;
    }

    if (source.includes("100K") || source.includes("100000")) {
        return 100000;
    }

    if (source.includes("50K") || source.includes("50000")) {
        return 50000;
    }

    if (source.includes("25K") || source.includes("25000")) {
        return 25000;
    }

    return 25000;
}

function formatAccountSizeLabel(accountSizeNumber) {
    return `${Math.round(Number(accountSizeNumber) / 1000)}K`;
}

function modeToRuleContext(mode) {
    switch (mode) {
        case APEX_MODES.EVAL_INTRADAY:
            return { productType: "intraday", accountPhase: "eval" };
        case APEX_MODES.PA_EOD:
            return { productType: "eod", accountPhase: "pa" };
        case APEX_MODES.PA_INTRADAY:
            return { productType: "intraday", accountPhase: "pa" };
        case APEX_MODES.EVAL_EOD:
        default:
            return { productType: "eod", accountPhase: "eval" };
    }
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
                "updatedAt",
                "transactionDate",
                "tradeDate",
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
                "currentBalance",
                "cashBalance",
                "totalAmount",
                "amount",
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
        currentContracts !== null &&
        maxContracts !== null &&
        maxContracts > 0 &&
        currentContracts > maxContracts;

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

function getFillTimestamp(row) {
    return (
        getFirstDate(row, [
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
            "createdAt",
        ]) || null
    );
}

function getFillPnl(row) {
    return getFirstNumber(row, [
        "pnl",
        "PnL",
        "realizedPnl",
        "realized_pnl",
        "profit",
        "netPnl",
        "Realized PnL",
        "realizedPnL",
    ]);
}

function normalizeFillRows(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row, index) => {
            const timestamp = getFillTimestamp(row);
            const pnl = getFillPnl(row);

            if (!timestamp || pnl === null) {
                return null;
            }

            return {
                id: `${timestamp.toISOString()}-${index}`,
                timestamp,
                pnl,
                tradingDayKey: getTradingDayKey(timestamp),
                raw: row,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function buildDailyNetPnl(fillEntries) {
    const byDay = new Map();

    fillEntries.forEach((entry) => {
        const existing = byDay.get(entry.tradingDayKey) || {
            tradingDayKey: entry.tradingDayKey,
            netPnl: 0,
            fillCount: 0,
            firstTimestamp: entry.timestamp,
            lastTimestamp: entry.timestamp,
        };

        existing.netPnl += entry.pnl;
        existing.fillCount += 1;

        if (entry.timestamp < existing.firstTimestamp) {
            existing.firstTimestamp = entry.timestamp;
        }

        if (entry.timestamp > existing.lastTimestamp) {
            existing.lastTimestamp = entry.timestamp;
        }

        byDay.set(entry.tradingDayKey, existing);
    });

    return [...byDay.values()].sort((a, b) =>
        a.tradingDayKey.localeCompare(b.tradingDayKey)
    );
}

function getApprovedPayoutCount(account) {
    const count = getFirstNumber(account, [
        "approvedPayoutCount",
        "payoutCount",
        "approvedPayouts",
        "completedPayoutCount",
    ]);

    return count === null ? 0 : Math.max(0, Math.floor(count));
}

function getLastApprovedPayoutDate(account) {
    return getFirstDate(account, [
        "lastApprovedPayoutAt",
        "lastApprovedPayoutDate",
        "lastPayoutApprovedAt",
        "lastPayoutDate",
    ]);
}

function getAccountLifecycleStartDate(account, firstFillDate) {
    return (
        getFirstDate(account, [
            "paActivatedAt",
            "activatedAt",
            "createdAt",
            "createdOn",
            "startDate",
            "openedAt",
        ]) || firstFillDate || null
    );
}

function buildPayoutState({
    rule,
    currentBalance,
    startBalance,
    fillEntries,
    account,
}) {
    if (!rule || rule.accountPhase !== "pa" || !rule.payoutRules) {
        return null;
    }

    const payoutRules = rule.payoutRules;
    const approvedPayoutCount = getApprovedPayoutCount(account);
    const lastApprovedPayoutDate = getLastApprovedPayoutDate(account);
    const requestNumber = approvedPayoutCount + 1;
    const nextPayoutCap = resolvePayoutCapForRequest(rule, approvedPayoutCount);
    const cycleFillEntries = lastApprovedPayoutDate
        ? fillEntries.filter((entry) => entry.timestamp > lastApprovedPayoutDate)
        : fillEntries;

    const dailyNet = buildDailyNetPnl(cycleFillEntries);
    const qualifyingDaysCompleted = dailyNet.filter(
        (day) => day.netPnl >= payoutRules.minDailyProfit
    ).length;
    const qualifyingDaysRemaining = Math.max(
        0,
        payoutRules.minTradeDays - qualifyingDaysCompleted
    );

    const currentCycleProfit = dailyNet.reduce((sum, day) => sum + day.netPnl, 0);
    const bestProfitableDay = dailyNet.reduce((highest, day) => {
        if (day.netPnl > highest) {
            return day.netPnl;
        }

        return highest;
    }, 0);

    const consistencyPercentCurrent =
        currentCycleProfit > 0
            ? (bestProfitableDay / currentCycleProfit) * 100
            : null;

    const consistencyPassed =
        consistencyPercentCurrent !== null &&
        consistencyPercentCurrent < payoutRules.consistencyPercent;

    const profitAboveSafetyNet = Math.max(
        0,
        Number(currentBalance) - Number(payoutRules.safetyNet)
    );

    const maxRequestableByRules =
        nextPayoutCap === null ? 0 : Math.min(nextPayoutCap, profitAboveSafetyNet);

    const minBalancePassed =
        Number(currentBalance) >= Number(payoutRules.minBalanceToRequest);

    const minPayoutPassed =
        maxRequestableByRules >= Number(payoutRules.minPayoutAmount);

    const payoutCycleExhausted = requestNumber > Number(payoutRules.maxPayouts);

    const basisComplete = !(approvedPayoutCount > 0 && !lastApprovedPayoutDate);

    const eligible =
        !payoutCycleExhausted &&
        basisComplete &&
        qualifyingDaysCompleted >= payoutRules.minTradeDays &&
        consistencyPassed &&
        minBalancePassed &&
        minPayoutPassed;

    const reasons = [];

    if (!basisComplete) {
        reasons.push("Payout Verlauf seit letzter genehmigter Auszahlung fehlt.");
    }

    if (payoutCycleExhausted) {
        reasons.push("Maximale Anzahl an Auszahlungen für diese PA erreicht.");
    }

    if (qualifyingDaysCompleted < payoutRules.minTradeDays) {
        reasons.push("Zu wenige Qualifying Days.");
    }

    if (!consistencyPassed) {
        reasons.push("50 Prozent Consistency noch nicht erfüllt.");
    }

    if (!minBalancePassed) {
        reasons.push("Min Balance to Request noch nicht erreicht.");
    }

    if (!minPayoutPassed) {
        reasons.push("Auszahlbarer Betrag liegt noch unter 500 USD.");
    }

    return {
        available: true,
        basisComplete,
        basisLabel: lastApprovedPayoutDate
            ? "since_last_approved_payout"
            : "since_start_or_visible_history",
        approvedPayoutCount,
        requestNumber,
        maxPayouts: payoutRules.maxPayouts,
        nextPayoutCap,
        minPayoutAmount: payoutRules.minPayoutAmount,
        payoutSplitPercent: payoutRules.payoutSplitPercent,
        minTradeDaysRequired: payoutRules.minTradeDays,
        qualifyingDaysCompleted,
        qualifyingDaysRemaining,
        minDailyProfit: payoutRules.minDailyProfit,
        consistencyLimitPercent: payoutRules.consistencyPercent,
        consistencyPercentCurrent,
        consistencyPassed,
        minBalanceToRequest: payoutRules.minBalanceToRequest,
        minBalancePassed,
        safetyNetBalance: payoutRules.safetyNet,
        profitAboveSafetyNet,
        requestableAmount: maxRequestableByRules,
        requestableAmountAfterMinimumCheck: minPayoutPassed ? maxRequestableByRules : 0,
        currentCycleProfit,
        bestProfitableDay,
        eligible,
        status: payoutCycleExhausted ? "red" : eligible ? "green" : "yellow",
        reasons,
        debug: {
            startBalance,
            currentBalance,
            dailyNetCount: dailyNet.length,
            lastApprovedPayoutDate,
        },
    };
}

function differenceInCalendarDays(fromDate, toDate) {
    const utcFrom = Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate()
    );
    const utcTo = Date.UTC(
        toDate.getUTCFullYear(),
        toDate.getUTCMonth(),
        toDate.getUTCDate()
    );

    return Math.max(0, Math.floor((utcTo - utcFrom) / 86400000));
}

function buildInactivityState({
    rule,
    fillEntries,
    account,
    nowDate,
}) {
    if (!rule || rule.accountPhase !== "pa" || !rule.inactivityRule) {
        return null;
    }

    const dailyNet = buildDailyNetPnl(fillEntries);
    const requiredNetProfitDay = Number(rule.inactivityRule.requiredNetProfitDay);
    const qualifyingDays = dailyNet.filter((day) => day.netPnl >= requiredNetProfitDay);
    const lastQualifyingDay = qualifyingDays.length
        ? qualifyingDays[qualifyingDays.length - 1]
        : null;

    const lifecycleStartDate = getAccountLifecycleStartDate(
        account,
        fillEntries.length ? fillEntries[0].timestamp : null
    );

    const referenceDate =
        lastQualifyingDay?.lastTimestamp || lifecycleStartDate || null;

    const daysSinceReference = referenceDate
        ? differenceInCalendarDays(referenceDate, nowDate)
        : null;

    const daysRemaining =
        daysSinceReference === null
            ? null
            : Math.max(0, rule.inactivityRule.windowCalendarDays - daysSinceReference);

    const violated =
        daysSinceReference !== null &&
        daysSinceReference > rule.inactivityRule.windowCalendarDays;

    const warning =
        !violated &&
        daysRemaining !== null &&
        daysRemaining <= 15;

    return {
        available: true,
        requiredNetProfitDay,
        windowCalendarDays: rule.inactivityRule.windowCalendarDays,
        lastQualifyingTradingDayKey: lastQualifyingDay?.tradingDayKey || null,
        lastQualifyingNetProfit: lastQualifyingDay?.netPnl ?? null,
        referenceDate,
        daysSinceReference,
        daysRemaining,
        violated,
        status: violated ? "red" : warning ? "yellow" : "green",
        basisComplete: Boolean(referenceDate),
        note: rule.inactivityRule.note,
    };
}

export function buildApexRiskSnapshot({
    account = null,
    mode = "",
    accountSize = "",
    balanceHistoryRows = [],
    currentBalance = null,
    currentContracts = null,
    fills = [],
    now = null,
} = {}) {
    const resolvedMode = normalizeMode(mode, account);
    const resolvedAccountSizeNumber = normalizeAccountSizeNumber(accountSize, account);
    const resolvedAccountSizeLabel = formatAccountSizeLabel(resolvedAccountSizeNumber);
    const ruleContext = modeToRuleContext(resolvedMode);
    const rule = getRules(
        ruleContext.productType,
        ruleContext.accountPhase,
        resolvedAccountSizeNumber
    );

    const normalizedEntries = normalizeBalanceHistoryRows(balanceHistoryRows);
    const normalizedFillEntries = normalizeFillRows(fills);
    const nowDate = parseDateValue(now) || new Date();

    const allDailyCloses = getDailyCloses(normalizedEntries);
    const completedDailyCloses = getCompletedDailyCloses(normalizedEntries, nowDate);
    const lastEntry = getLastEntry(normalizedEntries);

    const currentBalanceResolved =
        parseNumber(currentBalance) ?? lastEntry?.balance ?? resolvedAccountSizeNumber;

    const currentContractsResolved =
        parseNumber(currentContracts) ??
        parseNumber(account?.currentContracts) ??
        null;

    const peakIntradayBalance = getMaxBalance(
        normalizedEntries,
        Math.max(resolvedAccountSizeNumber, currentBalanceResolved)
    );

    const peakClosedBalance = getMaxBalance(
        completedDailyCloses,
        resolvedAccountSizeNumber
    );

    const latestCompletedCloseBalance =
        getLastEntry(completedDailyCloses)?.balance ?? resolvedAccountSizeNumber;

    const sessionStartBalance = latestCompletedCloseBalance;
    const sessionPnL = currentBalanceResolved - sessionStartBalance;
    const sessionLoss = Math.max(0, -sessionPnL);

    const maxDrawdown = Number(rule.maxDrawdown.value);
    const evaluationFloor = resolvedAccountSizeNumber - maxDrawdown;

    let referenceBalance = currentBalanceResolved;
    let peakBalance = peakIntradayBalance;
    let thresholdBalance = evaluationFloor;
    let dll = null;
    let maxContracts = null;
    let tier = null;
    let thresholdModel = "intraday";

    if (resolvedMode === APEX_MODES.EVAL_EOD) {
        referenceBalance = latestCompletedCloseBalance;
        peakBalance = peakClosedBalance;
        thresholdBalance = clampFloor(
            peakBalance - maxDrawdown,
            evaluationFloor
        );
        dll = resolveCurrentDailyLossLimit(rule, currentBalanceResolved);
        maxContracts = resolveCurrentMaxContracts(rule, currentBalanceResolved);
        thresholdModel = "eod_close_based";
    }

    if (resolvedMode === APEX_MODES.EVAL_INTRADAY) {
        referenceBalance = currentBalanceResolved;
        peakBalance = peakIntradayBalance;
        thresholdBalance = clampFloor(
            peakBalance - maxDrawdown,
            evaluationFloor
        );
        dll = resolveCurrentDailyLossLimit(rule, currentBalanceResolved);
        maxContracts = resolveCurrentMaxContracts(rule, currentBalanceResolved);
        thresholdModel = "intraday_trailing";
    }

    if (resolvedMode === APEX_MODES.PA_EOD) {
        referenceBalance = latestCompletedCloseBalance;
        peakBalance = peakClosedBalance;
        tier = resolveCurrentPaTier(rule, latestCompletedCloseBalance);
        thresholdBalance = clampFloor(
            peakBalance - maxDrawdown,
            evaluationFloor
        );
        thresholdBalance = Math.min(
            thresholdBalance,
            resolveStaticPaThresholdStop(rule)
        );
        dll = resolveCurrentDailyLossLimit(rule, latestCompletedCloseBalance);
        maxContracts = resolveCurrentMaxContracts(rule, latestCompletedCloseBalance);
        thresholdModel = "eod_close_based_static_at_start_plus_100";
    }

    if (resolvedMode === APEX_MODES.PA_INTRADAY) {
        referenceBalance = currentBalanceResolved;
        peakBalance = peakIntradayBalance;
        tier = resolveCurrentPaTier(rule, latestCompletedCloseBalance);
        thresholdBalance = clampFloor(
            peakBalance - maxDrawdown,
            evaluationFloor
        );
        thresholdBalance = Math.min(
            thresholdBalance,
            resolveStaticPaThresholdStop(rule)
        );
        dll = resolveCurrentDailyLossLimit(rule, latestCompletedCloseBalance);
        maxContracts = resolveCurrentMaxContracts(rule, latestCompletedCloseBalance);
        thresholdModel = "intraday_trailing_static_at_start_plus_100";
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

    const payout = buildPayoutState({
        rule,
        currentBalance: currentBalanceResolved,
        startBalance: resolvedAccountSizeNumber,
        fillEntries: normalizedFillEntries,
        account,
    });

    const inactivity = buildInactivityState({
        rule,
        fillEntries: normalizedFillEntries,
        account,
        nowDate,
    });

    return {
        mode: resolvedMode,
        accountSize: resolvedAccountSizeLabel,
        accountSizeNumber: resolvedAccountSizeNumber,
        productType: rule.productType,
        accountPhase: rule.accountPhase,
        startBalance: resolvedAccountSizeNumber,
        referenceBalance,
        currentBalance: currentBalanceResolved,
        peakBalance,
        thresholdBalance,
        liquidationBalance: thresholdBalance,
        drawdownAmount: maxDrawdown,
        dll,
        sessionStartBalance,
        sessionPnL,
        sessionLoss,
        maxContracts,
        currentContracts: currentContractsResolved,
        distanceToThreshold,
        remainingDll,
        effectiveRiskBudget,
        paStaticThresholdStop: resolveStaticPaThresholdStop(rule),
        payoutSafetyNetBalance: rule.payoutRules?.safetyNet ?? null,
        thresholdModel,
        tier,
        payout,
        inactivity,
        rawRule: rule,
        status,
        debug: {
            entriesLoaded: normalizedEntries.length,
            fillsLoaded: normalizedFillEntries.length,
            dailyClosesLoaded: allDailyCloses.length,
            completedDailyClosesLoaded: completedDailyCloses.length,
            latestCompletedCloseBalance,
            evaluationFloor,
            tradingTimezone: TRADING_TIMEZONE,
        },
    };
}