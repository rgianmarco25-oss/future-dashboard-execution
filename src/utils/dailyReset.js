import {
    getDailySessionKey,
    getSessionContext,
    shouldResetDailyValues,
} from "./sessionUtils";
import {
    getDailyState,
    saveDailyState,
    saveOrders,
    savePositions,
    getOrders,
    getPositions,
} from "./storage";
import { syncStoredAccountBalance } from "./accountBalance";

function nowIso() {
    return new Date().toISOString();
}

function resetOrderForNewDay(order) {
    if (!order || typeof order !== "object") return order;

    return {
        ...order,
        realizedPnl: "0",
    };
}

function resetPositionForNewDay(position) {
    if (!position || typeof position !== "object") return position;

    return {
        ...position,
        unrealizedPnl: "0",
    };
}

export function buildDailyResetResult({
    account,
    previousDailyState,
    currentSessionKey,
    sessionContext,
}) {
    return {
        accountId: account?.id || "",
        previousSessionKey: previousDailyState?.sessionKey || "",
        currentSessionKey,
        tradingDate: sessionContext.tradingDate,
        resetAt: nowIso(),
    };
}

export function resetDailyValuesForAccount(account) {
    if (!account?.id) {
        return {
            resetPerformed: false,
            reason: "missing_account",
        };
    }

    const accountId = account.id;
    const sessionContext = getSessionContext(account);
    const previousDailyState = getDailyState(accountId);
    const { shouldReset, currentSessionKey } = shouldResetDailyValues(
        previousDailyState?.sessionKey || "",
        account
    );

    if (!shouldReset) {
        return {
            resetPerformed: false,
            reason: "same_session_key",
            currentSessionKey,
            tradingDate: sessionContext.tradingDate,
        };
    }

    const currentOrders = getOrders(accountId) || [];
    const currentPositions = getPositions(accountId) || [];

    const resetOrders = currentOrders.map(resetOrderForNewDay);
    const resetPositions = currentPositions.map(resetPositionForNewDay);

    saveOrders(accountId, resetOrders);
    savePositions(accountId, resetPositions);

    syncStoredAccountBalance(accountId);

    const nextDailyState = {
        sessionKey: currentSessionKey,
        tradingDate: sessionContext.tradingDate,
        lastResetAt: nowIso(),
    };

    saveDailyState(accountId, nextDailyState);

    return {
        resetPerformed: true,
        ...buildDailyResetResult({
            account,
            previousDailyState,
            currentSessionKey,
            sessionContext,
        }),
    };
}

export function ensureDailyStateInitialized(account) {
    if (!account?.id) {
        return {
            initialized: false,
            reason: "missing_account",
        };
    }

    const accountId = account.id;
    const existingDailyState = getDailyState(accountId);

    if (existingDailyState?.sessionKey) {
        return {
            initialized: false,
            reason: "already_initialized",
            sessionKey: existingDailyState.sessionKey,
        };
    }

    const sessionContext = getSessionContext(account);
    const sessionKey = getDailySessionKey(account);

    saveDailyState(accountId, {
        sessionKey,
        tradingDate: sessionContext.tradingDate,
        lastResetAt: "",
    });

    return {
        initialized: true,
        sessionKey,
        tradingDate: sessionContext.tradingDate,
    };
}