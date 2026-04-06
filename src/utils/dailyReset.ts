// utils/dailyReset.ts

export type Account = {
    id: string;
    balance: number;
};

export type DailyState = {
    sessionKey: string;
    dailyPnL: number;
    realizedPnL: number;
    unrealizedPnL: number;
    startingBalance: number;
    currentBalance: number;
    stopRiskViolationCount: number;
    lossLimitHit: boolean;
    drawdownHit: boolean;
    stopRiskHit: boolean;
    updatedAt: number;
};

export function createFreshDailyState(
    account: Account,
    sessionKey: string
): DailyState {
    return {
        sessionKey,
        dailyPnL: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        startingBalance: account.balance,
        currentBalance: account.balance,
        stopRiskViolationCount: 0,
        lossLimitHit: false,
        drawdownHit: false,
        stopRiskHit: false,
        updatedAt: Date.now(),
    };
}

export function ensureDailyStateInitialized(
    account: Account,
    existingState: DailyState | undefined,
    sessionKey: string
): DailyState {
    if (existingState) {
        return existingState;
    }

    return createFreshDailyState(account, sessionKey);
}

export function resetDailyValuesForAccount(
    account: Account,
    sessionKey: string
): DailyState {
    return createFreshDailyState(account, sessionKey);
}