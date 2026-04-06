import { useEffect, useState } from "react";
import {
    getAccountById,
    getDailyState,
    getLiveAccountSnapshot,
    getRisk,
    saveRisk,
} from "../utils/storage";
import { evaluateRiskWarnings } from "../utils/riskEngine";
import { getRulesForAccount } from "../utils/apexRules";
import * as csvImportUtils from "../utils/csvImportUtils";
import { formatDate, formatDateTime } from "../utils/dateFormat";

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    label: "#94a3b8",
    neutral: "#ffffff",
    cyan: "#22d3ee",
    orange: "#fb923c",
    inputBg: "#000",
    cardBg: "rgba(255, 255, 255, 0.03)",
    okBg: "rgba(34, 211, 238, 0.12)",
    okBorder: "rgba(34, 211, 238, 0.35)",
    okText: "#67e8f9",
    warningBg: "rgba(251, 146, 60, 0.12)",
    warningBorder: "rgba(251, 146, 60, 0.35)",
    warningText: "#fdba74",
    breachBg: "rgba(248, 113, 113, 0.14)",
    breachBorder: "rgba(248, 113, 113, 0.35)",
    breachText: "#fca5a5",
    accountTypeBg: "rgba(125, 211, 252, 0.08)",
    accountTypeBorder: "rgba(125, 211, 252, 0.28)",
    accountTypeText: "#c4b5fd",
};

const wrapperStyle = {
    width: "100%",
};

const headerRowStyle = {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: "16px",
};

const inputGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
};

const labelStyle = {
    display: "block",
    color: COLORS.label,
    fontSize: "14px",
    marginBottom: "8px",
    textAlign: "center",
};

const inputStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    outline: "none",
};

const readonlyInputStyle = {
    ...inputStyle,
    opacity: 1,
};

const emptyStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "18px",
    textAlign: "center",
    color: COLORS.label,
    background: COLORS.cardBg,
};

const infoGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "16px",
};

const infoCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "14px",
    background: COLORS.cardBg,
    textAlign: "center",
    minHeight: "92px",
};

const infoLabelStyle = {
    color: COLORS.label,
    fontSize: "13px",
    marginBottom: "8px",
    lineHeight: 1.35,
};

const chipRowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "16px",
};

const chipBaseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid transparent",
    lineHeight: 1.3,
};

const noticeListStyle = {
    display: "grid",
    gap: "10px",
    marginTop: "16px",
};

const accountTypeStyle = {
    color: COLORS.accountTypeText,
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: 1.35,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
};

function createDefaultRisk() {
    return {
        takeProfit: "",
        stopLoss: "0",
        breakEven: "",
    };
}

function createEmptyLiveSnapshot(accountId = "") {
    return {
        accountId,
        accountName: accountId,
        numericAccountId: "",
        tradeDate: "",
        cashDate: "",
        cashTimestamp: "",
        startingBalance: 0,
        realizedPnl: 0,
        tradePnl: 0,
        fees: 0,
        totalAmount: 0,
        liveBalance: 0,
        currentBalance: 0,
        currency: "USD",
        hasImportedData: false,
    };
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return "-";
    }

    return `${numericValue.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`;
}

function getStatusText(status) {
    if (status === "breach") {
        return "Verletzt";
    }

    if (status === "warning") {
        return "Warnung";
    }

    return "OK";
}

function getChipStyle(status) {
    if (status === "breach") {
        return {
            ...chipBaseStyle,
            background: COLORS.breachBg,
            color: COLORS.breachText,
            borderColor: COLORS.breachBorder,
        };
    }

    if (status === "warning") {
        return {
            ...chipBaseStyle,
            background: COLORS.warningBg,
            color: COLORS.warningText,
            borderColor: COLORS.warningBorder,
        };
    }

    return {
        ...chipBaseStyle,
        background: COLORS.okBg,
        color: COLORS.okText,
        borderColor: COLORS.okBorder,
    };
}

function getNoticeStyle(level) {
    if (level === "breach") {
        return {
            padding: "14px 16px",
            borderRadius: "16px",
            border: `1px solid ${COLORS.breachBorder}`,
            background: COLORS.breachBg,
            color: COLORS.breachText,
            lineHeight: 1.45,
        };
    }

    if (level === "warning") {
        return {
            padding: "14px 16px",
            borderRadius: "16px",
            border: `1px solid ${COLORS.warningBorder}`,
            background: COLORS.warningBg,
            color: COLORS.warningText,
            lineHeight: 1.45,
        };
    }

    return {
        padding: "14px 16px",
        borderRadius: "16px",
        border: `1px solid ${COLORS.okBorder}`,
        background: COLORS.okBg,
        color: COLORS.okText,
        lineHeight: 1.45,
    };
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

function getValueStyle(value) {
    return {
        color: getValueColor(value),
        fontSize: "16px",
        fontWeight: "700",
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    };
}

export default function RiskPanel({ accountId, account: accountProp }) {
    const resolvedAccountId = accountId || accountProp?.id || "";
    const [riskByAccount, setRiskByAccount] = useState({});
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

    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null;
    const liveSnapshot = resolvedAccountId
        ? getLiveAccountSnapshot(resolvedAccountId) || createEmptyLiveSnapshot(resolvedAccountId)
        : createEmptyLiveSnapshot();

    const fallbackProfile = {
        ...(storedAccount || {}),
        ...(accountProp || {}),
        id: resolvedAccountId || accountProp?.id || storedAccount?.id || "",
    };

    const importData =
        typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports()
            : null;

    const importedLiveData =
        resolvedAccountId &&
            importData &&
            typeof csvImportUtils.buildLiveCardData === "function"
            ? csvImportUtils.buildLiveCardData(importData, resolvedAccountId, fallbackProfile)
            : null;

    const importedRiskData =
        resolvedAccountId &&
            importData &&
            typeof csvImportUtils.buildRiskData === "function"
            ? csvImportUtils.buildRiskData(importData, resolvedAccountId)
            : null;

    const hasImportedBalance = Boolean(
        importData?.accountBalanceHistory?.byAccount?.[resolvedAccountId]?.length
    );

    const hasImportedPositions = Boolean(
        importData?.positionHistory?.byAccount?.[resolvedAccountId]?.length
    );

    const hasImportedPerformance = Boolean(importData?.performance?.rows?.length);

    const isCsvMode = Boolean(hasImportedBalance || hasImportedPositions);

    const importedCurrentBalance = toNumber(
        importedLiveData?.liveBalance,
        toNumber(importedRiskData?.accountBalance, toNumber(liveSnapshot.liveBalance, 0))
    );

    const account = resolvedAccountId
        ? {
            ...(storedAccount || {}),
            ...(accountProp || {}),
            id: resolvedAccountId,
            currentBalance: isCsvMode
                ? importedCurrentBalance
                : toNumber(
                    liveSnapshot.liveBalance,
                    typeof accountProp?.currentBalance === "number"
                        ? accountProp.currentBalance
                        : typeof storedAccount?.currentBalance === "number"
                            ? storedAccount.currentBalance
                            : 0
                ),
        }
        : null;

    const risk = resolvedAccountId
        ? riskByAccount[resolvedAccountId] || getRisk(resolvedAccountId) || createDefaultRisk()
        : createDefaultRisk();

    const dailyState = resolvedAccountId ? getDailyState(resolvedAccountId) : null;
    const rules = account ? getRulesForAccount(account) : null;

    const startingBalance = isCsvMode
        ? toNumber(importedLiveData?.startBalance, toNumber(account?.accountSize, 0))
        : toNumber(liveSnapshot.startingBalance, toNumber(account?.accountSize, 0));

    const realizedPnl = isCsvMode
        ? toNumber(importedLiveData?.realizedPnL, toNumber(importedRiskData?.realizedPnL, 0))
        : toNumber(liveSnapshot.realizedPnl, 0);

    const unrealizedPnl = 0;

    const dailyPnl = isCsvMode
        ? toNumber(importedRiskData?.todayPnL, 0)
        : toNumber(realizedPnl + unrealizedPnl, 0);

    const realizedBalance = isCsvMode
        ? toNumber(
            importedLiveData?.realizedBalance,
            startingBalance + realizedPnl
        )
        : toNumber(liveSnapshot.totalAmount, toNumber(account?.currentBalance, 0));

    const liveBalance = isCsvMode
        ? toNumber(importedLiveData?.liveBalance, realizedBalance)
        : toNumber(liveSnapshot.liveBalance, toNumber(account?.currentBalance, 0));

    const plannedStop = isCsvMode ? 0 : toNumber(risk.stopLoss, 0);

    const stopRiskViolationCount = isCsvMode
        ? 0
        : toNumber(dailyState?.stopRiskViolationCount, 0);

    const totalTrades = isCsvMode ? toNumber(importedRiskData?.totalTrades, 0) : 0;
    const winners = isCsvMode ? toNumber(importedRiskData?.winners, 0) : 0;
    const losers = isCsvMode ? toNumber(importedRiskData?.losers, 0) : 0;
    const totalContracts = isCsvMode ? toNumber(importedRiskData?.totalContracts, 0) : 0;
    const bestTrade = isCsvMode ? toNumber(importedRiskData?.bestTrade, 0) : 0;
    const worstTrade = isCsvMode ? toNumber(importedRiskData?.worstTrade, 0) : 0;
    const averageDuration = isCsvMode ? importedRiskData?.averageDuration || "-" : "-";

    const evaluatedRisk = evaluateRiskWarnings({
        account,
        rules,
        plannedStop,
        realizedPnl: dailyPnl,
        unrealizedPnl,
        stopRiskViolationCount,
    });

    function handleChange(field, value) {
        if (!resolvedAccountId || isCsvMode) {
            return;
        }

        const updated = {
            ...risk,
            [field]: value,
        };

        setRiskByAccount((prev) => ({
            ...prev,
            [resolvedAccountId]: updated,
        }));

        saveRisk(resolvedAccountId, updated);
    }

    if (!resolvedAccountId) {
        return <div style={emptyStyle}>Kein Account gewählt.</div>;
    }

    if (isCsvMode) {
        return (
            <div style={wrapperStyle}>
                <div style={headerRowStyle}>
                    <div style={getChipStyle(evaluatedRisk.overallStatus)}>
                        Gesamtstatus. {getStatusText(evaluatedRisk.overallStatus)}
                    </div>
                </div>

                <div style={infoGridStyle}>
                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Balance CSV Datei</div>
                        <div style={getValueStyle(0)}>
                            {importData?.accountBalanceHistory?.meta?.fileName || "-"}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Position History Datei</div>
                        <div style={getValueStyle(0)}>
                            {importData?.positionHistory?.meta?.fileName || "-"}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Performance Datei</div>
                        <div style={getValueStyle(0)}>
                            {importData?.performance?.meta?.fileName || "-"}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Import Zeit</div>
                        <div style={getValueStyle(0)}>
                            {formatDateTime(
                                importData?.positionHistory?.meta?.importedAt ||
                                importData?.accountBalanceHistory?.meta?.importedAt ||
                                importData?.performance?.meta?.importedAt
                            )}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Letzter Trading Tag</div>
                        <div style={getValueStyle(0)}>
                            {formatDate(importedRiskData?.tradeDate || importedLiveData?.tradeDate)}
                        </div>
                    </div>

                    <div style={infoCardStyle}>
                        <div style={infoLabelStyle}>Performance aktiv</div>
                        <div style={getValueStyle(hasImportedPerformance ? 1 : 0)}>
                            {hasImportedPerformance ? "Ja" : "Nein"}
                        </div>
                    </div>
                </div>

                {account && rules ? (
                    <>
                        <div style={infoGridStyle}>
                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Start Balance</div>
                                <div style={getValueStyle(startingBalance)}>
                                    {formatMoney(startingBalance)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Aktuelle Balance</div>
                                <div style={getValueStyle(toNumber(account.currentBalance))}>
                                    {formatMoney(toNumber(account.currentBalance))}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Realized Balance</div>
                                <div style={getValueStyle(realizedBalance)}>
                                    {formatMoney(realizedBalance)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Live Balance</div>
                                <div style={getValueStyle(liveBalance)}>
                                    {formatMoney(liveBalance)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Max Drawdown</div>
                                <div style={getValueStyle(-Math.abs(rules?.maxDrawdown?.value ?? 0))}>
                                    {formatMoney(rules?.maxDrawdown?.value ?? null)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Daily Loss Limit</div>
                                <div style={getValueStyle(-Math.abs(evaluatedRisk.dailyLossLimit ?? 0))}>
                                    {formatMoney(evaluatedRisk.dailyLossLimit)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Drawdown Floor</div>
                                <div style={getValueStyle(evaluatedRisk.drawdownFloor)}>
                                    {formatMoney(evaluatedRisk.drawdownFloor)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Puffer bis Drawdown</div>
                                <div style={getValueStyle(evaluatedRisk.remainingDrawdownBuffer)}>
                                    {formatMoney(evaluatedRisk.remainingDrawdownBuffer)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Realized PnL</div>
                                <div style={getValueStyle(realizedPnl)}>
                                    {formatMoney(realizedPnl)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Unrealized PnL</div>
                                <div style={getValueStyle(unrealizedPnl)}>
                                    {formatMoney(unrealizedPnl)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Daily PnL</div>
                                <div style={getValueStyle(dailyPnl)}>
                                    {formatMoney(dailyPnl)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Geplanter Stop</div>
                                <div style={getValueStyle(0)}>
                                    CSV Read Only
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Puffer nach Stop</div>
                                <div style={getValueStyle(evaluatedRisk.remainingDrawdownBufferAfterStop)}>
                                    {formatMoney(evaluatedRisk.remainingDrawdownBufferAfterStop)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Stop Risk Violations</div>
                                <div style={getValueStyle(-Math.abs(stopRiskViolationCount))}>
                                    {stopRiskViolationCount}
                                </div>
                            </div>

                            <div
                                style={{
                                    ...infoCardStyle,
                                    background: COLORS.accountTypeBg,
                                    border: `1px solid ${COLORS.accountTypeBorder}`,
                                }}
                            >
                                <div style={infoLabelStyle}>Account Typ</div>
                                <div style={accountTypeStyle}>
                                    {String(account.productType || "").toUpperCase()} /{" "}
                                    {String(account.accountPhase || "").toUpperCase()}
                                </div>
                            </div>
                        </div>

                        <div style={infoGridStyle}>
                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Trades erkannt</div>
                                <div style={getValueStyle(totalTrades)}>{totalTrades}</div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Gewinner</div>
                                <div style={getValueStyle(winners)}>{winners}</div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Verlierer</div>
                                <div style={getValueStyle(-Math.abs(losers))}>{losers}</div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Kontrakte</div>
                                <div style={getValueStyle(totalContracts)}>{totalContracts}</div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Bester Trade</div>
                                <div style={getValueStyle(bestTrade)}>
                                    {formatMoney(bestTrade)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Schlechtester Trade</div>
                                <div style={getValueStyle(worstTrade)}>
                                    {formatMoney(worstTrade)}
                                </div>
                            </div>

                            <div style={infoCardStyle}>
                                <div style={infoLabelStyle}>Durchschnitt Dauer</div>
                                <div style={getValueStyle(0)}>{averageDuration}</div>
                            </div>
                        </div>

                        <div style={chipRowStyle}>
                            <div style={getChipStyle(evaluatedRisk.statuses.drawdownFloor)}>
                                Drawdown Floor. {getStatusText(evaluatedRisk.statuses.drawdownFloor)}
                            </div>

                            <div style={getChipStyle(evaluatedRisk.statuses.dailyLoss)}>
                                Daily Loss. {getStatusText(evaluatedRisk.statuses.dailyLoss)}
                            </div>

                            <div style={getChipStyle(evaluatedRisk.statuses.stopRisk)}>
                                Stop Risiko. {getStatusText(evaluatedRisk.statuses.stopRisk)}
                            </div>

                            <div style={getChipStyle(evaluatedRisk.statuses.stopRiskViolations)}>
                                Stop Violations. {getStatusText(evaluatedRisk.statuses.stopRiskViolations)}
                            </div>
                        </div>

                        <div style={noticeListStyle}>
                            <div style={getNoticeStyle("ok")}>
                                Position History und Account Balance History CSV sind aktiv. Risk zeigt jetzt importierte Werte read only an.
                            </div>

                            {evaluatedRisk.items.length === 0 ? (
                                <div style={getNoticeStyle("ok")}>
                                    Keine Regelwarnungen aktiv.
                                </div>
                            ) : (
                                evaluatedRisk.items.map((item) => (
                                    <div key={item.code} style={getNoticeStyle(item.level)}>
                                        {item.text}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div style={noticeListStyle}>
                        <div style={getNoticeStyle("warning")}>
                            Für diesen Account sind noch keine aktiven Regelwerte verfügbar.
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={wrapperStyle}>
            <div style={headerRowStyle}>
                <div style={getChipStyle(evaluatedRisk.overallStatus)}>
                    Gesamtstatus. {getStatusText(evaluatedRisk.overallStatus)}
                </div>
            </div>

            <div style={inputGridStyle}>
                <div>
                    <label style={labelStyle}>Take Profit</label>
                    <input
                        style={inputStyle}
                        type="number"
                        step="0.01"
                        value={risk.takeProfit}
                        onChange={(e) => handleChange("takeProfit", e.target.value)}
                        placeholder="0.00"
                    />
                </div>

                <div>
                    <label style={labelStyle}>Geplanter Stop</label>
                    <input
                        style={{
                            ...readonlyInputStyle,
                            color: getValueColor(plannedStop),
                        }}
                        type="number"
                        step="0.01"
                        value={plannedStop}
                        readOnly
                        placeholder="0.00"
                    />
                </div>

                <div>
                    <label style={labelStyle}>Break Even</label>
                    <input
                        style={inputStyle}
                        type="number"
                        step="0.01"
                        value={risk.breakEven}
                        onChange={(e) => handleChange("breakEven", e.target.value)}
                        placeholder="0.00"
                    />
                </div>
            </div>

            {account && rules ? (
                <>
                    <div style={infoGridStyle}>
                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Start Balance</div>
                            <div style={getValueStyle(startingBalance)}>
                                {formatMoney(startingBalance)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Aktuelle Balance</div>
                            <div style={getValueStyle(toNumber(account.currentBalance))}>
                                {formatMoney(toNumber(account.currentBalance))}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Realized Balance</div>
                            <div style={getValueStyle(realizedBalance)}>
                                {formatMoney(realizedBalance)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Live Balance</div>
                            <div style={getValueStyle(liveBalance)}>
                                {formatMoney(liveBalance)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Max Drawdown</div>
                            <div style={getValueStyle(-Math.abs(rules?.maxDrawdown?.value ?? 0))}>
                                {formatMoney(rules?.maxDrawdown?.value ?? null)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Daily Loss Limit</div>
                            <div style={getValueStyle(-Math.abs(evaluatedRisk.dailyLossLimit ?? 0))}>
                                {formatMoney(evaluatedRisk.dailyLossLimit)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Drawdown Floor</div>
                            <div style={getValueStyle(evaluatedRisk.drawdownFloor)}>
                                {formatMoney(evaluatedRisk.drawdownFloor)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Puffer bis Drawdown</div>
                            <div style={getValueStyle(evaluatedRisk.remainingDrawdownBuffer)}>
                                {formatMoney(evaluatedRisk.remainingDrawdownBuffer)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Geplanter Stop</div>
                            <div style={getValueStyle(-Math.abs(plannedStop))}>
                                {formatMoney(plannedStop)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Puffer nach Stop</div>
                            <div style={getValueStyle(evaluatedRisk.remainingDrawdownBufferAfterStop)}>
                                {formatMoney(evaluatedRisk.remainingDrawdownBufferAfterStop)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Realized PnL</div>
                            <div style={getValueStyle(realizedPnl)}>
                                {formatMoney(realizedPnl)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Unrealized PnL</div>
                            <div style={getValueStyle(unrealizedPnl)}>
                                {formatMoney(unrealizedPnl)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Daily PnL</div>
                            <div style={getValueStyle(dailyPnl)}>
                                {formatMoney(dailyPnl)}
                            </div>
                        </div>

                        <div style={infoCardStyle}>
                            <div style={infoLabelStyle}>Stop Risk Violations</div>
                            <div style={getValueStyle(-Math.abs(stopRiskViolationCount))}>
                                {evaluatedRisk.stopRiskViolationCount}
                            </div>
                        </div>

                        <div
                            style={{
                                ...infoCardStyle,
                                background: COLORS.accountTypeBg,
                                border: `1px solid ${COLORS.accountTypeBorder}`,
                            }}
                        >
                            <div style={infoLabelStyle}>Account Typ</div>
                            <div style={accountTypeStyle}>
                                {String(account.productType || "").toUpperCase()} /{" "}
                                {String(account.accountPhase || "").toUpperCase()}
                            </div>
                        </div>
                    </div>

                    <div style={chipRowStyle}>
                        <div style={getChipStyle(evaluatedRisk.statuses.drawdownFloor)}>
                            Drawdown Floor. {getStatusText(evaluatedRisk.statuses.drawdownFloor)}
                        </div>

                        <div style={getChipStyle(evaluatedRisk.statuses.dailyLoss)}>
                            Daily Loss. {getStatusText(evaluatedRisk.statuses.dailyLoss)}
                        </div>

                        <div style={getChipStyle(evaluatedRisk.statuses.stopRisk)}>
                            Stop Risiko. {getStatusText(evaluatedRisk.statuses.stopRisk)}
                        </div>

                        <div style={getChipStyle(evaluatedRisk.statuses.stopRiskViolations)}>
                            Stop Violations. {getStatusText(evaluatedRisk.statuses.stopRiskViolations)}
                        </div>
                    </div>

                    <div style={noticeListStyle}>
                        {evaluatedRisk.items.length === 0 ? (
                            <div style={getNoticeStyle("ok")}>
                                Keine Regelwarnungen aktiv.
                            </div>
                        ) : (
                            evaluatedRisk.items.map((item) => (
                                <div key={item.code} style={getNoticeStyle(item.level)}>
                                    {item.text}
                                </div>
                            ))
                        )}
                    </div>
                </>
            ) : (
                <div style={noticeListStyle}>
                    <div style={getNoticeStyle("warning")}>
                        Für diesen Account sind noch keine aktiven Regelwerte verfügbar.
                    </div>
                </div>
            )}
        </div>
    );
}