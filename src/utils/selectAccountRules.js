import {
    getRulesForAccount,
    resolveCurrentMaxContracts,
    resolveCurrentDailyLossLimit,
    resolveDrawdownFloor,
    resolveCurrentPaTier,
} from "./apexRules";

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function selectAccountRules(account) {
    const rules = getRulesForAccount(account);

    if (!account || !rules) {
        return {
            rules: null,
            currentBalance: 0,
            drawdownFloor: null,
            dailyLossLimit: null,
            maxContracts: null,
            paTier: null,
        };
    }

    const currentBalance = toNumber(account.currentBalance);

    return {
        rules,
        currentBalance,
        drawdownFloor: resolveDrawdownFloor(rules, account),
        dailyLossLimit: resolveCurrentDailyLossLimit(rules, currentBalance),
        maxContracts: resolveCurrentMaxContracts(rules, currentBalance),
        paTier: resolveCurrentPaTier(rules, currentBalance),
    };
}

export function selectResolvedRuleValues(account) {
    const selected = selectAccountRules(account);

    return {
        drawdownFloor: selected.drawdownFloor,
        dailyLossLimit: selected.dailyLossLimit,
        maxContracts: selected.maxContracts,
        paTier: selected.paTier,
        currentBalance: selected.currentBalance,
    };
}