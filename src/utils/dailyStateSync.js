import { getAccountBalanceSnapshot } from "./accountBalance";
import { getDailyState, getOrders, saveDailyState } from "./storage";

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizeSide(value) {
    const side = String(value || "").toLowerCase();

    if (side === "sell" || side === "short") {
        return "short";
    }

    return "long";
}

function isCancelled(order) {
    return String(order?.status || "").toLowerCase() === "cancelled";
}

function isOpenOrder(order) {
    return String(order?.status || "").toLowerCase() === "open";
}

function isInvalidStopRiskOrder(order) {
    if (isCancelled(order) || !isOpenOrder(order)) {
        return false;
    }

    if (!hasValue(order?.stopLoss)) {
        return true;
    }

    if (!hasValue(order?.entry)) {
        return false;
    }

    const entry = toNumber(order.entry, 0);
    const stopLoss = toNumber(order.stopLoss, 0);
    const side = normalizeSide(order.side);

    if (entry === stopLoss) {
        return true;
    }

    if (side === "long") {
        return stopLoss >= entry;
    }

    return stopLoss <= entry;
}

function getStopRiskViolationCount(accountId) {
    const orders = getOrders(accountId);

    if (!Array.isArray(orders) || orders.length === 0) {
        return 0;
    }

    return orders.reduce((count, order) => {
        return count + (isInvalidStopRiskOrder(order) ? 1 : 0);
    }, 0);
}

function hasSameDailyValues(currentState, balanceSnapshot, stopRiskViolationCount) {
    const currentRealized = toNumber(currentState?.realizedPnL, 0);
    const currentUnrealized = toNumber(currentState?.unrealizedPnL, 0);
    const currentBalance = toNumber(currentState?.currentBalance, 0);
    const currentDailyPnl = toNumber(currentState?.dailyPnL, 0);
    const currentStopRiskViolationCount = toNumber(
        currentState?.stopRiskViolationCount,
        0
    );

    const nextRealized = toNumber(balanceSnapshot?.realizedPnl, 0);
    const nextUnrealized = toNumber(balanceSnapshot?.unrealizedPnl, 0);
    const nextBalance = toNumber(balanceSnapshot?.liveBalance, 0);
    const nextDailyPnl = nextRealized + nextUnrealized;

    return (
        currentRealized === nextRealized &&
        currentUnrealized === nextUnrealized &&
        currentBalance === nextBalance &&
        currentDailyPnl === nextDailyPnl &&
        currentStopRiskViolationCount === toNumber(stopRiskViolationCount, 0)
    );
}

export function syncDailyStateFromBalance(accountId) {
    if (!accountId) {
        return null;
    }

    const dailyState = getDailyState(accountId);
    const balance = getAccountBalanceSnapshot(accountId);
    const stopRiskViolationCount = getStopRiskViolationCount(accountId);

    if (!dailyState || !balance) {
        return null;
    }

    if (hasSameDailyValues(dailyState, balance, stopRiskViolationCount)) {
        return dailyState;
    }

    const realizedPnL = toNumber(balance.realizedPnl, 0);
    const unrealizedPnL = toNumber(balance.unrealizedPnl, 0);
    const currentBalance = toNumber(balance.liveBalance, 0);
    const dailyPnL = realizedPnL + unrealizedPnL;

    const updatedState = {
        ...dailyState,
        realizedPnL,
        unrealizedPnL,
        dailyPnL,
        currentBalance,
        stopRiskViolationCount: toNumber(stopRiskViolationCount, 0),
        updatedAt: Date.now(),
    };

    saveDailyState(accountId, updatedState);
    return updatedState;
}