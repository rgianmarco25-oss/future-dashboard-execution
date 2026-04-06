import React from "react";
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
    cardBg: "rgba(255, 255, 255, 0.03)",
    mutedBg: "rgba(255, 255, 255, 0.02)",
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
};

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

    if (normalized === "No single profitable day may account for 50% or more of total profit since last approved payout.") {
        return "Kein einzelner profitabler Tag darf 50% oder mehr des Gesamtprofits seit der letzten genehmigten Auszahlung ausmachen.";
    }

    if (normalized === "Safety Net = drawdown limit + 100 USD. Only profit above safety net is payout eligible.") {
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

export default function RulesPanel({ accountId, account: accountProp }) {
    const resolvedAccountId = accountId || accountProp?.id || "";
    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null;
    const account = accountProp || storedAccount || null;

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
            <div style={styles.headerRow}>
                <div style={styles.headerBlock}>
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
                                    ? `${formatMoney(resolvedDailyLossLimit)} bei Balance ${formatMoney(currentBalance)}`
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
                                    ? `${resolvedMaxContracts} bei Balance ${formatMoney(currentBalance)}`
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