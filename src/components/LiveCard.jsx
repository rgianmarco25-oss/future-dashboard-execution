import { useEffect, useState } from "react";
import {
    getAccountById,
    getAccountProfile,
    getLiveAccountSnapshot,
} from "../utils/storage";
import * as csvImportUtils from "../utils/csvImportUtils";

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    label: "#94a3b8",
    neutral: "#dbeafe",
    cyan: "#22d3ee",
    orange: "#fb923c",
    cardBg: "rgba(255, 255, 255, 0.03)",
};

const wrapperStyle = {
    width: "100%",
};

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 12,
    width: "100%",
};

const cardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "18px",
    padding: "12px",
    background: COLORS.cardBg,
    textAlign: "center",
    minHeight: "88px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
};

const labelStyle = {
    color: COLORS.label,
    fontSize: "12px",
    marginBottom: "7px",
    lineHeight: 1.25,
};

const valueBaseStyle = {
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: 1.3,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
};

function hasValue(value) {
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === "string" && value.trim() === "") {
        return false;
    }

    return true;
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (!hasValue(value)) {
        return null;
    }

    let text = String(value)
        .trim()
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "");

    if (!text) {
        return null;
    }

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    if (hasComma && hasDot) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    } else if (hasComma && !hasDot) {
        const lastPart = text.split(",").pop() || "";

        if (lastPart.length === 1 || lastPart.length === 2) {
            text = text.replace(/,/g, ".");
        } else {
            text = text.replace(/,/g, "");
        }
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}

function getValueColor(value) {
    const numericValue = parseFlexibleNumber(value);

    if (numericValue !== null) {
        if (numericValue > 0) {
            return COLORS.cyan;
        }

        if (numericValue < 0) {
            return COLORS.orange;
        }
    }

    return COLORS.neutral;
}

function getValueStyle(value, variant = "neutral") {
    if (variant === "dynamic") {
        return {
            ...valueBaseStyle,
            color: getValueColor(value),
        };
    }

    return {
        ...valueBaseStyle,
        color: COLORS.neutral,
    };
}

function createFallbackProfile(accountId) {
    return {
        accountId: accountId || "",
        timezone: "Europe/Zurich",
        platform: "Tradovate",
    };
}

function createFallbackAccount(accountId) {
    return {
        id: accountId || "",
        productType: "eod",
        accountPhase: "eval",
        accountSize: 50000,
        currentBalance: 50000,
    };
}

function formatMoney(value) {
    const parsed = parseFlexibleNumber(value);

    if (parsed === null) {
        return "-";
    }

    return `${parsed.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

function formatAccountSize(value) {
    const parsed = parseFlexibleNumber(value);

    if (parsed === null) {
        return "-";
    }

    return parsed.toLocaleString("de-DE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

function formatProductType(value) {
    return String(value || "EOD").trim().toUpperCase() || "EOD";
}

function formatAccountPhase(value) {
    return String(value || "EVAL").trim().toUpperCase() || "EVAL";
}

function resolveTextValue(primaryValue, fallbackValue, defaultValue = "-") {
    if (hasValue(primaryValue)) {
        return String(primaryValue);
    }

    if (hasValue(fallbackValue)) {
        return String(fallbackValue);
    }

    return defaultValue;
}

function resolveNumericValue(primaryValue, fallbackValue, defaultValue = null) {
    const primary = parseFlexibleNumber(primaryValue);

    if (primary !== null) {
        return primary;
    }

    const fallback = parseFlexibleNumber(fallbackValue);

    if (fallback !== null) {
        return fallback;
    }

    return defaultValue;
}

export default function LiveCard({ accountId, account: accountProp }) {
    const resolvedAccountId = accountId || accountProp?.id || "";
    const [, setRefreshVersion] = useState(0);

    useEffect(() => {
        const handleRefresh = () => {
            setRefreshVersion((prev) => prev + 1);
        };

        window.addEventListener("tradovate-csv-imports-updated", handleRefresh);
        window.addEventListener("storage", handleRefresh);
        window.addEventListener("focus", handleRefresh);

        return () => {
            window.removeEventListener("tradovate-csv-imports-updated", handleRefresh);
            window.removeEventListener("storage", handleRefresh);
            window.removeEventListener("focus", handleRefresh);
        };
    }, []);

    const storedProfile = getAccountProfile(resolvedAccountId) || {};
    const storedAccount = getAccountById(resolvedAccountId) || {};
    const liveSnapshot = getLiveAccountSnapshot(resolvedAccountId) || {};

    const profile = {
        ...createFallbackProfile(resolvedAccountId),
        ...storedProfile,
        accountId: resolvedAccountId,
    };

    const account = {
        ...createFallbackAccount(resolvedAccountId),
        ...storedAccount,
        ...(accountProp || {}),
        id: resolvedAccountId,
    };

    const importData =
        typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports()
            : null;

    const importedLiveData =
        resolvedAccountId &&
            importData &&
            typeof csvImportUtils.buildLiveCardData === "function"
            ? csvImportUtils.buildLiveCardData(importData, resolvedAccountId, account)
            : null;

    const hasImportedBalance = Boolean(
        importData?.accountBalanceHistory?.byAccount?.[resolvedAccountId]?.length
    );

    const displayAccountId = resolveTextValue(
        hasImportedBalance ? importedLiveData?.accountId : null,
        liveSnapshot.accountName || account.id
    );

    const displayPlatform = resolveTextValue(
        hasImportedBalance ? importedLiveData?.platform : null,
        profile.platform || "Tradovate"
    );

    const displayProduct = formatProductType(
        resolveTextValue(
            hasImportedBalance ? importedLiveData?.product : null,
            account.productType,
            "EOD"
        )
    );

    const displayPhase = formatAccountPhase(
        resolveTextValue(
            hasImportedBalance ? importedLiveData?.phase : null,
            account.accountPhase,
            "EVAL"
        )
    );

    const displayAccountSize = resolveNumericValue(
        hasImportedBalance ? importedLiveData?.accountSize : null,
        account.accountSize,
        liveSnapshot.startingBalance
    );

    const displayStartBalance = resolveNumericValue(
        hasImportedBalance ? importedLiveData?.startBalance : null,
        liveSnapshot.startingBalance,
        account.accountSize
    );

    const displayRealizedPnl = resolveNumericValue(
        hasImportedBalance ? importedLiveData?.realizedPnL : null,
        liveSnapshot.realizedPnl,
        0
    );

    const displayUnrealizedPnl = resolveNumericValue(
        hasImportedBalance ? importedLiveData?.unrealizedPnL : null,
        0,
        0
    );

    const displayRealizedBalance = resolveNumericValue(
        hasImportedBalance ? importedLiveData?.realizedBalance : null,
        liveSnapshot.totalAmount,
        liveSnapshot.liveBalance ?? account.currentBalance
    );

    const displayLiveBalance = resolveNumericValue(
        hasImportedBalance ? importedLiveData?.liveBalance : null,
        liveSnapshot.liveBalance,
        account.currentBalance
    );

    const cards = [
        {
            label: "Account Id",
            displayValue: displayAccountId,
            rawValue: displayAccountId,
            variant: "neutral",
        },
        {
            label: "Plattform",
            displayValue: displayPlatform,
            rawValue: displayPlatform,
            variant: "neutral",
        },
        {
            label: "Produkt",
            displayValue: displayProduct,
            rawValue: displayProduct,
            variant: "neutral",
        },
        {
            label: "Phase",
            displayValue: displayPhase,
            rawValue: displayPhase,
            variant: "neutral",
        },
        {
            label: "Kontogröße",
            displayValue: formatAccountSize(displayAccountSize),
            rawValue: formatAccountSize(displayAccountSize),
            variant: "neutral",
        },
        {
            label: "Start Balance",
            displayValue: formatMoney(displayStartBalance),
            rawValue: displayStartBalance,
            variant: "dynamic",
        },
        {
            label: "Realized PnL",
            displayValue: formatMoney(displayRealizedPnl),
            rawValue: displayRealizedPnl,
            variant: "dynamic",
        },
        {
            label: "Unrealized PnL",
            displayValue: formatMoney(displayUnrealizedPnl),
            rawValue: displayUnrealizedPnl,
            variant: "dynamic",
        },
        {
            label: "Realized Balance",
            displayValue: formatMoney(displayRealizedBalance),
            rawValue: displayRealizedBalance,
            variant: "dynamic",
        },
        {
            label: "Live Balance",
            displayValue: formatMoney(displayLiveBalance),
            rawValue: displayLiveBalance,
            variant: "dynamic",
        },
    ];

    return (
        <div style={wrapperStyle}>
            <div style={gridStyle}>
                {cards.map((item) => (
                    <div key={item.label} style={cardStyle}>
                        <div style={labelStyle}>{item.label}</div>
                        <div style={getValueStyle(item.rawValue, item.variant)}>
                            {item.displayValue}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}