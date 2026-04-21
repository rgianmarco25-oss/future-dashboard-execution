export const RULES_VERSION = "2026-04-11.apex-new-products.v2";
export const RULES_LAST_UPDATED = "2026-04-11";
export const RULES_SOURCE_SCOPE =
    "Official Apex New Products pages only. Legacy products excluded.";
export const RULES_CHANGELOG_NOTE =
    "Added payout caps by request, PA inactivity rule, shared contract equivalency metadata, and helpers for centralized snapshot logic.";
export const RULES_UI_UPDATE_NOTICE =
    "Apex Regeln wurden aktualisiert. Bitte prüfe die neuen Vorgaben für deinen Account.";

const OFFICIAL_SOURCES = {
    newProducts:
        "https://support.apextraderfunding.com/hc/en-us/articles/47254439589915-New-Products",
    paActivation:
        "https://support.apextraderfunding.com/hc/en-us/articles/47237215800987-PA-Activation-Process-Deadline-Explained",
    eodEval:
        "https://support.apextraderfunding.com/hc/en-us/articles/46724640813083-EOD-Evaluations",
    intradayEval:
        "https://apextraderfunding.com/help-center/evaluation-accounts-ea/intraday-trailing-drawdown-evaluations/",
    eodPa:
        "https://support.apextraderfunding.com/hc/en-us/articles/47204516592795-EOD-Performance-Accounts-PA",
    intradayPa:
        "https://support.apextraderfunding.com/hc/en-us/articles/47206242141979-Intraday-Trailing-Drawdown-Performance-Accounts-PA",
    dailyLossLimit:
        "https://support.apextraderfunding.com/hc/en-us/articles/47257193113371-Daily-Loss-Limit-Explained",
    scalingLevels:
        "https://support.apextraderfunding.com/hc/en-us/articles/46729420990235-Scaling-Levels-PA-Explained",
    eodPayouts:
        "https://support.apextraderfunding.com/hc/en-us/articles/47205823183003-EOD-Payouts",
    intradayPayouts:
        "https://apextraderfunding.com/help-center/intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-payouts/",
    prohibitedActivities:
        "https://support.apextraderfunding.com/hc/en-us/articles/40463668243099-Prohibited-Activities",
    hedgingRule:
        "https://support.apextraderfunding.com/hc/en-us/articles/40463541656603-Hedging-and-Correlated-Instruments-Rule",
    evalPositionSizing:
        "https://support.apextraderfunding.com/hc/en-us/articles/45635601987099-Position-Sizing-Evaluation",
};

const LAST_VERIFIED_AT = "2026-04-11";

const ACCOUNT_SIZES = [25000, 50000, 100000, 150000];
const PRODUCT_TYPES = ["eod", "intraday"];
const ACCOUNT_PHASES = ["eval", "pa"];

const SHARED_POSITION_SIZING_RULE = {
    scope: "all_open_positions_combined",
    microToStandardRatio: 10,
    note: "10 Micro Kontrakte entsprechen 1 Standard Kontrakt. Das Limit gilt über alle offenen Positionen kombiniert.",
};

const PA_INACTIVITY_RULE = {
    kind: "profit_day_window",
    requiredNetProfitDay: 150,
    windowCalendarDays: 150,
    closesAccountOnViolation: true,
    note: "Mindestens ein Net Profit Day von 150 USD innerhalb von 150 aufeinanderfolgenden Kalendertagen.",
};

const PA_SCALING_BY_SIZE = {
    25000: [
        { minProfitFromStart: 0, maxProfitFromStart: 999, maxContracts: 1, dailyLossLimit: 500, tierLabel: "Level 1" },
        { minProfitFromStart: 1000, maxProfitFromStart: 1999, maxContracts: 2, dailyLossLimit: 500, tierLabel: "Level 2" },
        { minProfitFromStart: 2000, maxProfitFromStart: null, maxContracts: 2, dailyLossLimit: 1250, tierLabel: "Level 3" },
    ],
    50000: [
        { minProfitFromStart: 0, maxProfitFromStart: 1499, maxContracts: 2, dailyLossLimit: 1000, tierLabel: "Level 1" },
        { minProfitFromStart: 1500, maxProfitFromStart: 2999, maxContracts: 3, dailyLossLimit: 1000, tierLabel: "Level 2" },
        { minProfitFromStart: 3000, maxProfitFromStart: 5999, maxContracts: 4, dailyLossLimit: 2000, tierLabel: "Level 3" },
        { minProfitFromStart: 6000, maxProfitFromStart: null, maxContracts: 4, dailyLossLimit: 3000, tierLabel: "Level 4" },
    ],
    100000: [
        { minProfitFromStart: 0, maxProfitFromStart: 1999, maxContracts: 3, dailyLossLimit: 1750, tierLabel: "Level 1" },
        { minProfitFromStart: 2000, maxProfitFromStart: 2999, maxContracts: 4, dailyLossLimit: 1750, tierLabel: "Level 2" },
        { minProfitFromStart: 3000, maxProfitFromStart: 4999, maxContracts: 5, dailyLossLimit: 1750, tierLabel: "Level 3" },
        { minProfitFromStart: 5000, maxProfitFromStart: 9999, maxContracts: 6, dailyLossLimit: 2500, tierLabel: "Level 4" },
        { minProfitFromStart: 10000, maxProfitFromStart: null, maxContracts: 6, dailyLossLimit: 3500, tierLabel: "Level 5" },
    ],
    150000: [
        { minProfitFromStart: 0, maxProfitFromStart: 1999, maxContracts: 4, dailyLossLimit: 2500, tierLabel: "Level 1" },
        { minProfitFromStart: 2000, maxProfitFromStart: 2999, maxContracts: 5, dailyLossLimit: 2500, tierLabel: "Level 2" },
        { minProfitFromStart: 3000, maxProfitFromStart: 4999, maxContracts: 7, dailyLossLimit: 2500, tierLabel: "Level 3" },
        { minProfitFromStart: 5000, maxProfitFromStart: 9999, maxContracts: 10, dailyLossLimit: 3000, tierLabel: "Level 4" },
        { minProfitFromStart: 10000, maxProfitFromStart: null, maxContracts: 10, dailyLossLimit: 4000, tierLabel: "Level 5" },
    ],
};

const EVAL_FIXED = {
    profitTarget: {
        25000: 1500,
        50000: 3000,
        100000: 6000,
        150000: 9000,
    },
    maxDrawdown: {
        25000: 1000,
        50000: 2000,
        100000: 3000,
        150000: 4000,
    },
    eodDailyLossLimit: {
        25000: 500,
        50000: 1000,
        100000: 1500,
        150000: 2000,
    },
    evalMaxContracts: {
        25000: 4,
        50000: 6,
        100000: 8,
        150000: 12,
    },
};

const EOD_PAYOUT_CAPS_BY_REQUEST = {
    25000: { 1: 1000, 2: 1000, 3: 1000, 4: 1000, 5: 1000, 6: 1000 },
    50000: { 1: 1500, 2: 1500, 3: 2000, 4: 2500, 5: 2500, 6: 3000 },
    100000: { 1: 2000, 2: 2500, 3: 2500, 4: 3000, 5: 4000, 6: 4000 },
    150000: { 1: 2500, 2: 3000, 3: 3000, 4: 3000, 5: 4000, 6: 5000 },
};

const INTRADAY_PAYOUT_CAPS_BY_REQUEST = {
    25000: { 1: 1000, 2: 1000, 3: 1000, 4: 1000, 5: 1000, 6: 1000 },
    50000: { 1: 1500, 2: 2000, 3: 2500, 4: 2500, 5: 3000, 6: 3000 },
    100000: { 1: 2000, 2: 2500, 3: 3000, 4: 3000, 5: 4000, 6: 4000 },
    150000: { 1: 2500, 2: 3000, 3: 3000, 4: 4000, 5: 4000, 6: 5000 },
};

const EOD_PA_PAYOUTS = {
    25000: {
        minTradeDays: 5,
        minDailyProfit: 100,
        safetyNet: 26100,
        minBalanceToRequest: 26600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: EOD_PAYOUT_CAPS_BY_REQUEST[25000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
    50000: {
        minTradeDays: 5,
        minDailyProfit: 250,
        safetyNet: 52100,
        minBalanceToRequest: 52600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: EOD_PAYOUT_CAPS_BY_REQUEST[50000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
    100000: {
        minTradeDays: 5,
        minDailyProfit: 300,
        safetyNet: 103100,
        minBalanceToRequest: 103600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: EOD_PAYOUT_CAPS_BY_REQUEST[100000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
    150000: {
        minTradeDays: 5,
        minDailyProfit: 350,
        safetyNet: 154100,
        minBalanceToRequest: 154600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: EOD_PAYOUT_CAPS_BY_REQUEST[150000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
};

const INTRADAY_PA_PAYOUTS = {
    25000: {
        minTradeDays: 5,
        minDailyProfit: 100,
        safetyNet: 26100,
        minBalanceToRequest: 26600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: INTRADAY_PAYOUT_CAPS_BY_REQUEST[25000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
    50000: {
        minTradeDays: 5,
        minDailyProfit: 200,
        safetyNet: 52100,
        minBalanceToRequest: 52600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: INTRADAY_PAYOUT_CAPS_BY_REQUEST[50000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
    100000: {
        minTradeDays: 5,
        minDailyProfit: 250,
        safetyNet: 103100,
        minBalanceToRequest: 103600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: INTRADAY_PAYOUT_CAPS_BY_REQUEST[100000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
    150000: {
        minTradeDays: 5,
        minDailyProfit: 300,
        safetyNet: 154100,
        minBalanceToRequest: 154600,
        maxPayouts: 6,
        minPayoutAmount: 500,
        payoutSplitPercent: 100,
        consistencyPercent: 50,
        payoutCapsByRequest: INTRADAY_PAYOUT_CAPS_BY_REQUEST[150000],
        notes: [
            "Weekly payout cadence is possible after 5 qualifying trade days.",
            "No deadline to complete qualifying days.",
            "Safety net must be maintained for the life of the PA.",
        ],
    },
};

function fixed(value) {
    return { kind: "fixed", value };
}

function tiered(tiers) {
    return { kind: "tiered", value: null, tiers };
}

function notApplied(reason = "") {
    return { kind: "not_applied", value: null, reason };
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildAccountRuleKey(productType, accountPhase, accountSize) {
    return `${productType}.${accountPhase}.${accountSize}`;
}

function isProductType(value) {
    return PRODUCT_TYPES.includes(value);
}

function isAccountPhase(value) {
    return ACCOUNT_PHASES.includes(value);
}

function isAccountSize(value) {
    return ACCOUNT_SIZES.includes(Number(value));
}

function makeEvalRule(productType, accountSize) {
    const isEod = productType === "eod";

    return {
        accountSize,
        productType,
        accountPhase: "eval",
        profitTarget: fixed(EVAL_FIXED.profitTarget[accountSize]),
        drawdownType: isEod ? "eod" : "intraday_trailing",
        maxDrawdown: fixed(EVAL_FIXED.maxDrawdown[accountSize]),
        dailyLossLimit: isEod
            ? fixed(EVAL_FIXED.eodDailyLossLimit[accountSize])
            : notApplied("Official Intraday Evaluation rule says: No Daily Loss Limit."),
        maxContracts: fixed(EVAL_FIXED.evalMaxContracts[accountSize]),
        accessPeriodDays: 30,
        consistencyRule: {
            kind: "not_applied",
            percentage: null,
            scope: "evaluation",
            note: "Official evaluation pages state Consistency: Not Applied.",
        },
        scalingRule: {
            kind: "not_applied",
            note: "Official evaluation pages state Scaling: Not Applied.",
        },
        positionSizingRule: SHARED_POSITION_SIZING_RULE,
        inactivityRule: null,
        paActivationDeadlineDays: 7,
        payoutRules: null,
        payoutRelevantNotes: [
            "Evaluation account. No payout rules apply before PA activation.",
            "Passed evaluation must be activated within 7 calendar days.",
        ],
        officialSourceUrl: isEod
            ? [
                OFFICIAL_SOURCES.newProducts,
                OFFICIAL_SOURCES.eodEval,
                OFFICIAL_SOURCES.paActivation,
                OFFICIAL_SOURCES.evalPositionSizing,
                OFFICIAL_SOURCES.hedgingRule,
            ]
            : [
                OFFICIAL_SOURCES.newProducts,
                OFFICIAL_SOURCES.intradayEval,
                OFFICIAL_SOURCES.paActivation,
                OFFICIAL_SOURCES.evalPositionSizing,
                OFFICIAL_SOURCES.hedgingRule,
            ],
        sourceNotes: isEod
            ? [
                "EOD Evaluation page provides profit target, max drawdown, DLL, max contracts, 30-day access, no consistency, no scaling.",
                "PA activation page provides the 7 calendar day activation window.",
                "Position sizing page confirms contract limit across all open positions combined and 10 micro = 1 standard contract.",
            ]
            : [
                "Intraday Evaluation page provides profit target, max drawdown, no DLL, max contracts, 30-day access, no consistency, no scaling.",
                "PA activation page provides the 7 calendar day activation window.",
                "Position sizing page confirms contract limit across all open positions combined and 10 micro = 1 standard contract.",
            ],
        prohibitedActivityMeta: {
            hedging: true,
            correlatedInstruments: true,
            ruleCircumvention: true,
        },
        lastVerifiedAt: LAST_VERIFIED_AT,
    };
}

function makePaRule(productType, accountSize) {
    const isEod = productType === "eod";
    const payoutRules = isEod ? EOD_PA_PAYOUTS[accountSize] : INTRADAY_PA_PAYOUTS[accountSize];
    const tiers = PA_SCALING_BY_SIZE[accountSize];

    return {
        accountSize,
        productType,
        accountPhase: "pa",
        profitTarget: notApplied("Official PA pages do not define a profit target."),
        drawdownType: isEod ? "eod" : "intraday_trailing",
        maxDrawdown: fixed(EVAL_FIXED.maxDrawdown[accountSize]),
        dailyLossLimit: tiered(tiers),
        maxContracts: tiered(tiers),
        accessPeriodDays: null,
        consistencyRule: {
            kind: "percentage",
            percentage: 50,
            scope: "payout",
            note: "Applies to payout eligibility, not to PA activation.",
        },
        scalingRule: {
            kind: "tier_based",
            note: "Official PA pages state Tier Based Scaling.",
        },
        positionSizingRule: SHARED_POSITION_SIZING_RULE,
        inactivityRule: {
            ...PA_INACTIVITY_RULE,
        },
        paActivationDeadlineDays: null,
        payoutRules,
        payoutRelevantNotes: [
            "Minimum 5 qualifying trading days required before payout request.",
            "Minimum payout amount is 500 USD.",
            "Maximum 6 payouts per Performance Account.",
            "100% payout split on approved payouts.",
            "No single profitable day may account for 50% or more of total profit since last approved payout.",
            "Safety Net = drawdown limit + 100 USD. Only profit above safety net is payout eligible.",
            ...payoutRules.notes,
        ],
        officialSourceUrl: isEod
            ? [
                OFFICIAL_SOURCES.eodPa,
                OFFICIAL_SOURCES.dailyLossLimit,
                OFFICIAL_SOURCES.scalingLevels,
                OFFICIAL_SOURCES.eodPayouts,
                OFFICIAL_SOURCES.hedgingRule,
                OFFICIAL_SOURCES.prohibitedActivities,
            ]
            : [
                OFFICIAL_SOURCES.intradayPa,
                OFFICIAL_SOURCES.dailyLossLimit,
                OFFICIAL_SOURCES.scalingLevels,
                OFFICIAL_SOURCES.intradayPayouts,
                OFFICIAL_SOURCES.hedgingRule,
                OFFICIAL_SOURCES.prohibitedActivities,
            ],
        sourceNotes: isEod
            ? [
                "EOD PA page provides max drawdown, tier-based scaling, max contract ceiling, DLL tier based, inactivity rule.",
                "Scaling and DLL pages provide the exact PA tiers.",
                "EOD payouts page provides min trade days, min daily profit, safety net, min balance to request, max payouts, 50% consistency, minimum payout amount, and payout caps per request.",
            ]
            : [
                "Intraday PA page provides max drawdown, tier-based scaling, max contract ceiling, DLL tier based, inactivity rule.",
                "Scaling and DLL pages provide the exact PA tiers.",
                "Intraday payouts page provides min trade days, min daily profit, safety net, min balance to request, max payouts, 50% consistency, minimum payout amount, and payout caps per request.",
            ],
        prohibitedActivityMeta: {
            hedging: true,
            correlatedInstruments: true,
            ruleCircumvention: true,
            accountClosureOnViolation: true,
        },
        lastVerifiedAt: LAST_VERIFIED_AT,
    };
}

export const RULES_DATA = {
    version: RULES_VERSION,
    lastUpdated: RULES_LAST_UPDATED,
    sourceScope: RULES_SOURCE_SCOPE,
    changelogNote: RULES_CHANGELOG_NOTE,
    rules: {
        "eod.eval.25000": makeEvalRule("eod", 25000),
        "eod.eval.50000": makeEvalRule("eod", 50000),
        "eod.eval.100000": makeEvalRule("eod", 100000),
        "eod.eval.150000": makeEvalRule("eod", 150000),

        "eod.pa.25000": makePaRule("eod", 25000),
        "eod.pa.50000": makePaRule("eod", 50000),
        "eod.pa.100000": makePaRule("eod", 100000),
        "eod.pa.150000": makePaRule("eod", 150000),

        "intraday.eval.25000": makeEvalRule("intraday", 25000),
        "intraday.eval.50000": makeEvalRule("intraday", 50000),
        "intraday.eval.100000": makeEvalRule("intraday", 100000),
        "intraday.eval.150000": makeEvalRule("intraday", 150000),

        "intraday.pa.25000": makePaRule("intraday", 25000),
        "intraday.pa.50000": makePaRule("intraday", 50000),
        "intraday.pa.100000": makePaRule("intraday", 100000),
        "intraday.pa.150000": makePaRule("intraday", 150000),
    },
};

export function isSupportedApexAccount(account) {
    if (!account) return false;

    return (
        isProductType(account.productType) &&
        isAccountPhase(account.accountPhase) &&
        isAccountSize(account.accountSize)
    );
}

export function getRules(productType, accountPhase, accountSize) {
    const key = buildAccountRuleKey(productType, accountPhase, Number(accountSize));
    const rule = RULES_DATA.rules[key];

    if (!rule) {
        throw new Error(`Unsupported Apex rule combination: ${key}`);
    }

    return rule;
}

export function getRulesForAccount(account) {
    if (!isSupportedApexAccount(account)) {
        return null;
    }

    return getRules(
        account.productType,
        account.accountPhase,
        Number(account.accountSize)
    );
}

export function getRulesVersionInfo() {
    return {
        version: RULES_DATA.version,
        lastUpdated: RULES_DATA.lastUpdated,
        sourceScope: RULES_DATA.sourceScope,
        changelogNote: RULES_DATA.changelogNote,
        supportedKeys: Object.keys(RULES_DATA.rules),
    };
}

export function getTierForProfit(tiers, currentBalance, accountSize) {
    const profitFromStart = Number(currentBalance) - Number(accountSize);

    for (const tier of tiers) {
        const upperOk =
            tier.maxProfitFromStart === null || profitFromStart <= tier.maxProfitFromStart;

        if (profitFromStart >= tier.minProfitFromStart && upperOk) {
            return tier;
        }
    }

    return null;
}

export function resolveCurrentMaxContracts(rule, currentBalance) {
    if (!rule) return null;

    if (rule.maxContracts.kind === "fixed") {
        return rule.maxContracts.value;
    }

    if (rule.maxContracts.kind !== "tiered") {
        return null;
    }

    if (typeof currentBalance !== "number") {
        return null;
    }

    const tier = getTierForProfit(rule.maxContracts.tiers, currentBalance, rule.accountSize);
    return tier?.maxContracts ?? null;
}

export function resolveCurrentDailyLossLimit(rule, currentBalance) {
    if (!rule) return null;

    if (rule.dailyLossLimit.kind === "fixed") {
        return rule.dailyLossLimit.value;
    }

    if (rule.dailyLossLimit.kind === "not_applied") {
        return null;
    }

    if (rule.dailyLossLimit.kind !== "tiered") {
        return null;
    }

    if (typeof currentBalance !== "number") {
        return null;
    }

    const tier = getTierForProfit(rule.dailyLossLimit.tiers, currentBalance, rule.accountSize);
    return tier?.dailyLossLimit ?? null;
}

export function resolveDrawdownFloor(rule, account) {
    if (!rule || !account) return null;

    const accountSize = toNumber(account.accountSize);
    const maxDrawdown =
        rule.maxDrawdown?.kind === "fixed" ? toNumber(rule.maxDrawdown.value) : null;

    if (maxDrawdown === null) return null;
    if (!accountSize) return null;

    return accountSize - maxDrawdown;
}

export function resolveStaticPaThresholdStop(rule) {
    if (!rule || rule.accountPhase !== "pa") {
        return null;
    }

    return Number(rule.accountSize) + 100;
}

export function resolveCurrentPaTier(rule, currentBalance) {
    if (!rule) return null;
    if (rule.accountPhase !== "pa") return null;
    if (typeof currentBalance !== "number") return null;

    const tiers = rule.maxContracts?.tiers || rule.dailyLossLimit?.tiers || [];
    if (!Array.isArray(tiers) || tiers.length === 0) return null;

    const rawTier = getTierForProfit(tiers, currentBalance, rule.accountSize);

    if (!rawTier) {
        return null;
    }

    return {
        ...rawTier,
        level: Number(String(rawTier.tierLabel || "").replace(/\D/g, "")) || null,
    };
}

export function resolvePayoutRequestNumber(approvedPayoutCount = 0) {
    const numeric = Math.max(0, Math.floor(toNumber(approvedPayoutCount)));
    return numeric + 1;
}

export function resolvePayoutCapForRequest(rule, approvedPayoutCount = 0) {
    if (!rule || rule.accountPhase !== "pa" || !rule.payoutRules) {
        return null;
    }

    const requestNumber = resolvePayoutRequestNumber(approvedPayoutCount);
    const caps = rule.payoutRules?.payoutCapsByRequest || {};

    return caps[requestNumber] ?? null;
}

export function resolveRiskRuleSnapshot(account) {
    const rule = getRulesForAccount(account);

    if (!rule || !account) {
        return null;
    }

    const currentBalance = toNumber(account.currentBalance);
    const drawdownFloor = resolveDrawdownFloor(rule, account);
    const dailyLossLimit = resolveCurrentDailyLossLimit(rule, currentBalance);
    const maxContracts = resolveCurrentMaxContracts(rule, currentBalance);
    const paTier = resolveCurrentPaTier(rule, currentBalance);
    const maxDrawdown =
        rule.maxDrawdown?.kind === "fixed" ? toNumber(rule.maxDrawdown.value) : null;

    return {
        accountSize: toNumber(account.accountSize),
        currentBalance,
        productType: rule.productType,
        accountPhase: rule.accountPhase,
        drawdownType: rule.drawdownType,
        maxDrawdown,
        drawdownFloor,
        dailyLossLimit,
        maxContracts,
        paTier,
        rawRule: rule,
    };
}

export function validateRulesData(rulesData = RULES_DATA) {
    const issues = [];
    const expectedKeys = [
        "eod.eval.25000",
        "eod.eval.50000",
        "eod.eval.100000",
        "eod.eval.150000",
        "eod.pa.25000",
        "eod.pa.50000",
        "eod.pa.100000",
        "eod.pa.150000",
        "intraday.eval.25000",
        "intraday.eval.50000",
        "intraday.eval.100000",
        "intraday.eval.150000",
        "intraday.pa.25000",
        "intraday.pa.50000",
        "intraday.pa.100000",
        "intraday.pa.150000",
    ];

    const actualKeys = Object.keys(rulesData.rules || {});

    for (const key of expectedKeys) {
        if (!rulesData.rules[key]) {
            issues.push({
                code: "MISSING_RULE",
                key,
                message: `Missing required rule combination: ${key}`,
            });
        }
    }

    for (const key of actualKeys) {
        const rule = rulesData.rules[key];

        if (!isProductType(rule.productType)) {
            issues.push({
                code: "INVALID_PRODUCT_TYPE",
                key,
                message: `Invalid productType on ${key}`,
            });
        }

        if (!isAccountPhase(rule.accountPhase)) {
            issues.push({
                code: "INVALID_ACCOUNT_PHASE",
                key,
                message: `Invalid accountPhase on ${key}`,
            });
        }

        if (!isAccountSize(rule.accountSize)) {
            issues.push({
                code: "INVALID_ACCOUNT_SIZE",
                key,
                message: `Invalid accountSize on ${key}`,
            });
        }

        const expectedKey = buildAccountRuleKey(
            rule.productType,
            rule.accountPhase,
            Number(rule.accountSize)
        );

        if (expectedKey !== key) {
            issues.push({
                code: "KEY_MISMATCH",
                key,
                message: `Key does not match rule content. Expected ${expectedKey}, got ${key}`,
            });
        }

        if (rule.accountPhase === "eval") {
            if (rule.accessPeriodDays !== 30) {
                issues.push({
                    code: "EVAL_ACCESS_PERIOD_INVALID",
                    key,
                    message: "Evaluation access period must be 30 days.",
                });
            }

            if (rule.paActivationDeadlineDays !== 7) {
                issues.push({
                    code: "EVAL_PA_ACTIVATION_INVALID",
                    key,
                    message: "Evaluation PA activation deadline must be 7 days.",
                });
            }

            if (rule.productType === "intraday" && rule.dailyLossLimit.kind !== "not_applied") {
                issues.push({
                    code: "INTRADAY_EVAL_DLL_INVALID",
                    key,
                    message: "Intraday Evaluation must not have a Daily Loss Limit.",
                });
            }

            if (rule.consistencyRule.kind !== "not_applied") {
                issues.push({
                    code: "EVAL_CONSISTENCY_INVALID",
                    key,
                    message: "Evaluation consistency rule must be not_applied.",
                });
            }

            if (rule.scalingRule.kind !== "not_applied") {
                issues.push({
                    code: "EVAL_SCALING_INVALID",
                    key,
                    message: "Evaluation scaling rule must be not_applied.",
                });
            }
        }

        if (rule.accountPhase === "pa") {
            if (rule.scalingRule.kind !== "tier_based") {
                issues.push({
                    code: "PA_SCALING_INVALID",
                    key,
                    message: "PA scaling rule must be tier_based.",
                });
            }

            if (!rule.payoutRules) {
                issues.push({
                    code: "PA_PAYOUT_RULES_MISSING",
                    key,
                    message: "PA must define payoutRules.",
                });
            }

            if (rule.dailyLossLimit.kind !== "tiered") {
                issues.push({
                    code: "PA_DLL_INVALID",
                    key,
                    message: "PA dailyLossLimit must be tiered.",
                });
            }

            if (rule.maxContracts.kind !== "tiered") {
                issues.push({
                    code: "PA_MAX_CONTRACTS_INVALID",
                    key,
                    message: "PA maxContracts must be tiered.",
                });
            }

            if (!rule.inactivityRule || rule.inactivityRule.kind !== "profit_day_window") {
                issues.push({
                    code: "PA_INACTIVITY_RULE_MISSING",
                    key,
                    message: "PA inactivity rule must be present.",
                });
            }

            if (!rule.payoutRules?.payoutCapsByRequest) {
                issues.push({
                    code: "PA_PAYOUT_CAPS_MISSING",
                    key,
                    message: "PA payout caps by request must be present.",
                });
            }
        }

        if (rule.productType === "eod" && rule.drawdownType !== "eod") {
            issues.push({
                code: "EOD_DRAWDOWN_MIXUP",
                key,
                message: "EOD rule must use eod drawdownType.",
            });
        }

        if (rule.productType === "intraday" && rule.drawdownType !== "intraday_trailing") {
            issues.push({
                code: "INTRADAY_DRAWDOWN_MIXUP",
                key,
                message: "Intraday rule must use intraday_trailing drawdownType.",
            });
        }

        if (!Array.isArray(rule.officialSourceUrl) || rule.officialSourceUrl.length === 0) {
            issues.push({
                code: "SOURCES_MISSING",
                key,
                message: "Each rule must keep at least one official source URL.",
            });
        }

        if (!rule.positionSizingRule?.microToStandardRatio) {
            issues.push({
                code: "POSITION_SIZING_RULE_MISSING",
                key,
                message: "Each rule must define position sizing equivalency metadata.",
            });
        }

        if (!rule.lastVerifiedAt) {
            issues.push({
                code: "LAST_VERIFIED_MISSING",
                key,
                message: "Each rule must define lastVerifiedAt.",
            });
        }
    }

    return {
        isValid: issues.length === 0,
        issues,
    };
}