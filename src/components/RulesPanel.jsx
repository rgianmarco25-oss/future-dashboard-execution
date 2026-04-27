import React, { useEffect, useMemo, useState } from "react";
import { getAccountById, getLiveAccountSnapshot } from "../utils/storage";
import {
    getRulesForAccount,
    resolveCurrentMaxContracts,
    resolveCurrentDailyLossLimit,
    resolveRiskRuleSnapshot,
    getRulesVersionInfo,
    RULES_UI_UPDATE_NOTICE,
} from "../utils/apexRules";

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    title: "#7dd3fc",
    label: "#94a3b8",
    neutral: "#dbeafe",
    cyan: "#22d3ee",
    orange: "#fb923c",
    yellow: "#facc15",
    green: "#22c55e",
    lightGreen: "#4ade80",
    red: "#ef4444",
    cardBg: "rgba(255, 255, 255, 0.03)",
    mutedBg: "rgba(255, 255, 255, 0.02)",
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
};

const CHECKLIST_STORAGE_KEY = "future-dashboard-ifvg-checklist-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const TRADE_CRITERIA = [
    { key: "tradeInBias", label: "Trade im Bias" },
    { key: "beLevel", label: "BE Level" },
    { key: "sweep", label: "Sweep" },
    { key: "displacement", label: "Displacement" },
    { key: "legFvgClosed", label: "Leg FVG geschlossen" },
    { key: "fvgReaction", label: "FVG Reaktion" },
    { key: "fvgSize", label: "FVG Größe" },
    { key: "candleCount", label: "Anzahl Kerzen" },
];

const TARGETS = [
    { key: "equalHL", label: "Equal H / L" },
    { key: "sessionHL", label: "Session H / L" },
    { key: "newsHL", label: "News H / L" },
    { key: "htfSwingPoint", label: "HTF Swing Point" },
    { key: "htfOb", label: "HTF OB" },
    { key: "htfFvg", label: "HTF FVG" },
];

const TOTAL_CHECKLIST_POINTS = TRADE_CRITERIA.length + 1;

const KNOWN_LIFECYCLE_DATES = {
    APEX42513409: {
        evalStartDate: "2026-04-04",
        accessStartDate: "2026-04-04",
        accessEndDate: "2026-05-03",
    },
};

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeApexKey(value) {
    return cleanString(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function normalizeDateOnly(value) {
    const text = cleanString(value);

    if (!text) {
        return "";
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
        return text.slice(0, 10);
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toISOString().slice(0, 10);
}

function pickDateOnly(...values) {
    for (const value of values) {
        const date = normalizeDateOnly(value);

        if (date) {
            return date;
        }
    }

    return "";
}

function getTodayDateOnly() {
    return new Date().toISOString().slice(0, 10);
}

function dateOnlyToUtcMs(value) {
    const normalized = normalizeDateOnly(value);

    if (!normalized) {
        return NaN;
    }

    return new Date(`${normalized}T00:00:00.000Z`).getTime();
}

function addCalendarDaysInclusive(startDate, totalDays) {
    const normalizedStartDate = normalizeDateOnly(startDate);
    const numericDays = Number(totalDays);

    if (!normalizedStartDate || !Number.isFinite(numericDays) || numericDays <= 0) {
        return "";
    }

    const date = new Date(`${normalizedStartDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Math.max(0, Math.floor(numericDays) - 1));

    return date.toISOString().slice(0, 10);
}

function diffCalendarDaysInclusive(startDate, endDate) {
    const startMs = dateOnlyToUtcMs(startDate);
    const endMs = dateOnlyToUtcMs(endDate);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return null;
    }

    return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

function clampNumber(value, min, max) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return min;
    }

    return Math.min(max, Math.max(min, numeric));
}

function formatMoney(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return "-";
    }

    return `${numeric.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

function formatDays(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    return `${value} Tage`;
}

function formatDateOnlyDisplay(value) {
    const normalized = normalizeDateOnly(value);

    if (!normalized) {
        return "-";
    }

    const date = new Date(`${normalized}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

function formatRuleValue(ruleValue) {
    if (!ruleValue) {
        return "-";
    }

    if (ruleValue.kind === "fixed") {
        return String(ruleValue.value);
    }

    if (ruleValue.kind === "not_applied") {
        return "Nicht aktiv";
    }

    if (ruleValue.kind === "open") {
        return `Offen: ${ruleValue.note || ""}`;
    }

    if (ruleValue.kind === "tiered") {
        return "Tier basiert";
    }

    return "-";
}

function formatDrawdownType(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (!normalized) {
        return "-";
    }

    return normalized.replaceAll("_", " ").toUpperCase();
}

function getValueColor(value) {
    const numericValue = toNumber(value);

    if (numericValue > 0) {
        return COLORS.cyan;
    }

    if (numericValue < 0) {
        return COLORS.orange;
    }

    return COLORS.neutral;
}

function getValueStyle(value, dynamic = false) {
    return {
        fontSize: "15px",
        fontWeight: 600,
        lineHeight: 1.35,
        color: dynamic ? getValueColor(value) : COLORS.neutral,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
    };
}
function translateNoteToGerman(note) {
    if (!note) {
        return "-";
    }

    const normalized = String(note).trim();

    if (normalized === "Evaluation account. No payout rules apply before PA activation.") {
        return "Evaluation Account. Vor der PA Aktivierung gelten keine Auszahlungsregeln.";
    }

    if (normalized === "Passed evaluation must be activated within 7 calendar days.") {
        return "Eine bestandene Evaluation muss innerhalb von 7 Kalendertagen aktiviert werden.";
    }

    if (normalized === "Minimum 5 qualifying trading days required before payout request.") {
        return "Vor einer Auszahlungsanfrage sind mindestens 5 qualifizierende Trading-Tage nötig.";
    }

    if (normalized === "Minimum payout amount is 500 USD.") {
        return "Der Mindestbetrag für eine Auszahlung beträgt 500 USD.";
    }

    if (normalized === "Maximum 6 payouts per Performance Account.") {
        return "Pro Performance Account sind maximal 6 Auszahlungen möglich.";
    }

    if (normalized === "100% payout split on approved payouts.") {
        return "Genehmigte Auszahlungen werden zu 100% ausgeschüttet.";
    }

    if (
        normalized ===
        "No single profitable day may account for 50% or more of total profit since last approved payout."
    ) {
        return "Kein einzelner profitabler Tag darf 50% oder mehr des Gesamtprofits seit der letzten genehmigten Auszahlung ausmachen.";
    }

    if (
        normalized ===
        "Safety Net = drawdown limit + 100 USD. Only profit above safety net is payout eligible."
    ) {
        return "Safety Net = Drawdown Limit + 100 USD. Nur Profit oberhalb des Safety Net ist auszahlungsfähig.";
    }

    if (normalized === "Weekly payout cadence is possible after 5 qualifying trade days.") {
        return "Nach 5 qualifizierenden Trading-Tagen ist ein wöchentlicher Auszahlungsrhythmus möglich.";
    }

    if (normalized === "No deadline to complete qualifying days.") {
        return "Es gibt keine Frist, um die qualifizierenden Tage abzuschließen.";
    }

    if (normalized === "Safety net must be maintained for the life of the PA.") {
        return "Das Safety Net muss für die gesamte Laufzeit der PA gehalten werden.";
    }

    return normalized;
}

function getSourceLabel(url, index) {
    const normalized = String(url || "").toLowerCase();

    if (normalized.includes("new-products")) {
        return "Neue Produkte";
    }

    if (normalized.includes("eod-evaluations")) {
        return "EOD Evaluations";
    }

    if (normalized.includes("pa-activation-process-deadline-explained")) {
        return "PA Aktivierung Frist";
    }

    if (normalized.includes("intraday-trailing-drawdown-evaluations")) {
        return "Intraday Evaluations";
    }

    if (normalized.includes("performance-accounts")) {
        return "Performance Accounts";
    }

    if (normalized.includes("payout")) {
        return "Payouts";
    }

    if (normalized.includes("daily-loss-limit")) {
        return "Daily Loss Limit";
    }

    if (normalized.includes("scaling")) {
        return "Scaling";
    }

    if (normalized.includes("hedging")) {
        return "Hedging Regel";
    }

    return `Quelle ${index + 1}`;
}

function renderTierTable(tiers, type) {
    if (!Array.isArray(tiers) || tiers.length === 0) {
        return null;
    }

    return (
        <div style={styles.tableWrap}>
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Level</th>
                        <th style={styles.th}>Profit ab Start</th>
                        <th style={styles.th}>Profit bis</th>
                        {type === "contracts" ? <th style={styles.th}>Max Contracts</th> : null}
                        {type === "dll" ? <th style={styles.th}>Daily Loss Limit</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {tiers.map((tier, index) => (
                        <tr key={`${tier.tierLabel}-${index}`}>
                            <td style={styles.td}>{tier.tierLabel}</td>
                            <td style={styles.td}>{formatMoney(tier.minProfitFromStart)}</td>
                            <td style={styles.td}>
                                {tier.maxProfitFromStart === null
                                    ? "offen"
                                    : formatMoney(tier.maxProfitFromStart)}
                            </td>
                            {type === "contracts" ? (
                                <td style={styles.td}>{tier.maxContracts ?? "-"}</td>
                            ) : null}
                            {type === "dll" ? (
                                <td style={styles.td}>
                                    {tier.dailyLossLimit !== undefined
                                        ? formatMoney(tier.dailyLossLimit)
                                        : "-"}
                                </td>
                            ) : null}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function createDefaultChecklistState() {
    const state = {};

    [...TRADE_CRITERIA, ...TARGETS].forEach((item) => {
        state[item.key] = false;
    });

    return state;
}

function normalizeChecklistState(value) {
    const base = createDefaultChecklistState();

    if (!value || typeof value !== "object") {
        return base;
    }

    return Object.keys(base).reduce((accumulator, key) => {
        accumulator[key] = Boolean(value[key]);
        return accumulator;
    }, {});
}

function readChecklistStorage() {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);

        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        return parsed;
    } catch {
        return {};
    }
}

function getChecklistForAccount(accountId) {
    const safeAccountId = cleanString(accountId);

    if (!safeAccountId) {
        return createDefaultChecklistState();
    }

    const storage = readChecklistStorage();
    return normalizeChecklistState(storage[safeAccountId]);
}

function saveChecklistForAccount(accountId, value) {
    const safeAccountId = cleanString(accountId);

    if (!safeAccountId || typeof window === "undefined") {
        return;
    }

    const storage = readChecklistStorage();
    storage[safeAccountId] = normalizeChecklistState(value);

    window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(storage));
}

function getChecklistTone(score) {
    if (score >= 9) {
        return {
            label: "A+ Setup",
            text: COLORS.green,
            border: "rgba(34, 197, 94, 0.35)",
            background: "rgba(34, 197, 94, 0.10)",
            bar: COLORS.green,
        };
    }

    if (score >= 7) {
        return {
            label: "Stark",
            text: COLORS.lightGreen,
            border: "rgba(74, 222, 128, 0.35)",
            background: "rgba(74, 222, 128, 0.10)",
            bar: COLORS.lightGreen,
        };
    }

    if (score >= 5) {
        return {
            label: "Mittel",
            text: COLORS.yellow,
            border: "rgba(250, 204, 21, 0.35)",
            background: "rgba(250, 204, 21, 0.10)",
            bar: COLORS.yellow,
        };
    }

    if (score >= 3) {
        return {
            label: "Schwach",
            text: COLORS.orange,
            border: "rgba(251, 146, 60, 0.35)",
            background: "rgba(251, 146, 60, 0.10)",
            bar: COLORS.orange,
        };
    }

    return {
        label: "Nicht valide",
        text: COLORS.red,
        border: "rgba(239, 68, 68, 0.35)",
        background: "rgba(239, 68, 68, 0.10)",
        bar: COLORS.red,
    };
}

function getKnownLifecycleDateOverrides(account = {}) {
    const candidates = [
        account?.id,
        account?.displayName,
        account?.tradingAccountId,
        account?.tradingAccountName,
        account?.tradovateAccountId,
        account?.tradovateAccountName,
        account?.atasAccountId,
        account?.atasAccountName,
        account?.dataProviderAccountId,
        account?.dataProviderAccountName,
        account?.accountId,
        account?.accountName,
        account?.name,
        account?.label,
        account?.source?.accountId,
        account?.source?.accountName,
    ];

    for (const candidate of candidates) {
        const key = normalizeApexKey(candidate);

        if (key && KNOWN_LIFECYCLE_DATES[key]) {
            return KNOWN_LIFECYCLE_DATES[key];
        }
    }

    return {};
}

function resolveLifecycleMeta(account, rules, currentBalance) {
    if (!account || !rules) {
        return {
            show: false,
            statusLabel: "-",
            statusColor: COLORS.label,
            accessStartDate: "",
            accessEndDate: "",
            daysTotal: null,
            daysElapsed: null,
            daysRemaining: null,
            progressPercent: 0,
            targetBalance: null,
            targetReached: false,
            paActivationDeadlineDate: "",
            paActivationDaysRemaining: null,
            cards: [],
            notes: [],
        };
    }

    const overrides = getKnownLifecycleDateOverrides(account);
    const accountStatus = cleanString(account.accountStatus || "open").toLowerCase();
    const isEval = rules.accountPhase === "eval";
    const isPa = rules.accountPhase === "pa";

    const accessStartDate = pickDateOnly(
        account.accessStartDate,
        account.evalStartDate,
        overrides.accessStartDate,
        overrides.evalStartDate,
        isEval ? account.createdAt : ""
    );

    const accessEndDate = pickDateOnly(
        account.accessEndDate,
        overrides.accessEndDate,
        isEval && accessStartDate
            ? addCalendarDaysInclusive(accessStartDate, rules.accessPeriodDays || 30)
            : ""
    );

    const passedAt = pickDateOnly(
        account.passedAt,
        account.passDate,
        account.evaluationPassedAt
    );

    const paActivationDeadlineDate = pickDateOnly(
        account.paActivationDeadlineDate,
        overrides.paActivationDeadlineDate,
        isEval && passedAt
            ? addCalendarDaysInclusive(passedAt, rules.paActivationDeadlineDays || 7)
            : ""
    );

    const today = getTodayDateOnly();
    const daysTotal = isEval && accessStartDate && accessEndDate
        ? diffCalendarDaysInclusive(accessStartDate, accessEndDate)
        : null;

    const rawDaysRemaining = isEval && accessEndDate
        ? diffCalendarDaysInclusive(today, accessEndDate)
        : null;

    const daysRemaining = rawDaysRemaining === null || daysTotal === null
        ? null
        : clampNumber(rawDaysRemaining, 0, daysTotal);

    const daysElapsed = daysTotal !== null && daysRemaining !== null
        ? clampNumber(daysTotal - daysRemaining, 0, daysTotal)
        : null;

    const progressPercent = daysTotal && daysElapsed !== null
        ? Math.round((daysElapsed / daysTotal) * 100)
        : 0;
            const profitTarget = rules.profitTarget?.kind === "fixed"
        ? toNumber(rules.profitTarget.value, 0)
        : 0;

    const accountSize = toNumber(rules.accountSize, toNumber(account.accountSize, 0));

    const fallbackTargetBalance = isEval && profitTarget > 0
        ? accountSize + profitTarget
        : null;

    const targetBalance = toNumber(account.targetBalance, 0) > 0
        ? toNumber(account.targetBalance, 0)
        : fallbackTargetBalance;

    const numericCurrentBalance = Number.isFinite(Number(currentBalance))
        ? Number(currentBalance)
        : null;

    const targetReached =
        typeof account.targetReached === "boolean"
            ? account.targetReached
            : (
                targetBalance !== null &&
                numericCurrentBalance !== null &&
                numericCurrentBalance >= targetBalance
            );

    const computedRuleStatus = cleanString(account.computedRuleStatus).toLowerCase();
    const computedRuleStatusLabel = cleanString(account.computedRuleStatusLabel);

    let statusLabel = "Aktiv";
    let statusColor = COLORS.cyan;

    if (computedRuleStatusLabel) {
        statusLabel = computedRuleStatusLabel;
    }

    if (computedRuleStatus === "passed" || computedRuleStatus === "target_reached") {
        statusColor = COLORS.green;
    } else if (computedRuleStatus === "failed" || computedRuleStatus === "expired") {
        statusColor = COLORS.red;
    } else if (computedRuleStatus === "archived") {
        statusColor = COLORS.label;
    } else if (accountStatus === "passed") {
        statusLabel = "Bestanden";
        statusColor = COLORS.green;
    } else if (accountStatus === "failed") {
        statusLabel = "Nicht bestanden";
        statusColor = COLORS.red;
    } else if (accountStatus === "archived") {
        statusLabel = "Archiviert";
        statusColor = COLORS.label;
    } else if (isEval && targetReached) {
        statusLabel = "Bestanden möglich";
        statusColor = COLORS.green;
    } else if (isEval && daysRemaining === 0 && !targetReached) {
        statusLabel = "Zeit abgelaufen";
        statusColor = COLORS.red;
    } else if (isPa && accountStatus === "active") {
        statusLabel = "PA aktiv";
        statusColor = COLORS.green;
    }

    const paActivationRawDaysRemaining = paActivationDeadlineDate
        ? diffCalendarDaysInclusive(today, paActivationDeadlineDate)
        : null;

    const paActivationDaysRemaining = paActivationRawDaysRemaining === null
        ? null
        : Math.max(0, paActivationRawDaysRemaining);

    const cards = [];

    if (isEval) {
        cards.push(
            {
                label: "Status automatisch",
                value: statusLabel,
                color: statusColor,
            },
            {
                label: "Start",
                value: formatDateOnlyDisplay(accessStartDate),
                color: COLORS.neutral,
            },
            {
                label: "Ende",
                value: formatDateOnlyDisplay(accessEndDate),
                color: daysRemaining === 0 && !targetReached ? COLORS.red : COLORS.cyan,
            },
            {
                label: "Resttage",
                value: daysRemaining === null ? "-" : formatDays(daysRemaining),
                color:
                    daysRemaining === null
                        ? COLORS.label
                        : daysRemaining <= 3
                            ? COLORS.orange
                            : COLORS.green,
            },
            {
                label: "Tage gesamt",
                value: daysTotal === null ? "-" : formatDays(daysTotal),
                color: COLORS.neutral,
            },
            {
                label: "Zeit Fortschritt",
                value: `${progressPercent}%`,
                color:
                    progressPercent >= 90 && !targetReached
                        ? COLORS.orange
                        : COLORS.cyan,
            }
        );

        if (targetBalance !== null) {
            cards.push(
                {
                    label: "Ziel Balance",
                    value: formatMoney(targetBalance),
                    color: COLORS.green,
                },
                {
                    label: "Aktuelle Balance",
                    value: numericCurrentBalance === null ? "-" : formatMoney(numericCurrentBalance),
                    color: targetReached ? COLORS.green : COLORS.neutral,
                }
            );
        }

        if (paActivationDeadlineDate) {
            cards.push({
                label: "PA Aktivierung bis",
                value: formatDateOnlyDisplay(paActivationDeadlineDate),
                color: COLORS.yellow,
            });

            cards.push({
                label: "Aktivierung Rest",
                value: paActivationDaysRemaining === null ? "-" : formatDays(paActivationDaysRemaining),
                color:
                    paActivationDaysRemaining === null
                        ? COLORS.label
                        : paActivationDaysRemaining <= 2
                            ? COLORS.orange
                            : COLORS.green,
            });
        }
    }

    if (isPa) {
        cards.push(
            {
                label: "Status automatisch",
                value: statusLabel,
                color: statusColor,
            },
            {
                label: "PA aktiviert",
                value: formatDateOnlyDisplay(account.activatedAt || account.createdAt),
                color: COLORS.green,
            },
            {
                label: "Inaktivität",
                value: rules.inactivityRule
                    ? `${rules.inactivityRule.requiredNetProfitDay} $ in ${rules.inactivityRule.windowCalendarDays} Tagen`
                    : "-",
                color: COLORS.yellow,
            },
            {
                label: "Aktuelle Balance",
                value: numericCurrentBalance === null ? "-" : formatMoney(numericCurrentBalance),
                color: COLORS.neutral,
            }
        );
    }

    const notes = [];

    if (isEval && accessStartDate && accessEndDate) {
        notes.push(
            `APEX zählt 30 Kalendertage. Dieses Konto läuft von ${formatDateOnlyDisplay(accessStartDate)} bis ${formatDateOnlyDisplay(accessEndDate)}.`
        );
    }

    if (isEval && targetReached && accountStatus !== "passed") {
        notes.push("Profit Target ist erreicht. Der Account sollte beim nächsten Sync als bestanden erkannt werden.");
    }

    if (isEval && daysRemaining === 0 && !targetReached && accountStatus !== "failed") {
        notes.push("Zeitfenster ist abgelaufen. Ohne erreichtes Profit Target ist die Evaluation nicht bestanden.");
    }

    if (isPa) {
        notes.push("PA Regeln gelten ab Aktivierung. Payout und Inaktivität werden im PA Block angezeigt.");
    }

    return {
        show: isEval || isPa,
        statusLabel,
        statusColor,
        accessStartDate,
        accessEndDate,
        daysTotal,
        daysElapsed,
        daysRemaining,
        progressPercent,
        targetBalance,
        targetReached,
        paActivationDeadlineDate,
        paActivationDaysRemaining,
        cards,
        notes,
    };
}

function ChecklistItem({ label, checked, onToggle }) {
    return (
        <button type="button" onClick={onToggle} style={styles.checkItemButton}>
            <div style={styles.checkItemLeft}>
                <span
                    style={{
                        ...styles.checkIndicator,
                        borderColor: checked ? COLORS.green : COLORS.borderStrong,
                        background: checked ? "rgba(34, 197, 94, 0.18)" : "transparent",
                        color: checked ? COLORS.green : COLORS.label,
                    }}
                >
                    {checked ? "✓" : ""}
                </span>
                <span
                    style={{
                        color: checked ? COLORS.neutral : COLORS.label,
                        fontSize: 14,
                        fontWeight: checked ? 700 : 500,
                        lineHeight: 1.35,
                        textAlign: "left",
                    }}
                >
                    {label}
                </span>
            </div>

            <span
                style={{
                    color: checked ? COLORS.green : COLORS.red,
                    fontSize: 16,
                    fontWeight: 800,
                    minWidth: 18,
                    textAlign: "right",
                }}
            >
                {checked ? "✓" : "×"}
            </span>
        </button>
    );
}
function MiniCard({ label, value, color }) {
    return (
        <div style={styles.miniCard}>
            <div style={styles.miniCardLabel}>{label}</div>
            <div style={{ ...styles.miniCardValue, color: color || COLORS.neutral }}>{value}</div>
        </div>
    );
}

function LifecyclePanel({ lifecycleMeta }) {
    if (!lifecycleMeta?.show) {
        return null;
    }

    return (
        <div style={styles.lifecyclePanel}>
            <div style={styles.lifecycleHeader}>
                <div>
                    <div style={styles.lifecycleTitle}>Account Zeitraum</div>
                    <div style={styles.lifecycleSubTitle}>
                        Automatische Auswertung von Start, Ende, Resttagen und Status.
                    </div>
                </div>

                <div
                    style={{
                        ...styles.lifecycleStatusBadge,
                        color: lifecycleMeta.statusColor,
                        borderColor: lifecycleMeta.statusColor,
                    }}
                >
                    {lifecycleMeta.statusLabel}
                </div>
            </div>

            {lifecycleMeta.daysTotal ? (
                <div style={styles.lifecycleProgressWrap}>
                    <div style={styles.lifecycleProgressTrack}>
                        <div
                            style={{
                                ...styles.lifecycleProgressBar,
                                width: `${lifecycleMeta.progressPercent}%`,
                                background: lifecycleMeta.statusColor,
                            }}
                        />
                    </div>

                    <div style={styles.lifecycleProgressText}>
                        {lifecycleMeta.daysElapsed} von {lifecycleMeta.daysTotal} Kalendertagen verbraucht
                    </div>
                </div>
            ) : null}

            <div style={styles.miniGrid}>
                {lifecycleMeta.cards.map((card) => (
                    <MiniCard
                        key={`${card.label}-${card.value}`}
                        label={card.label}
                        value={card.value}
                        color={card.color}
                    />
                ))}
            </div>

            {Array.isArray(lifecycleMeta.notes) && lifecycleMeta.notes.length > 0 ? (
                <div style={styles.lifecycleNotes}>
                    {lifecycleMeta.notes.map((note, index) => (
                        <div key={`${note}-${index}`} style={styles.lifecycleNote}>
                            {note}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function RulesPanel(props) {
    const resolvedAccountId =
        cleanString(props?.resolvedAccountId) ||
        cleanString(props?.accountId) ||
        cleanString(props?.activeAccountId) ||
        cleanString(props?.selectedAccountId) ||
        cleanString(props?.account?.id) ||
        cleanString(props?.activeAccount?.id) ||
        cleanString(props?.selectedAccount?.id);

    const directAccount =
        props?.account ||
        props?.activeAccount ||
        props?.selectedAccount ||
        null;

    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null;

    const liveSnapshot = useMemo(() => {
        if (!resolvedAccountId) {
            return null;
        }

        return getLiveAccountSnapshot(resolvedAccountId) || null;
    }, [resolvedAccountId]);

    const account = useMemo(() => {
        const baseAccount = directAccount || storedAccount || null;

        if (!baseAccount) {
            return null;
        }

        if (!liveSnapshot) {
            return baseAccount;
        }

        return {
            ...baseAccount,
            productType: liveSnapshot.productType || baseAccount.productType,
            accountPhase: liveSnapshot.accountPhase || baseAccount.accountPhase,
            accountStatus: liveSnapshot.accountStatus || baseAccount.accountStatus,
            accountSize: toNumber(liveSnapshot.accountSize, toNumber(baseAccount.accountSize, 0)),
            startingBalance: toNumber(liveSnapshot.startingBalance, toNumber(baseAccount.startingBalance, 0)),
            currentBalance: toNumber(liveSnapshot.currentBalance, toNumber(baseAccount.currentBalance, 0)),
            evalStartDate: liveSnapshot.evalStartDate || baseAccount.evalStartDate,
            accessStartDate: liveSnapshot.accessStartDate || baseAccount.accessStartDate,
            accessEndDate: liveSnapshot.accessEndDate || baseAccount.accessEndDate,
            paActivationDeadlineDate:
                liveSnapshot.paActivationDeadlineDate ||
                baseAccount.paActivationDeadlineDate,
            passedAt: liveSnapshot.passedAt || baseAccount.passedAt,
            activatedAt: liveSnapshot.activatedAt || baseAccount.activatedAt,
            failedAt: liveSnapshot.failedAt || baseAccount.failedAt,
            archivedAt: liveSnapshot.archivedAt || baseAccount.archivedAt,
            computedRuleStatus:
                liveSnapshot.computedRuleStatus || baseAccount.computedRuleStatus,
            computedRuleStatusLabel:
                liveSnapshot.computedRuleStatusLabel || baseAccount.computedRuleStatusLabel,
            targetBalance:
                liveSnapshot.targetBalance ?? baseAccount.targetBalance,
            targetReached:
                liveSnapshot.targetReached ?? baseAccount.targetReached,
            accessExpired:
                liveSnapshot.accessExpired ?? baseAccount.accessExpired,
            dataProviderAccountId:
                liveSnapshot.dataProviderAccountId || baseAccount.dataProviderAccountId,
            dataProviderAccountName:
                liveSnapshot.dataProviderAccountName || baseAccount.dataProviderAccountName,
        };
    }, [directAccount, storedAccount, liveSnapshot]);

    const [checklistState, setChecklistState] = useState(() =>
        getChecklistForAccount(resolvedAccountId)
    );

    useEffect(() => {
        setChecklistState(getChecklistForAccount(resolvedAccountId));
    }, [resolvedAccountId]);

    function updateChecklist(nextValue) {
        const normalized = normalizeChecklistState(nextValue);
        setChecklistState(normalized);
        saveChecklistForAccount(resolvedAccountId, normalized);
    }

    function toggleChecklistItem(key) {
        updateChecklist({
            ...checklistState,
            [key]: !checklistState[key],
        });
    }

    function resetChecklist() {
        updateChecklist(createDefaultChecklistState());
    }

    const checklistPoints = TRADE_CRITERIA.filter((item) => checklistState[item.key]).length;
    const targetHit = TARGETS.some((item) => checklistState[item.key]);
    const targetPoints = targetHit ? 1 : 0;
    const totalPoints = checklistPoints + targetPoints;
    const progressPercent = Math.round((totalPoints / TOTAL_CHECKLIST_POINTS) * 100);
    const tone = getChecklistTone(totalPoints);

    if (!account) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.emptyBox}>Kein Account gewählt.</div>
            </div>
        );
    }

    const rules = getRulesForAccount(account);
    const versionInfo = getRulesVersionInfo();
    const snapshot = resolveRiskRuleSnapshot(account);

    if (!rules) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.errorBox}>
                    <div style={styles.errorText}>
                        Für diesen Account sind keine Apex New Product Regeln hinterlegt.
                    </div>
                    <div style={styles.mutedText}>
                        Prüfe productType, accountPhase und accountSize.
                    </div>
                </div>
            </div>
        );
    }

    const currentBalanceValue = toNumber(account.currentBalance, NaN);
    const currentBalance = Number.isFinite(currentBalanceValue)
        ? currentBalanceValue
        : null;

    const resolvedMaxContracts =
        currentBalance !== null
            ? resolveCurrentMaxContracts(rules, currentBalance)
            : null;

    const resolvedDailyLossLimit =
        currentBalance !== null
            ? resolveCurrentDailyLossLimit(rules, currentBalance)
            : null;

    const resolvedPaTier = snapshot?.paTier ?? null;
    const resolvedDrawdownFloor = snapshot?.drawdownFloor ?? null;
    const lifecycleMeta = resolveLifecycleMeta(account, rules, currentBalance);

    return (
        <div style={styles.wrapper}>
            <div
                style={{
                    ...styles.checklistPanel,
                    borderColor: tone.border,
                    background: tone.background,
                }}
            >
                <div style={styles.checklistHeader}>
                    <div>
                        <div style={styles.checklistTitle}>Trade Checkliste</div>
                        <div style={styles.checklistSubTitle}>
                            Oben Einstieg. Unten Ziele. Ziele zählen gemeinsam als 1 Punkt.
                        </div>
                    </div>

                    <div style={styles.checklistHeaderActions}>
                        <div
                            style={{
                                ...styles.scoreBadge,
                                borderColor: tone.border,
                                color: tone.text,
                                background: "rgba(0, 0, 0, 0.18)",
                            }}
                        >
                            {totalPoints} von {TOTAL_CHECKLIST_POINTS} • {progressPercent}%
                        </div>

                        <button
                            type="button"
                            onClick={resetChecklist}
                            style={styles.resetButton}
                        >
                            Reset
                        </button>
                    </div>
                </div>

                <div style={styles.progressWrap}>
                    <div style={styles.progressTrack}>
                        <div
                            style={{
                                ...styles.progressBar,
                                width: `${progressPercent}%`,
                                background: tone.bar,
                            }}
                        />
                    </div>
                    <div style={{ ...styles.progressLabel, color: tone.text }}>{tone.label}</div>
                </div>

                <div style={styles.miniGrid}>
                    <MiniCard
                        label="Checkliste"
                        value={`${checklistPoints} / ${TRADE_CRITERIA.length}`}
                        color={tone.text}
                    />
                    <MiniCard
                        label="Zielblock"
                        value={targetHit ? "1 / 1" : "0 / 1"}
                        color={targetHit ? COLORS.green : COLORS.label}
                    />
                    <MiniCard
                        label="Setup Score"
                        value={`${progressPercent}%`}
                        color={tone.text}
                    />
                    <MiniCard
                        label="Status"
                        value={tone.label}
                        color={tone.text}
                    />
                </div>

                <div style={styles.checklistSection}>
                    <div style={styles.checklistSectionTitle}>Trade Kriterien</div>
                    <div style={styles.checklistGrid}>
                        {TRADE_CRITERIA.map((item) => (
                            <ChecklistItem
                                key={item.key}
                                label={item.label}
                                checked={Boolean(checklistState[item.key])}
                                onToggle={() => toggleChecklistItem(item.key)}
                            />
                        ))}
                    </div>
                </div>

                <div style={styles.checklistSection}>
                    <div style={styles.checklistSectionTitle}>Ziele</div>
                    <div style={styles.checklistHint}>
                        Mindestens ein Ziel unten gibt 1 Punkt.
                    </div>
                    <div style={styles.checklistGrid}>
                        {TARGETS.map((item) => (
                            <ChecklistItem
                                key={item.key}
                                label={item.label}
                                checked={Boolean(checklistState[item.key])}
                                onToggle={() => toggleChecklistItem(item.key)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div style={styles.sectionDivider} />

            <div style={styles.headerRow}>
                <div style={styles.headerBlock}>
                    <div style={styles.rulesTitle}>Apex Regeln</div>
                    <div style={styles.subTitle}>
                        {rules.productType.toUpperCase()} | {rules.accountPhase.toUpperCase()} |{" "}
                        {Number(rules.accountSize).toLocaleString("de-DE")}
                    </div>
                </div>

                <div style={styles.versionBox}>
                    <div style={styles.versionText}>Version: {versionInfo.version}</div>
                    <div style={styles.versionText}>Stand: {versionInfo.lastUpdated}</div>
                </div>
            </div>

            <div style={styles.notice}>{RULES_UI_UPDATE_NOTICE}</div>

            <LifecyclePanel lifecycleMeta={lifecycleMeta} />

            <div style={styles.grid}>
                <div style={styles.item}>
                    <div style={styles.label}>Profit Target</div>
                    <div style={getValueStyle(rules.profitTarget?.value, true)}>
                        {rules.profitTarget.kind === "fixed"
                            ? formatMoney(rules.profitTarget.value)
                            : formatRuleValue(rules.profitTarget)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Drawdown Type</div>
                    <div style={getValueStyle(0)}>
                        {formatDrawdownType(rules.drawdownType)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Max Drawdown</div>
                    <div style={getValueStyle(-(rules.maxDrawdown?.value ?? 0), true)}>
                        {rules.maxDrawdown.kind === "fixed"
                            ? formatMoney(rules.maxDrawdown.value)
                            : formatRuleValue(rules.maxDrawdown)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Daily Loss Limit</div>
                    <div style={getValueStyle(-(resolvedDailyLossLimit ?? 0), true)}>
                        {rules.dailyLossLimit.kind === "fixed"
                            ? formatMoney(rules.dailyLossLimit.value)
                            : rules.dailyLossLimit.kind === "tiered"
                                ? currentBalance !== null && resolvedDailyLossLimit !== null
                                    ? `${formatMoney(
                                        resolvedDailyLossLimit
                                    )} bei Balance ${formatMoney(currentBalance)}`
                                    : "Tier basiert"
                                : formatRuleValue(rules.dailyLossLimit)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Max Contracts</div>
                    <div style={getValueStyle(0)}>
                        {rules.maxContracts.kind === "fixed"
                            ? rules.maxContracts.value
                            : rules.maxContracts.kind === "tiered"
                                ? currentBalance !== null && resolvedMaxContracts !== null
                                    ? `${resolvedMaxContracts} bei Balance ${formatMoney(
                                        currentBalance
                                    )}`
                                    : "Tier basiert"
                                : formatRuleValue(rules.maxContracts)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Access Period</div>
                    <div style={getValueStyle(0)}>{formatDays(rules.accessPeriodDays)}</div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Access Start</div>
                    <div style={getValueStyle(0)}>
                        {formatDateOnlyDisplay(lifecycleMeta.accessStartDate)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Access Ende</div>
                    <div style={getValueStyle(0)}>
                        {formatDateOnlyDisplay(lifecycleMeta.accessEndDate)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Resttage</div>
                    <div
                        style={{
                            ...getValueStyle(0),
                            color:
                                lifecycleMeta.daysRemaining === 0
                                    ? COLORS.red
                                    : lifecycleMeta.daysRemaining <= 3
                                        ? COLORS.orange
                                        : COLORS.green,
                        }}
                    >
                        {lifecycleMeta.daysRemaining === null
                            ? "-"
                            : formatDays(lifecycleMeta.daysRemaining)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>PA Activation Deadline</div>
                    <div style={getValueStyle(0)}>
                        {lifecycleMeta.paActivationDeadlineDate
                            ? formatDateOnlyDisplay(lifecycleMeta.paActivationDeadlineDate)
                            : formatDays(rules.paActivationDeadlineDays)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Consistency</div>
                    <div style={getValueStyle(0)}>
                        {rules.consistencyRule.kind === "percentage"
                            ? `${rules.consistencyRule.percentage}%`
                            : rules.consistencyRule.kind === "not_applied"
                                ? "Nicht aktiv"
                                : "Offen"}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Scaling</div>
                    <div style={getValueStyle(0)}>
                        {rules.scalingRule.kind === "tier_based"
                            ? "Tier Based"
                            : rules.scalingRule.kind === "not_applied"
                                ? "Nicht aktiv"
                                : "Offen"}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Last Verified</div>
                    <div style={getValueStyle(0)}>{rules.lastVerifiedAt}</div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Drawdown Floor</div>
                    <div style={getValueStyle(resolvedDrawdownFloor, true)}>
                        {formatMoney(resolvedDrawdownFloor)}
                    </div>
                </div>

                <div style={styles.item}>
                    <div style={styles.label}>Aktuelles PA Tier</div>
                    <div style={getValueStyle(0)}>
                        {resolvedPaTier?.tierLabel || "Nicht aktiv"}
                    </div>
                </div>
            </div>

            {rules.maxContracts.kind === "tiered" ? (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Tier Tabelle Max Contracts</div>
                    {renderTierTable(rules.maxContracts.tiers, "contracts")}
                </div>
            ) : null}

            {rules.dailyLossLimit.kind === "tiered" ? (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Tier Tabelle Daily Loss Limit</div>
                    {renderTierTable(rules.dailyLossLimit.tiers, "dll")}
                </div>
            ) : null}

            {rules.payoutRules ? (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Payout Rules</div>

                    <div style={styles.grid}>
                        <div style={styles.item}>
                            <div style={styles.label}>Min Trade Days</div>
                            <div style={getValueStyle(0)}>{rules.payoutRules.minTradeDays}</div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Min Daily Profit</div>
                            <div style={getValueStyle(rules.payoutRules.minDailyProfit, true)}>
                                {formatMoney(rules.payoutRules.minDailyProfit)}
                            </div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Safety Net</div>
                            <div style={getValueStyle(rules.payoutRules.safetyNet, true)}>
                                {formatMoney(rules.payoutRules.safetyNet)}
                            </div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Min Balance To Request</div>
                            <div
                                style={getValueStyle(
                                    rules.payoutRules.minBalanceToRequest,
                                    true
                                )}
                            >
                                {formatMoney(rules.payoutRules.minBalanceToRequest)}
                            </div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Max Payouts</div>
                            <div style={getValueStyle(0)}>{rules.payoutRules.maxPayouts}</div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Min Payout Amount</div>
                            <div style={getValueStyle(rules.payoutRules.minPayoutAmount, true)}>
                                {formatMoney(rules.payoutRules.minPayoutAmount)}
                            </div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Payout Split</div>
                            <div style={getValueStyle(0)}>
                                {rules.payoutRules.payoutSplitPercent}%
                            </div>
                        </div>

                        <div style={styles.item}>
                            <div style={styles.label}>Consistency Percent</div>
                            <div style={getValueStyle(0)}>
                                {rules.payoutRules.consistencyPercent}%
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {Array.isArray(rules.payoutRelevantNotes) && rules.payoutRelevantNotes.length > 0 ? (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Hinweise</div>
                    <ul style={styles.list}>
                        {rules.payoutRelevantNotes.map((note, index) => (
                            <li key={`${note}-${index}`} style={styles.listItem}>
                                {translateNoteToGerman(note)}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {Array.isArray(rules.officialSourceUrl) && rules.officialSourceUrl.length > 0 ? (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Quellen</div>
                    <div style={styles.sourceButtonGrid}>
                        {rules.officialSourceUrl.map((url, index) => (
                            <a
                                key={`${url}-${index}`}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                style={styles.sourceButton}
                            >
                                {getSourceLabel(url, index)}
                            </a>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
const styles = {
    wrapper: {
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
    },
    checklistPanel: {
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 18,
        padding: 16,
        marginBottom: 20,
    },
    checklistHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 14,
    },
    checklistTitle: {
        fontSize: 20,
        fontWeight: 800,
        color: COLORS.neutral,
        lineHeight: 1.2,
    },
    checklistSubTitle: {
        fontSize: 13,
        color: COLORS.label,
        marginTop: 6,
        lineHeight: 1.4,
    },
    checklistHeaderActions: {
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
    },
    scoreBadge: {
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
    },
    resetButton: {
        border: `1px solid rgba(239, 68, 68, 0.35)`,
        background: "transparent",
        color: COLORS.red,
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
    },
    progressWrap: {
        marginBottom: 16,
    },
    progressTrack: {
        width: "100%",
        height: 12,
        borderRadius: 999,
        background: "rgba(255, 255, 255, 0.06)",
        overflow: "hidden",
        border: `1px solid ${COLORS.border}`,
    },
    progressBar: {
        height: "100%",
        borderRadius: 999,
        transition: "width 180ms ease",
    },
    progressLabel: {
        marginTop: 8,
        fontSize: 13,
        fontWeight: 700,
    },
    lifecyclePanel: {
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 18,
        padding: 16,
        marginBottom: 18,
        background: "rgba(34, 211, 238, 0.05)",
    },
    lifecycleHeader: {
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
        flexWrap: "wrap",
        marginBottom: 14,
    },
    lifecycleTitle: {
        fontSize: 18,
        fontWeight: 800,
        color: COLORS.neutral,
        lineHeight: 1.2,
    },
    lifecycleSubTitle: {
        fontSize: 13,
        color: COLORS.label,
        marginTop: 6,
        lineHeight: 1.4,
    },
    lifecycleStatusBadge: {
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 900,
        background: "rgba(0,0,0,0.18)",
        whiteSpace: "nowrap",
    },
    lifecycleProgressWrap: {
        marginBottom: 16,
    },
    lifecycleProgressTrack: {
        width: "100%",
        height: 12,
        borderRadius: 999,
        background: "rgba(255, 255, 255, 0.06)",
        overflow: "hidden",
        border: `1px solid ${COLORS.border}`,
    },
    lifecycleProgressBar: {
        height: "100%",
        borderRadius: 999,
        transition: "width 180ms ease",
    },
    lifecycleProgressText: {
        marginTop: 8,
        fontSize: 13,
        color: COLORS.label,
        fontWeight: 700,
    },
    lifecycleNotes: {
        display: "grid",
        gap: 8,
        marginTop: 2,
    },
    lifecycleNote: {
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        padding: 12,
        color: COLORS.neutral,
        fontSize: 13,
        lineHeight: 1.45,
    },
    miniGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 18,
    },
    miniCard: {
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 12,
        minWidth: 0,
    },
    miniCardLabel: {
        fontSize: 12,
        color: COLORS.label,
        marginBottom: 6,
        lineHeight: 1.35,
    },
    miniCardValue: {
        fontSize: 18,
        fontWeight: 800,
        lineHeight: 1.2,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
    checklistSection: {
        marginTop: 14,
    },
    checklistSectionTitle: {
        fontSize: 15,
        fontWeight: 800,
        color: COLORS.title,
        marginBottom: 10,
    },
    checklistHint: {
        fontSize: 12,
        color: COLORS.label,
        marginBottom: 10,
        lineHeight: 1.4,
    },
    checklistGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
    },
    checkItemButton: {
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        textAlign: "left",
        boxSizing: "border-box",
        minHeight: 54,
    },
    checkItemLeft: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
        flex: 1,
    },
    checkIndicator: {
        width: 18,
        height: 18,
        borderRadius: 4,
        border: `1px solid ${COLORS.borderStrong}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 900,
        flex: "0 0 18px",
    },
    sectionDivider: {
        height: 1,
        background: "rgba(255,255,255,0.06)",
        marginBottom: 20,
    },
    headerRow: {
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "flex-start",
        marginBottom: 16,
        flexWrap: "wrap",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
    },
    headerBlock: {
        minWidth: 0,
        maxWidth: "100%",
    },
    rulesTitle: {
        fontSize: 20,
        fontWeight: 800,
        color: COLORS.neutral,
        marginBottom: 6,
        lineHeight: 1.2,
    },
    subTitle: {
        fontSize: 14,
        color: COLORS.label,
        lineHeight: 1.4,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
    },
    versionBox: {
        textAlign: "right",
        minWidth: 0,
        maxWidth: "100%",
    },
    versionText: {
        fontSize: 12,
        color: COLORS.label,
        lineHeight: 1.4,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
    notice: {
        background: "rgba(34, 211, 238, 0.08)",
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        fontSize: 14,
        color: COLORS.cyan,
        lineHeight: 1.4,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        maxWidth: "100%",
        minWidth: 0,
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
    },
    item: {
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 12,
        minHeight: 86,
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
    },
    label: {
        fontSize: 12,
        color: COLORS.label,
        marginBottom: 6,
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
    section: {
        marginTop: 20,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 10,
        color: COLORS.title,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
    tableWrap: {
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: 12,
    },
    table: {
        width: "100%",
        minWidth: 640,
        borderCollapse: "collapse",
        background: COLORS.mutedBg,
        border: `1px solid ${COLORS.border}`,
    },
    th: {
        textAlign: "left",
        padding: 10,
        borderBottom: `1px solid ${COLORS.border}`,
        color: COLORS.label,
        fontSize: 12,
        background: COLORS.cardBg,
        whiteSpace: "nowrap",
    },
    td: {
        padding: 10,
        borderBottom: `1px solid ${COLORS.border}`,
        fontSize: 14,
        color: COLORS.neutral,
        verticalAlign: "top",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
    list: {
        margin: 0,
        paddingLeft: 18,
        maxWidth: "100%",
        minWidth: 0,
    },
    listItem: {
        marginBottom: 8,
        color: COLORS.neutral,
        lineHeight: 1.45,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        maxWidth: "100%",
    },
    sourceButtonGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
    },
    sourceButton: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 46,
        padding: "12px 14px",
        borderRadius: 12,
        background: COLORS.buttonBg,
        color: COLORS.buttonText,
        textDecoration: "none",
        fontWeight: 700,
        fontSize: 14,
        textAlign: "center",
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
        maxWidth: "100%",
    },
    emptyBox: {
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
        color: COLORS.label,
    },
    errorBox: {
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
    },
    errorText: {
        color: COLORS.orange,
        marginBottom: 8,
        lineHeight: 1.4,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
    mutedText: {
        color: COLORS.label,
        lineHeight: 1.4,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },
};