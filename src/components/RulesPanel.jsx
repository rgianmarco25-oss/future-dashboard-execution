import React, { useEffect, useState } from "react";
import { getAccountById } from "../utils/storage";
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

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function formatMoney(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    return `${Number(value).toLocaleString("de-DE", {
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

export default function RulesPanel({ accountId, account: accountProp }) {
    const resolvedAccountId = accountId || accountProp?.id || "";
    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null;
    const account = accountProp || storedAccount || null;

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

    const currentBalance =
        typeof account.currentBalance === "number" ? account.currentBalance : null;

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
                    <div style={styles.label}>PA Activation Deadline</div>
                    <div style={getValueStyle(0)}>
                        {formatDays(rules.paActivationDeadlineDays)}
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