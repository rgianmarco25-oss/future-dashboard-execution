const STORAGE_KEY = "tradingAppData";

const DEFAULT_ACCOUNT = {
    id: "",
    productType: "eod",
    accountPhase: "eval",
    accountSize: 0,
    currentBalance: 0,
};

const DEFAULT_RISK = {
    takeProfit: "",
    stopLoss: "",
    breakEven: "",
};

const DEFAULT_DAILY_STATE = {
    sessionKey: "",
    tradingDate: "",
    lastResetAt: "",
    dailyPnL: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    startingBalance: 0,
    currentBalance: 0,
    stopRiskViolationCount: 0,
    lossLimitHit: false,
    drawdownHit: false,
    stopRiskHit: false,
    updatedAt: 0,
};

const DEFAULT_IMPORTED_ACCOUNT_SUMMARY = {
    accountId: "",
    accountName: "",
    resolvedAccountId: "",
    lastTradeDate: "",
    totalAmount: 0,
    totalRealizedPnl: 0,
    lastCashDate: "",
    lastCashTimestamp: "",
    liveBalance: 0,
    cashNetPnl: 0,
    cashTradePnl: 0,
    cashFees: 0,
    startingBalance: 0,
    currency: "",
    updatedAt: "",
};

const defaultData = {
    accounts: [],
    accountProfilesById: {},
    ordersByAccount: {},
    positionsByAccount: {},
    riskByAccount: {},
    journalByAccount: {},
    dailyStateByAccount: {},
    accountBalanceHistoryByAccount: {},
    cashHistoryByAccount: {},
    importedAccountSummaryByAccount: {},
};

const storageListeners = new Set();
let storageVersion = 0;

function emitStorageChange() {
    storageVersion += 1;
    storageListeners.forEach((listener) => listener());
}

export function subscribeStorage(listener) {
    storageListeners.add(listener);
    return () => {
        storageListeners.delete(listener);
    };
}

export function getStorageVersion() {
    return storageVersion;
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeAccountId(value) {
    return normalizeText(value).toUpperCase();
}

function normalizeHeader(value) {
    return normalizeText(value)
        .replace(/^\uFEFF/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function getLooseValue(row, aliases) {
    if (!row || typeof row !== "object" || !Array.isArray(aliases)) {
        return "";
    }

    const normalizedAliases = aliases.map(normalizeHeader);

    for (const [key, value] of Object.entries(row)) {
        if (normalizedAliases.includes(normalizeHeader(key))) {
            return normalizeText(value);
        }
    }

    return "";
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value, fallback = 0) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    const raw = normalizeText(value);

    if (!raw) {
        return fallback;
    }

    const negative = raw.includes("(") && raw.includes(")");
    let cleaned = raw
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/[()]/g, "")
        .replace(/−/g, "-")
        .replace(/–/g, "-");

    if (cleaned.includes(",") && cleaned.includes(".")) {
        cleaned = cleaned.replace(/,/g, "");
    } else if (cleaned.includes(",") && !cleaned.includes(".")) {
        cleaned = cleaned.replace(/,/g, ".");
    }

    const parsed = Number(cleaned);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return negative ? -Math.abs(parsed) : parsed;
}

function getTodayParts(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return {
        year,
        month: month < 10 ? `0${month}` : String(month),
        day: day < 10 ? `0${day}` : String(day),
    };
}

export function getSessionKey(date = new Date()) {
    const parts = getTodayParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTradingDate(date = new Date()) {
    const parts = getTodayParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function getNowIso() {
    return new Date().toISOString();
}

function getAccountBalance(account) {
    return toNumber(account?.currentBalance, DEFAULT_ACCOUNT.currentBalance);
}

function inferAllowedAccountSize(value, fallback = DEFAULT_ACCOUNT.accountSize) {
    const numericValue = toMoney(value, 0);
    const allowed = [25000, 50000, 100000, 150000];

    if (!numericValue) {
        return fallback;
    }

    let closest = allowed[0];
    let smallestDistance = Math.abs(numericValue - closest);

    for (const size of allowed) {
        const distance = Math.abs(numericValue - size);

        if (distance < smallestDistance) {
            smallestDistance = distance;
            closest = size;
        }
    }

    return closest;
}

export function createFreshDailyState(account, sessionKey = getSessionKey()) {
    const balance = getAccountBalance(account);

    return {
        ...DEFAULT_DAILY_STATE,
        sessionKey,
        tradingDate: sessionKey,
        lastResetAt: getNowIso(),
        dailyPnL: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        startingBalance: balance,
        currentBalance: balance,
        stopRiskViolationCount: 0,
        lossLimitHit: false,
        drawdownHit: false,
        stopRiskHit: false,
        updatedAt: Date.now(),
    };
}

export function ensureDailyStateInitialized(accountId) {
    const data = readStorage();
    const safeAccountId = normalizeAccountId(accountId);
    const account = data.accounts.find((item) => item.id === safeAccountId);

    if (!account) {
        return null;
    }

    const existingState = normalizeDailyState(data.dailyStateByAccount[safeAccountId]);

    if (existingState.sessionKey) {
        return existingState;
    }

    const freshState = createFreshDailyState(account);
    data.dailyStateByAccount[safeAccountId] = freshState;
    writeStorage(data);

    return freshState;
}

export function resetDailyValuesForAccount(accountId) {
    const data = readStorage();
    const safeAccountId = normalizeAccountId(accountId);
    const account = data.accounts.find((item) => item.id === safeAccountId);

    if (!account) {
        return null;
    }

    const freshState = createFreshDailyState(account);
    data.dailyStateByAccount[safeAccountId] = freshState;
    writeStorage(data);

    return freshState;
}

export function syncDailyBalanceFromAccount(accountId) {
    const data = readStorage();
    const safeAccountId = normalizeAccountId(accountId);
    const account = data.accounts.find((item) => item.id === safeAccountId);
    const existingState = normalizeDailyState(data.dailyStateByAccount[safeAccountId]);

    if (!account) {
        return null;
    }

    const balance = getAccountBalance(account);

    const nextState = {
        ...existingState,
        sessionKey: existingState.sessionKey || getSessionKey(),
        tradingDate: existingState.tradingDate || getTradingDate(),
        startingBalance: balance,
        currentBalance: balance,
        updatedAt: Date.now(),
    };

    data.dailyStateByAccount[safeAccountId] = nextState;
    writeStorage(data);

    return nextState;
}

function normalizeAccount(account) {
    if (!account) {
        return { ...DEFAULT_ACCOUNT };
    }

    if (typeof account === "string") {
        return {
            ...DEFAULT_ACCOUNT,
            id: normalizeAccountId(account),
        };
    }

    return {
        ...DEFAULT_ACCOUNT,
        ...account,
        id: normalizeAccountId(account.id || ""),
        productType: account.productType === "intraday" ? "intraday" : "eod",
        accountPhase: account.accountPhase === "pa" ? "pa" : "eval",
        accountSize: [0, 25000, 50000, 100000, 150000].includes(Number(account.accountSize))
            ? Number(account.accountSize)
            : DEFAULT_ACCOUNT.accountSize,
        currentBalance: toMoney(account.currentBalance, DEFAULT_ACCOUNT.currentBalance),
    };
}

function normalizeAccounts(accounts) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return [];
    }

    const normalized = accounts
        .map(normalizeAccount)
        .filter((account) => account.id);

    if (normalized.length === 0) {
        return [];
    }

    const unique = [];
    const seen = new Set();

    for (const account of normalized) {
        if (!seen.has(account.id)) {
            seen.add(account.id);
            unique.push(account);
        }
    }

    return unique;
}

function normalizeRisk(risk) {
    if (!risk || typeof risk !== "object") {
        return { ...DEFAULT_RISK };
    }

    return {
        ...DEFAULT_RISK,
        ...risk,
        takeProfit: risk.takeProfit ?? "",
        stopLoss: risk.stopLoss ?? "",
        breakEven: risk.breakEven ?? "",
    };
}

function normalizeDailyState(dailyState) {
    if (!dailyState || typeof dailyState !== "object") {
        return { ...DEFAULT_DAILY_STATE };
    }

    return {
        ...DEFAULT_DAILY_STATE,
        ...dailyState,
        sessionKey: String(dailyState.sessionKey ?? ""),
        tradingDate: String(dailyState.tradingDate ?? ""),
        lastResetAt: String(dailyState.lastResetAt ?? ""),
        dailyPnL: toNumber(dailyState.dailyPnL, 0),
        realizedPnL: toNumber(dailyState.realizedPnL, 0),
        unrealizedPnL: toNumber(dailyState.unrealizedPnL, 0),
        startingBalance: toNumber(dailyState.startingBalance, 0),
        currentBalance: toNumber(dailyState.currentBalance, 0),
        stopRiskViolationCount: toNumber(dailyState.stopRiskViolationCount, 0),
        lossLimitHit: Boolean(dailyState.lossLimitHit),
        drawdownHit: Boolean(dailyState.drawdownHit),
        stopRiskHit: Boolean(dailyState.stopRiskHit),
        updatedAt: toNumber(dailyState.updatedAt, 0),
    };
}

function normalizeImportedAccountSummary(summary) {
    if (!summary || typeof summary !== "object") {
        return { ...DEFAULT_IMPORTED_ACCOUNT_SUMMARY };
    }

    return {
        ...DEFAULT_IMPORTED_ACCOUNT_SUMMARY,
        ...summary,
        accountId: normalizeText(summary.accountId),
        accountName: normalizeText(summary.accountName),
        resolvedAccountId: normalizeAccountId(summary.resolvedAccountId),
        lastTradeDate: normalizeText(summary.lastTradeDate),
        totalAmount: toMoney(summary.totalAmount, 0),
        totalRealizedPnl: toMoney(summary.totalRealizedPnl, 0),
        lastCashDate: normalizeText(summary.lastCashDate),
        lastCashTimestamp: normalizeText(summary.lastCashTimestamp),
        liveBalance: toMoney(summary.liveBalance, 0),
        cashNetPnl: toMoney(summary.cashNetPnl, 0),
        cashTradePnl: toMoney(summary.cashTradePnl, 0),
        cashFees: toMoney(summary.cashFees, 0),
        startingBalance: toMoney(summary.startingBalance, 0),
        currency: normalizeText(summary.currency),
        updatedAt: normalizeText(summary.updatedAt),
    };
}

function normalizeAccountBalanceHistoryRow(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const accountId = getLooseValue(row, ["Account ID", "AccountId", "AccountID"]);
    const accountName = getLooseValue(row, ["Account Name", "AccountName", "Account"]);
    const resolvedAccountId = normalizeAccountId(accountName || accountId);

    if (!resolvedAccountId) {
        return null;
    }

    return {
        accountId,
        accountName,
        resolvedAccountId,
        tradeDate: getLooseValue(row, ["Trade Date", "TradeDate", "Date"]),
        totalAmount: toMoney(getLooseValue(row, ["Total Amount", "TotalAmount", "Amount"]), 0),
        totalRealizedPnl: toMoney(
            getLooseValue(row, ["Total Realized PNL", "TotalRealizedPNL", "Realized PNL", "RealizedPnL"]),
            0
        ),
    };
}

function normalizeAccountBalanceHistoryRows(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map(normalizeAccountBalanceHistoryRow)
        .filter(Boolean);
}

function normalizeCashHistoryRow(row) {
    if (!row || typeof row !== "object") {
        return null;
    }

    const accountName = getLooseValue(row, ["Account", "Account Name", "AccountName"]);
    const resolvedAccountId = normalizeAccountId(accountName);

    if (!resolvedAccountId) {
        return null;
    }

    return {
        accountName,
        resolvedAccountId,
        transactionId: getLooseValue(row, ["Transaction ID", "TransactionID"]),
        timestamp: getLooseValue(row, ["Timestamp"]),
        date: getLooseValue(row, ["Date"]),
        delta: toMoney(getLooseValue(row, ["Delta"]), 0),
        amount: toMoney(getLooseValue(row, ["Amount", "Balance"]), 0),
        cashChangeType: getLooseValue(row, ["Cash Change Type", "CashChangeType", "Type"]),
        currency: getLooseValue(row, ["Currency"]),
        contract: getLooseValue(row, ["Contract", "Symbol"]),
    };
}

function normalizeCashHistoryRows(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map(normalizeCashHistoryRow)
        .filter(Boolean);
}

function buildSummaryFromAccountBalanceHistory(rows) {
    const normalizedRows = normalizeAccountBalanceHistoryRows(rows);

    if (normalizedRows.length === 0) {
        return null;
    }

    const lastRow = normalizedRows[normalizedRows.length - 1];

    return normalizeImportedAccountSummary({
        accountId: lastRow.accountId,
        accountName: lastRow.accountName,
        resolvedAccountId: lastRow.resolvedAccountId,
        lastTradeDate: lastRow.tradeDate,
        totalAmount: lastRow.totalAmount,
        totalRealizedPnl: lastRow.totalRealizedPnl,
        liveBalance: lastRow.totalAmount,
        updatedAt: getNowIso(),
    });
}

function buildSummaryFromCashHistory(rows) {
    const normalizedRows = normalizeCashHistoryRows(rows);

    if (normalizedRows.length === 0) {
        return null;
    }

    const firstFundRow = normalizedRows.find((row) =>
        normalizeText(row.cashChangeType).toLowerCase().includes("fund transaction")
    );

    const lastRow = normalizedRows[normalizedRows.length - 1];

    let cashFees = 0;
    let cashTradePnl = 0;
    let cashNetPnl = 0;

    normalizedRows.forEach((row) => {
        const type = normalizeText(row.cashChangeType).toLowerCase();

        if (type.includes("commission") || type.includes("fee")) {
            cashFees += row.delta;
        }

        if (type.includes("trade paired")) {
            cashTradePnl += row.delta;
        }

        if (!type.includes("fund transaction")) {
            cashNetPnl += row.delta;
        }
    });

    return normalizeImportedAccountSummary({
        accountName: lastRow.accountName,
        resolvedAccountId: lastRow.resolvedAccountId,
        lastCashDate: lastRow.date,
        lastCashTimestamp: lastRow.timestamp,
        liveBalance: lastRow.amount,
        cashNetPnl,
        cashTradePnl,
        cashFees,
        startingBalance: firstFundRow ? firstFundRow.amount : 0,
        currency: lastRow.currency,
        updatedAt: getNowIso(),
    });
}

function mergeImportedSummaries(...summaries) {
    return normalizeImportedAccountSummary(
        summaries.reduce((accumulator, item) => {
            if (!item) {
                return accumulator;
            }

            return {
                ...accumulator,
                ...item,
                accountId: item.accountId || accumulator.accountId,
                accountName: item.accountName || accumulator.accountName,
                resolvedAccountId: item.resolvedAccountId || accumulator.resolvedAccountId,
                lastTradeDate: item.lastTradeDate || accumulator.lastTradeDate,
                lastCashDate: item.lastCashDate || accumulator.lastCashDate,
                lastCashTimestamp: item.lastCashTimestamp || accumulator.lastCashTimestamp,
                currency: item.currency || accumulator.currency,
                updatedAt: item.updatedAt || accumulator.updatedAt,
            };
        }, {})
    );
}

function getLatestKnownBalance(summary, fallback = 0) {
    const safeSummary = normalizeImportedAccountSummary(summary);

    if (safeSummary.liveBalance) {
        return safeSummary.liveBalance;
    }

    if (safeSummary.totalAmount) {
        return safeSummary.totalAmount;
    }

    return fallback;
}

function upsertAccountInData(data, accountInput, updates = {}) {
    const normalizedInput =
        typeof accountInput === "string"
            ? normalizeAccount({ id: accountInput, ...updates })
            : normalizeAccount({ ...accountInput, ...updates });

    if (!normalizedInput.id) {
        return null;
    }

    const existingIndex = data.accounts.findIndex((account) => account.id === normalizedInput.id);

    if (existingIndex >= 0) {
        data.accounts[existingIndex] = normalizeAccount({
            ...data.accounts[existingIndex],
            ...updates,
            id: normalizedInput.id,
        });

        return data.accounts[existingIndex];
    }

    data.accounts.push(normalizedInput);
    return normalizedInput;
}

function applyImportedSummaryToAccountData(data, summaryInput) {
    const summary = normalizeImportedAccountSummary(summaryInput);

    if (!summary.resolvedAccountId) {
        return null;
    }

    const existingAccount =
        data.accounts.find((account) => account.id === summary.resolvedAccountId) || null;

    const nextBalance = getLatestKnownBalance(summary, existingAccount?.currentBalance || 0);

    const sizeSeed =
        summary.startingBalance ||
        summary.totalAmount ||
        nextBalance ||
        existingAccount?.accountSize ||
        DEFAULT_ACCOUNT.accountSize;

    const inferredAccountSize = inferAllowedAccountSize(
        sizeSeed,
        existingAccount?.accountSize || DEFAULT_ACCOUNT.accountSize
    );

    return upsertAccountInData(data, summary.resolvedAccountId, {
        currentBalance:
            nextBalance ||
            existingAccount?.currentBalance ||
            DEFAULT_ACCOUNT.currentBalance,
        accountSize: inferredAccountSize,
    });
}

function readStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return {
                ...defaultData,
                accounts: [],
            };
        }

        const parsed = JSON.parse(raw);

        return {
            ...defaultData,
            ...parsed,
            accounts: normalizeAccounts(parsed?.accounts),
            accountProfilesById: parsed?.accountProfilesById || {},
            ordersByAccount: parsed?.ordersByAccount || {},
            positionsByAccount: parsed?.positionsByAccount || {},
            riskByAccount: parsed?.riskByAccount || {},
            journalByAccount: parsed?.journalByAccount || {},
            dailyStateByAccount: parsed?.dailyStateByAccount || {},
            accountBalanceHistoryByAccount: parsed?.accountBalanceHistoryByAccount || {},
            cashHistoryByAccount: parsed?.cashHistoryByAccount || {},
            importedAccountSummaryByAccount: parsed?.importedAccountSummaryByAccount || {},
        };
    } catch {
        return {
            ...defaultData,
            accounts: [],
        };
    }
}

function writeStorage(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    emitStorageChange();
}

export function getAccounts() {
    return readStorage().accounts;
}

export function getAccountById(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    return data.accounts.find((account) => account.id === safeAccountId) || null;
}

export function addAccount(accountInput) {
    const data = readStorage();

    const newAccount =
        typeof accountInput === "string"
            ? normalizeAccount({ id: accountInput })
            : normalizeAccount(accountInput);

    if (!newAccount.id) {
        return data.accounts;
    }

    const exists = data.accounts.some((account) => account.id === newAccount.id);

    if (!exists) {
        data.accounts.push(newAccount);
        writeStorage(data);
    }

    return data.accounts;
}

export function upsertDetectedAccount(detectedAccount) {
    const data = readStorage();

    const accountName = normalizeText(detectedAccount?.accountName);
    const accountId = normalizeText(detectedAccount?.accountId);
    const resolvedAccountId = normalizeAccountId(
        detectedAccount?.resolvedAccountId || accountName || accountId
    );

    if (!resolvedAccountId) {
        return null;
    }

    const existingSummary = normalizeImportedAccountSummary(
        data.importedAccountSummaryByAccount[resolvedAccountId]
    );

    const nextSummary = mergeImportedSummaries(existingSummary, {
        accountId,
        accountName,
        resolvedAccountId,
        updatedAt: getNowIso(),
    });

    data.importedAccountSummaryByAccount[resolvedAccountId] = nextSummary;
    applyImportedSummaryToAccountData(data, nextSummary);
    writeStorage(data);

    return getAccountById(resolvedAccountId);
}

export function updateAccount(accountId, updates) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();

    data.accounts = data.accounts.map((account) => {
        if (account.id !== safeAccountId) {
            return account;
        }

        return normalizeAccount({
            ...account,
            ...updates,
            id: account.id,
        });
    });

    writeStorage(data);
    return data.accounts;
}

export function deleteAccount(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();

    data.accounts = data.accounts.filter((account) => account.id !== safeAccountId);

    delete data.accountProfilesById[safeAccountId];
    delete data.ordersByAccount[safeAccountId];
    delete data.positionsByAccount[safeAccountId];
    delete data.riskByAccount[safeAccountId];
    delete data.journalByAccount[safeAccountId];
    delete data.dailyStateByAccount[safeAccountId];
    delete data.accountBalanceHistoryByAccount[safeAccountId];
    delete data.cashHistoryByAccount[safeAccountId];
    delete data.importedAccountSummaryByAccount[safeAccountId];

    writeStorage(data);
    return data.accounts;
}

export function getAccountProfile(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return readStorage().accountProfilesById[safeAccountId] || null;
}

export function saveAccountProfile(accountId, profile) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    data.accountProfilesById[safeAccountId] = profile;
    writeStorage(data);
}

export function getOrders(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return readStorage().ordersByAccount[safeAccountId] || [];
}

export function saveOrders(accountId, orders) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    data.ordersByAccount[safeAccountId] = Array.isArray(orders) ? orders : [];
    writeStorage(data);
}

export function getPositions(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return readStorage().positionsByAccount[safeAccountId] || [];
}

export function savePositions(accountId, positions) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    data.positionsByAccount[safeAccountId] = Array.isArray(positions) ? positions : [];
    writeStorage(data);
}

export function getRisk(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return normalizeRisk(readStorage().riskByAccount[safeAccountId]);
}

export function saveRisk(accountId, risk) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    data.riskByAccount[safeAccountId] = normalizeRisk(risk);
    writeStorage(data);
}

export function getJournal(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return readStorage().journalByAccount[safeAccountId] || [];
}

export function saveJournal(accountId, entries) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    data.journalByAccount[safeAccountId] = Array.isArray(entries) ? entries : [];
    writeStorage(data);
}

export function getDailyState(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return normalizeDailyState(readStorage().dailyStateByAccount[safeAccountId]);
}

export function saveDailyState(accountId, dailyState) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    data.dailyStateByAccount[safeAccountId] = normalizeDailyState(dailyState);
    writeStorage(data);
}

export function clearDailyState(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    delete data.dailyStateByAccount[safeAccountId];
    writeStorage(data);
}

export function getAccountBalanceHistory(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return normalizeAccountBalanceHistoryRows(
        readStorage().accountBalanceHistoryByAccount[safeAccountId]
    );
}

export function saveAccountBalanceHistory(accountId, rows) {
    const data = readStorage();
    const normalizedRows = normalizeAccountBalanceHistoryRows(rows);

    if (normalizedRows.length === 0) {
        return [];
    }

    const resolvedAccountId = normalizeAccountId(
        accountId || normalizedRows[0]?.resolvedAccountId
    );

    if (!resolvedAccountId) {
        return [];
    }

    data.accountBalanceHistoryByAccount[resolvedAccountId] = normalizedRows;

    const existingSummary = normalizeImportedAccountSummary(
        data.importedAccountSummaryByAccount[resolvedAccountId]
    );

    const builtSummary = buildSummaryFromAccountBalanceHistory(normalizedRows);

    const nextSummary = mergeImportedSummaries(
        existingSummary,
        builtSummary,
        { resolvedAccountId, updatedAt: getNowIso() }
    );

    data.importedAccountSummaryByAccount[resolvedAccountId] = nextSummary;

    const lastRow = normalizedRows[normalizedRows.length - 1];
    const forcedAccountSize = inferAllowedAccountSize(
        lastRow?.totalAmount,
        DEFAULT_ACCOUNT.accountSize
    );

    upsertAccountInData(data, resolvedAccountId, {
        accountSize: forcedAccountSize,
        currentBalance: toMoney(lastRow?.totalAmount, DEFAULT_ACCOUNT.currentBalance),
    });

    writeStorage(data);

    return normalizedRows;
}

export function clearAccountBalanceHistory(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    delete data.accountBalanceHistoryByAccount[safeAccountId];
    writeStorage(data);
}

export function getCashHistory(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return normalizeCashHistoryRows(readStorage().cashHistoryByAccount[safeAccountId]);
}

export function saveCashHistory(accountId, rows) {
    const data = readStorage();
    const normalizedRows = normalizeCashHistoryRows(rows);

    if (normalizedRows.length === 0) {
        return [];
    }

    const resolvedAccountId = normalizeAccountId(
        accountId || normalizedRows[0]?.resolvedAccountId
    );

    if (!resolvedAccountId) {
        return [];
    }

    data.cashHistoryByAccount[resolvedAccountId] = normalizedRows;

    const existingSummary = normalizeImportedAccountSummary(
        data.importedAccountSummaryByAccount[resolvedAccountId]
    );

    const builtSummary = buildSummaryFromCashHistory(normalizedRows);

    const nextSummary = mergeImportedSummaries(
        existingSummary,
        builtSummary,
        { resolvedAccountId, updatedAt: getNowIso() }
    );

    data.importedAccountSummaryByAccount[resolvedAccountId] = nextSummary;

    const firstFundRow = normalizedRows.find((row) =>
        normalizeText(row.cashChangeType).toLowerCase().includes("fund transaction")
    );

    const lastRow = normalizedRows[normalizedRows.length - 1];

    const sizeSeed =
        firstFundRow?.amount ||
        lastRow?.amount ||
        DEFAULT_ACCOUNT.accountSize;

    const forcedAccountSize = inferAllowedAccountSize(
        sizeSeed,
        DEFAULT_ACCOUNT.accountSize
    );

    upsertAccountInData(data, resolvedAccountId, {
        accountSize: forcedAccountSize,
        currentBalance: toMoney(lastRow?.amount, DEFAULT_ACCOUNT.currentBalance),
    });

    writeStorage(data);

    return normalizedRows;
}

export function clearCashHistory(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();
    delete data.cashHistoryByAccount[safeAccountId];
    writeStorage(data);
}

export function getImportedAccountSummary(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    return normalizeImportedAccountSummary(
        readStorage().importedAccountSummaryByAccount[safeAccountId]
    );
}

export function saveImportedAccountSummary(accountId, summary) {
    const safeAccountId = normalizeAccountId(accountId);
    const data = readStorage();

    const existingSummary = normalizeImportedAccountSummary(
        data.importedAccountSummaryByAccount[safeAccountId]
    );

    const nextSummary = mergeImportedSummaries(existingSummary, {
        ...summary,
        resolvedAccountId: safeAccountId,
        updatedAt: getNowIso(),
    });

    data.importedAccountSummaryByAccount[safeAccountId] = nextSummary;
    applyImportedSummaryToAccountData(data, nextSummary);
    writeStorage(data);

    return nextSummary;
}

export function getLiveAccountSnapshot(accountId) {
    const safeAccountId = normalizeAccountId(accountId);
    const summary = getImportedAccountSummary(safeAccountId);
    const account = getAccountById(safeAccountId);

    return {
        accountId: safeAccountId,
        accountName: summary.accountName || safeAccountId,
        numericAccountId: summary.accountId || "",
        tradeDate: summary.lastTradeDate || "",
        cashDate: summary.lastCashDate || "",
        cashTimestamp: summary.lastCashTimestamp || "",
        startingBalance: summary.startingBalance || account?.accountSize || 0,
        realizedPnl: summary.totalRealizedPnl || summary.cashNetPnl || 0,
        tradePnl: summary.cashTradePnl || 0,
        fees: summary.cashFees || 0,
        totalAmount: summary.totalAmount || 0,
        liveBalance: getLatestKnownBalance(summary, account?.currentBalance || 0),
        currentBalance: account?.currentBalance || 0,
        currency: summary.currency || "USD",
        hasImportedData: Boolean(
            summary.lastTradeDate ||
            summary.lastCashDate ||
            summary.totalAmount ||
            summary.liveBalance ||
            summary.totalRealizedPnl ||
            summary.cashNetPnl
        ),
    };
}