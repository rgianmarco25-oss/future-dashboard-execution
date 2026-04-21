import { getAccounts, updateAccount } from "./storage";

export const ACCOUNT_RISK_STATUS_EVENT = "account-risk-status-updated";

const EMPTY_FLAGS = Object.freeze({
    threshold: false,
    dll: false,
    exposure: false,
    payout: false,
    inactivity: false,
});

function normalizeLevel(value) {
    const level = String(value || "").trim().toLowerCase();

    if (
        level === "green" ||
        level === "ok" ||
        level === "safe" ||
        level === "clean" ||
        level === "success"
    ) {
        return "green";
    }

    if (
        level === "yellow" ||
        level === "warning" ||
        level === "warn" ||
        level === "critical" ||
        level === "caution"
    ) {
        return "yellow";
    }

    if (
        level === "red" ||
        level === "danger" ||
        level === "alert" ||
        level === "violation" ||
        level === "violated" ||
        level === "error"
    ) {
        return "red";
    }

    return "neutral";
}

function getDefaultLabel(level) {
    if (level === "green") {
        return "Alles sauber";
    }

    if (level === "yellow") {
        return "Kritisch";
    }

    if (level === "red") {
        return "Regel verletzt";
    }

    return "Keine Basis";
}

export function createAccountRiskStatus(input = {}) {
    const level = normalizeLevel(input.level || input.status || input.color);

    return {
        accountId: input.accountId || "",
        level,
        label: input.label || getDefaultLabel(level),
        source: input.source || "risk-panel",
        updatedAt: input.updatedAt || new Date().toISOString(),
        flags: {
            ...EMPTY_FLAGS,
            ...(input.flags || {}),
        },
        meta:
            input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)
                ? input.meta
                : {},
    };
}

export function getRiskStatusForAccount(accountId) {
    if (!accountId) {
        return createAccountRiskStatus();
    }

    const accounts = getAccounts();
    const account = accounts.find((entry) => entry.id === accountId);

    return createAccountRiskStatus({
        accountId,
        ...(account?.riskStatus || {}),
    });
}

export function getRiskStatusesByAccount() {
    const accounts = getAccounts();
    const result = {};

    for (const account of accounts) {
        result[account.id] = createAccountRiskStatus({
            accountId: account.id,
            ...(account?.riskStatus || {}),
        });
    }

    return result;
}

export function saveRiskStatusForAccount(accountId, riskStatus = {}) {
    if (!accountId) {
        return createAccountRiskStatus();
    }

    const nextRiskStatus = createAccountRiskStatus({
        accountId,
        ...riskStatus,
    });

    updateAccount(accountId, {
        riskStatus: nextRiskStatus,
    });

    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent(ACCOUNT_RISK_STATUS_EVENT, {
                detail: {
                    accountId,
                    riskStatus: nextRiskStatus,
                },
            })
        );
    }

    return nextRiskStatus;
}

export function clearRiskStatusForAccount(accountId) {
    return saveRiskStatusForAccount(accountId, {
        level: "neutral",
        label: "Keine Basis",
        flags: EMPTY_FLAGS,
        source: "reset",
        meta: {},
    });
}

export function getRiskBadgeTone(level) {
    return normalizeLevel(level);
}

export function resolveGroupRiskStatus(accounts = []) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return createAccountRiskStatus({
            level: "neutral",
            label: "Keine Basis",
            source: "group",
        });
    }

    let hasYellow = false;
    let hasGreen = false;

    for (const account of accounts) {
        const status = getRiskStatusForAccount(account.id);

        if (status.level === "red") {
            return createAccountRiskStatus({
                level: "red",
                label: "Gruppe verletzt",
                source: "group",
            });
        }

        if (status.level === "yellow") {
            hasYellow = true;
        }

        if (status.level === "green") {
            hasGreen = true;
        }
    }

    if (hasYellow) {
        return createAccountRiskStatus({
            level: "yellow",
            label: "Gruppe kritisch",
            source: "group",
        });
    }

    if (hasGreen) {
        return createAccountRiskStatus({
            level: "green",
            label: "Gruppe sauber",
            source: "group",
        });
    }

    return createAccountRiskStatus({
        level: "neutral",
        label: "Keine Basis",
        source: "group",
    });
}