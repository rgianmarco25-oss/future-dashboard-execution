import { getAccountById, getOrders, getPositions, updateAccount } from "./storage";

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isCancelledOrder(order) {
    return String(order?.status || "").toLowerCase() === "cancelled";
}

function isClosedPosition(position) {
    return String(position?.status || "").toLowerCase() === "closed";
}

function readRealizedPnlFromOrder(order) {
    if (!order || typeof order !== "object") return 0;
    if (isCancelledOrder(order)) return 0;

    const candidates = [
        order.realizedPnl,
        order.realizedPnL,
        order.pnl,
        order.netPnl,
        order.netPnL,
        order.profit,
        order.result,
    ];

    for (const value of candidates) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function readUnrealizedPnlFromPosition(position) {
    if (!position || typeof position !== "object") return 0;
    if (isClosedPosition(position)) return 0;

    const candidates = [
        position.unrealizedPnl,
        position.unrealizedPnL,
        position.openPnl,
        position.openPnL,
        position.pnl,
        position.netPnl,
        position.netPnL,
        position.profit,
    ];

    for (const value of candidates) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function readPlannedStopFromOrder(order) {
    if (!order || typeof order !== "object") return 0;
    if (isCancelledOrder(order)) return 0;

    const candidates = [
        order.stopLoss,
        order.stop,
        order.risk,
        order.plannedStop,
    ];

    for (const value of candidates) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

export function getStartingBalanceForAccount(account) {
    if (!account) return 0;
    return toNumber(account.accountSize);
}

export function getRealizedPnlTotal(accountId) {
    const orders = getOrders(accountId) || [];

    return orders.reduce((sum, order) => {
        return sum + readRealizedPnlFromOrder(order);
    }, 0);
}

export function getUnrealizedPnlTotal(accountId) {
    const positions = getPositions(accountId) || [];

    return positions.reduce((sum, position) => {
        return sum + readUnrealizedPnlFromPosition(position);
    }, 0);
}

export function getPlannedStopTotal(accountId) {
    const orders = getOrders(accountId) || [];

    return orders.reduce((sum, order) => {
        return sum + readPlannedStopFromOrder(order);
    }, 0);
}

export function calculateRealizedBalance(accountId) {
    const account = getAccountById(accountId);
    if (!account) return 0;

    const startingBalance = getStartingBalanceForAccount(account);
    const realizedPnlTotal = getRealizedPnlTotal(accountId);

    return startingBalance + realizedPnlTotal;
}

export function calculateLiveBalance(accountId) {
    const account = getAccountById(accountId);
    if (!account) return 0;

    const realizedBalance = calculateRealizedBalance(accountId);
    const unrealizedPnlTotal = getUnrealizedPnlTotal(accountId);

    return realizedBalance + unrealizedPnlTotal;
}

export function syncStoredAccountBalance(accountId) {
    const account = getAccountById(accountId);
    if (!account) return 0;

    const liveBalance = calculateLiveBalance(accountId);

    updateAccount(accountId, {
        currentBalance: liveBalance,
    });

    return liveBalance;
}

export function getAccountBalanceSnapshot(accountId) {
    const account = getAccountById(accountId);
    if (!account) {
        return {
            startingBalance: 0,
            realizedBalance: 0,
            liveBalance: 0,
            realizedPnl: 0,
            unrealizedPnl: 0,
            plannedStop: 0,
        };
    }

    const startingBalance = getStartingBalanceForAccount(account);
    const realizedPnl = getRealizedPnlTotal(accountId);
    const unrealizedPnl = getUnrealizedPnlTotal(accountId);
    const plannedStop = getPlannedStopTotal(accountId);

    const realizedBalance = startingBalance + realizedPnl;
    const liveBalance = realizedBalance + unrealizedPnl;

    return {
        startingBalance,
        realizedBalance,
        liveBalance,
        realizedPnl,
        unrealizedPnl,
        plannedStop,
    };
}