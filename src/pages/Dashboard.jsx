import LiveCard from "../components/LiveCard";
import RiskPanel from "../components/RiskPanel";
import OrdersPanel from "../components/OrdersPanel";
import PositionsPanel from "../components/PositionsPanel";
import JournalPanel from "../components/JournalPanel";
import ImportCenterPanel from "../components/ImportCenterPanel";
import SimulatorPanel from "../components/SimulatorPanel";
import ValidationPanel from "../components/ValidationPanel";
import AccountBalancePanel from "../components/AccountBalancePanel";
import {
    getAccountBalanceHistory,
    getFills,
    getLiveAccountSnapshot,
    getOrders,
} from "../utils/storage";
import {
    getProviderLabel,
    getProviderStatusLabel,
    getProviderTypeLabel,
} from "../utils/providerModel";
import {
    getActiveProvider,
    getStrictProviderAccountName,
    getStrictProviderTradingRef,
    hasStrictProviderIdentity,
    shouldUseAtasZeroState,
} from "../utils/providerDisplay";

const COLORS = {
    panelBg: "#050816",
    panelBgSoft: "rgba(255, 255, 255, 0.03)",
    panelBgStrong: "rgba(15, 23, 42, 0.82)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#f8fafc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    cyan: "#22d3ee",
    blue: "#38bdf8",
    gold: "#facc15",
    green: "#22c55e",
    yellow: "#f59e0b",
    red: "#ef4444",
    violet: "#a78bfa",
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value) {
    if (!Number.isFinite(Number(value))) {
        return "–";
    }

    return Number(value).toLocaleString("de-CH", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDateTime(value) {
    if (!value) {
        return "Kein Sync";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function getProviderStatusTone(status) {
    const normalized = cleanString(status).toLowerCase();

    if (normalized === "connected" || normalized === "ready") {
        return "green";
    }

    if (normalized === "syncing") {
        return "yellow";
    }

    if (normalized === "error" || normalized === "disconnected") {
        return "red";
    }

    return "neutral";
}

function getSafeRows(value) {
    return Array.isArray(value) ? value : [];
}

function getAccountLabelFallback(account) {
    if (!account) {
        return "";
    }

    return (
        cleanString(account?.displayName) ||
        cleanString(account?.tradingAccountName) ||
        cleanString(account?.tradingAccountId) ||
        cleanString(account?.id)
    );
}

function getGroupAccounts(group) {
    const slots = group?.slots || {};

    return [
        slots.evalEod || null,
        slots.paEod || null,
        slots.evalIntraday || null,
        slots.paIntraday || null,
        ...(Array.isArray(group?.accounts) ? group.accounts : []),
    ].filter((account, index, array) => {
        if (!account?.id) {
            return false;
        }

        return array.findIndex((item) => item?.id === account.id) === index;
    });
}

function getFirstGroupAccount(group) {
    const accounts = getGroupAccounts(group);
    return accounts.length ? accounts[0] : null;
}

function resolveGroupTitle(group, getAccountDisplayName) {
    const rawTitle = cleanString(group?.title);

    if (rawTitle && rawTitle.toLowerCase() !== "kein account") {
        return rawTitle;
    }

    const fallbackAccount = getFirstGroupAccount(group);

    if (!fallbackAccount) {
        return "Gruppe";
    }

    const displayName =
        typeof getAccountDisplayName === "function"
            ? cleanString(getAccountDisplayName(fallbackAccount))
            : "";

    return displayName || getAccountLabelFallback(fallbackAccount) || "Gruppe";
}

function buildRuntimeAccountMeta(account) {
    if (!account?.id) {
        return {
            snapshot: null,
            provider: "tradovate",
            providerLabel: getProviderLabel("tradovate"),
            providerTypeLabel: getProviderTypeLabel("", "tradovate"),
            providerStatusLabel: getProviderStatusLabel(""),
            providerStatusTone: "neutral",
            lastSyncAtValue: "",
            lastSyncLabel: "Kein Sync",
            sourceName: "Offen",
            tradingRef: "Offen",
            orderCount: 0,
            fillCount: 0,
            balancePoints: 0,
            startBalance: 0,
            currentBalance: 0,
            delta: 0,
            orders: [],
            fills: [],
            cashHistory: [],
            hasIdentity: false,
        };
    }

    const snapshot = getLiveAccountSnapshot(account.id);
    const provider = getActiveProvider(account, snapshot);
    const hasIdentity = hasStrictProviderIdentity(account, snapshot, provider);
    const zeroState = shouldUseAtasZeroState(account, snapshot, provider);

const rawOrders =
    provider === "atas"
        ? (Array.isArray(snapshot?.orders) ? snapshot.orders : EMPTY_LIST)
        : Array.isArray(snapshot?.orders) && snapshot.orders.length > 0
            ? snapshot.orders
            : getSafeRows(getOrders(account.id));

const rawFills =
    provider === "atas"
        ? (Array.isArray(snapshot?.fills) ? snapshot.fills : EMPTY_LIST)
        : Array.isArray(snapshot?.fills) && snapshot.fills.length > 0
            ? snapshot.fills
            : getSafeRows(getFills(account.id));

const rawCashHistory =
    provider === "atas"
        ? Array.isArray(snapshot?.balanceHistory)
            ? snapshot.balanceHistory
            : Array.isArray(snapshot?.cashHistory)
                ? snapshot.cashHistory
                : EMPTY_LIST
        : Array.isArray(snapshot?.balanceHistory) && snapshot.balanceHistory.length > 0
            ? snapshot.balanceHistory
            : Array.isArray(snapshot?.cashHistory) && snapshot.cashHistory.length > 0
                ? snapshot.cashHistory
                : getSafeRows(getAccountBalanceHistory(account.id));

    const orders = zeroState ? [] : rawOrders;
    const fills = zeroState ? [] : rawFills;
    const cashHistory = zeroState ? [] : rawCashHistory;

    const providerType = cleanString(
        snapshot?.dataProviderType || account?.dataProviderType
    );

    const providerStatus = cleanString(
        snapshot?.dataProviderStatus || account?.dataProviderStatus
    );

    const fallbackStartBalance = Math.max(
        toNumber(snapshot?.startingBalance, 0),
        toNumber(account?.startingBalance, 0),
        toNumber(account?.accountSize, 0)
    );

const startBalance = zeroState
    ? fallbackStartBalance
    : provider === "atas"
        ? toNumber(snapshot?.startingBalance, fallbackStartBalance)
        : toNumber(
            snapshot?.startingBalance,
            toNumber(account?.startingBalance, toNumber(account?.accountSize, 0))
        );

const currentBalance = zeroState
    ? startBalance
    : provider === "atas"
        ? toNumber(snapshot?.currentBalance, startBalance)
        : toNumber(
            snapshot?.currentBalance,
            toNumber(account?.currentBalance, startBalance)
        );

    const tradingRef = getStrictProviderTradingRef(account, snapshot, provider);
    const sourceName = getStrictProviderAccountName(account, snapshot, provider) || tradingRef;

    const lastSyncAtValue = cleanString(
        snapshot?.lastSyncAt || account?.lastSyncAt
    );

    return {
        snapshot,
        provider,
        providerLabel: getProviderLabel(provider),
        providerTypeLabel: getProviderTypeLabel(providerType, provider),
        providerStatusLabel: getProviderStatusLabel(providerStatus),
        providerStatusTone: getProviderStatusTone(providerStatus),
        lastSyncAtValue,
        lastSyncLabel: formatDateTime(lastSyncAtValue),
        sourceName,
        tradingRef,
        orderCount: orders.length,
        fillCount: fills.length,
        balancePoints: cashHistory.length,
        startBalance,
        currentBalance,
        delta: zeroState ? 0 : currentBalance - startBalance,
        orders,
        fills,
        cashHistory,
        hasIdentity,
    };
}
function DashboardCard({ title, subtitle = "", children }) {
    return (
        <section
            style={{
                display: "grid",
                gap: 12,
                padding: 18,
                borderRadius: 18,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBgSoft,
                boxShadow: COLORS.shadow,
            }}
        >
            <div style={{ display: "grid", gap: 4 }}>
                <div
                    style={{
                        color: COLORS.title,
                        fontSize: 15,
                        fontWeight: 800,
                    }}
                >
                    {title}
                </div>
                {subtitle ? (
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 12,
                            lineHeight: 1.45,
                        }}
                    >
                        {subtitle}
                    </div>
                ) : null}
            </div>

            {children}
        </section>
    );
}

function MetricCard({ label, value, note = "", tone = "cyan" }) {
    const toneMap = {
        cyan: COLORS.cyan,
        blue: COLORS.blue,
        gold: COLORS.gold,
        green: COLORS.green,
        yellow: COLORS.yellow,
        red: COLORS.red,
        violet: COLORS.violet,
        white: COLORS.title,
    };

    return (
        <div
            style={{
                borderRadius: 16,
                border: `1px solid ${COLORS.border}`,
                background: "rgba(255,255,255,0.02)",
                padding: 14,
                display: "grid",
                gap: 6,
            }}
        >
            <div
                style={{
                    color: COLORS.muted,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color: toneMap[tone] || COLORS.cyan,
                    fontSize: 16,
                    fontWeight: 900,
                    lineHeight: 1.2,
                    overflowWrap: "anywhere",
                }}
            >
                {value}
            </div>
            {note ? (
                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 11,
                        lineHeight: 1.4,
                    }}
                >
                    {note}
                </div>
            ) : null}
        </div>
    );
}

function InfoChip({ label, tone = "neutral" }) {
    const toneMap = {
        neutral: {
            color: COLORS.text,
            border: COLORS.border,
            bg: "rgba(255,255,255,0.04)",
        },
        cyan: {
            color: COLORS.cyan,
            border: "rgba(34, 211, 238, 0.24)",
            bg: "rgba(34, 211, 238, 0.10)",
        },
        green: {
            color: COLORS.green,
            border: "rgba(34, 197, 94, 0.24)",
            bg: "rgba(34, 197, 94, 0.10)",
        },
        yellow: {
            color: COLORS.yellow,
            border: "rgba(245, 158, 11, 0.24)",
            bg: "rgba(245, 158, 11, 0.10)",
        },
        red: {
            color: COLORS.red,
            border: "rgba(239, 68, 68, 0.24)",
            bg: "rgba(239, 68, 68, 0.10)",
        },
        violet: {
            color: COLORS.violet,
            border: "rgba(167, 139, 250, 0.24)",
            bg: "rgba(167, 139, 250, 0.10)",
        },
    };

    const ui = toneMap[tone] || toneMap.neutral;

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 28,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${ui.border}`,
                background: ui.bg,
                color: ui.color,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.04em",
            }}
        >
            {label}
        </span>
    );
}

function EmptyState({ text = "Kein Account ausgewählt." }) {
    return (
        <div
            style={{
                borderRadius: 18,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBgSoft,
                minHeight: 180,
                display: "grid",
                placeItems: "center",
                padding: 24,
                color: COLORS.muted,
                fontSize: 14,
                textAlign: "center",
            }}
        >
            {text}
        </div>
    );
}
function AccountGroupCard({
    group,
    onSelectAccount,
    onDeleteAccount,
    onUnlinkAccounts,
    getAccountDisplayName,
    getAccountPhase,
    getAccountMode,
    getAccountSizeLabel,
    getAccountRiskStatus,
    getRiskColors,
}) {
    const slots = group?.slots || {};
    const slotList = [
        { key: "evalEod", label: "EVAL EOD", account: slots.evalEod || null },
        { key: "paEod", label: "PA EOD", account: slots.paEod || null },
        { key: "evalIntraday", label: "EVAL Intraday", account: slots.evalIntraday || null },
        { key: "paIntraday", label: "PA Intraday", account: slots.paIntraday || null },
    ];

    const groupTitle = resolveGroupTitle(group, getAccountDisplayName);

    return (
        <DashboardCard
            title={groupTitle}
            subtitle={`${group?.accounts?.length || 0} Konten in dieser Gruppe`}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 12,
                }}
            >
                {slotList.map((slot) => {
                    const account = slot.account;
                    const riskState = account?.id
                        ? getAccountRiskStatus(account.id)
                        : { state: "neutral" };
                    const riskColors = getRiskColors(riskState.state);
                    const runtimeMeta = buildRuntimeAccountMeta(account);

                    return (
                        <div
                            key={slot.key}
                            style={{
                                borderRadius: 16,
                                border: `1px solid ${COLORS.border}`,
                                background: "rgba(255,255,255,0.02)",
                                padding: 14,
                                display: "grid",
                                gap: 10,
                                minHeight: 180,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 10,
                                    flexWrap: "wrap",
                                }}
                            >
                                <div
                                    style={{
                                        color: COLORS.title,
                                        fontSize: 13,
                                        fontWeight: 900,
                                    }}
                                >
                                    {slot.label}
                                </div>

                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        border: `1px solid ${riskColors.border}`,
                                        background: riskColors.bg,
                                        color: riskColors.text,
                                        fontSize: 10,
                                        fontWeight: 800,
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: 999,
                                            background: riskColors.dot,
                                        }}
                                    />
                                    {riskColors.label}
                                </span>
                            </div>

                            {account ? (
                                <>
                                    <div
                                        style={{
                                            color: COLORS.text,
                                            fontSize: 14,
                                            fontWeight: 800,
                                            lineHeight: 1.4,
                                            overflowWrap: "anywhere",
                                        }}
                                    >
                                        {getAccountDisplayName(account)}
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <InfoChip label={getAccountPhase(account)} tone="cyan" />
                                        <InfoChip label={getAccountMode(account)} tone="violet" />
                                        <InfoChip label={getAccountSizeLabel(account)} tone="yellow" />
                                    </div>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                            gap: 8,
                                        }}
                                    >
                                        <MetricCard
                                            label="Provider"
                                            value={runtimeMeta.providerLabel}
                                            note={runtimeMeta.providerTypeLabel}
                                            tone="cyan"
                                        />
                                        <MetricCard
                                            label="Status"
                                            value={runtimeMeta.providerStatusLabel}
                                            note={runtimeMeta.lastSyncLabel}
                                            tone={
                                                runtimeMeta.providerStatusTone === "green"
                                                    ? "green"
                                                    : runtimeMeta.providerStatusTone === "yellow"
                                                        ? "yellow"
                                                        : runtimeMeta.providerStatusTone === "red"
                                                            ? "red"
                                                            : "white"
                                            }
                                        />
                                        <MetricCard
                                            label="Orders / Fills"
                                            value={`${runtimeMeta.orderCount} / ${runtimeMeta.fillCount}`}
                                            note="Aktueller Speicherstand"
                                            tone="gold"
                                        />
                                        <MetricCard
                                            label="Trading Ref"
                                            value={runtimeMeta.tradingRef}
                                            note={runtimeMeta.sourceName || "Kein Provider Konto"}
                                            tone="white"
                                        />
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onSelectAccount(account.id)}
                                            style={{
                                                border: `1px solid ${COLORS.cyan}`,
                                                background: "rgba(34, 211, 238, 0.12)",
                                                color: COLORS.text,
                                                borderRadius: 12,
                                                padding: "9px 12px",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                            }}
                                        >
                                            Aktiv setzen
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onDeleteAccount(account.id)}
                                            style={{
                                                border: `1px solid rgba(239, 68, 68, 0.28)`,
                                                background: "rgba(239, 68, 68, 0.10)",
                                                color: "#fecaca",
                                                borderRadius: 12,
                                                padding: "9px 12px",
                                                fontWeight: 800,
                                                cursor: "pointer",
                                            }}
                                        >
                                            Löschen
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div
                                    style={{
                                        color: COLORS.muted,
                                        fontSize: 13,
                                        lineHeight: 1.45,
                                    }}
                                >
                                    Für diesen Slot ist aktuell kein Account vorhanden.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {group?.evalAccount && group?.paAccount ? (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <button
                        type="button"
                        onClick={() => onUnlinkAccounts(group.evalAccount.id, group.paAccount.id)}
                        style={{
                            border: `1px solid ${COLORS.borderStrong}`,
                            background: "rgba(255,255,255,0.04)",
                            color: COLORS.text,
                            borderRadius: 12,
                            padding: "10px 12px",
                            fontWeight: 800,
                            cursor: "pointer",
                        }}
                    >
                        EVAL und PA trennen
                    </button>
                </div>
            ) : null}
        </DashboardCard>
    );
}

export default function Dashboard({
    activeAccount,
    activeAccountId,
    accounts = [],
    accountGroups = [],
    activeView = "overview",
    onSelectAccount,
    onDeleteAccount,
    onUnlinkAccounts,
    getAccountDisplayName,
    getAccountPhase,
    getAccountMode,
    getAccountSizeLabel,
    getAccountRiskStatus,
    getRiskColors,
}) {
    const providerMeta = buildRuntimeAccountMeta(activeAccount);

    if (!activeAccount && activeView !== "accounts") {
        return <EmptyState text="Wähle zuerst einen aktiven Account." />;
    }

    if (activeView === "overview") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Übersicht"
                    subtitle="Kompakte Übersicht für den aktiven Account."
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                            }}
                        >
                            <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                            <InfoChip label={providerMeta.providerTypeLabel} tone="violet" />
                            <InfoChip
                                label={providerMeta.providerStatusLabel}
                                tone={providerMeta.providerStatusTone}
                            />
                            <InfoChip label={`Sync ${providerMeta.lastSyncLabel}`} tone="neutral" />
                            <InfoChip label={`Orders ${providerMeta.orderCount}`} tone="yellow" />
                            <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                        </div>

                        <div
                            style={{
                                color: COLORS.muted,
                                fontSize: 12,
                                lineHeight: 1.45,
                                overflowWrap: "anywhere",
                            }}
                        >
                            Quelle: {providerMeta.sourceName || "Kein Provider Konto"}
                        </div>
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="Account Details"
                    subtitle="Provider Kennzahlen und Verlauf für den aktiven Account."
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <MetricCard
                            label="Trading Ref"
                            value={providerMeta.tradingRef}
                            note={providerMeta.providerLabel}
                            tone="white"
                        />
                        <MetricCard
                            label="Phase"
                            value={getAccountPhase(activeAccount)}
                            note={getAccountMode(activeAccount)}
                            tone="cyan"
                        />
                        <MetricCard
                            label="Kontogröße"
                            value={getAccountSizeLabel(activeAccount)}
                            note="Account Size"
                            tone="violet"
                        />
                        <MetricCard
                            label="Status"
                            value={cleanString(activeAccount?.accountStatus) || "Offen"}
                            note="Lifecycle"
                            tone="green"
                        />
                        <MetricCard
                            label="Provider"
                            value={providerMeta.providerLabel}
                            note={providerMeta.providerTypeLabel}
                            tone="cyan"
                        />
                        <MetricCard
                            label="Provider Status"
                            value={providerMeta.providerStatusLabel}
                            note={providerMeta.lastSyncLabel}
                            tone={
                                providerMeta.providerStatusTone === "green"
                                    ? "green"
                                    : providerMeta.providerStatusTone === "yellow"
                                        ? "yellow"
                                        : providerMeta.providerStatusTone === "red"
                                            ? "red"
                                            : "white"
                            }
                        />
                        <MetricCard
                            label="Orders / Fills"
                            value={`${providerMeta.orderCount} / ${providerMeta.fillCount}`}
                            note="Aktueller Speicherstand"
                            tone="gold"
                        />
                        <MetricCard
                            label="Balance Punkte"
                            value={providerMeta.balancePoints}
                            note="Cash History Zeilen"
                            tone="yellow"
                        />
                        <MetricCard
                            label="Start Balance"
                            value={formatCurrency(providerMeta.startBalance)}
                            note="Erster Stand"
                            tone="gold"
                        />
                        <MetricCard
                            label="Aktuelle Balance"
                            value={formatCurrency(providerMeta.currentBalance)}
                            note="Letzter Stand"
                            tone="cyan"
                        />
                        <MetricCard
                            label="Delta"
                            value={formatCurrency(providerMeta.delta)}
                            note="Aktuell minus Start"
                            tone={providerMeta.delta >= 0 ? "green" : "red"}
                        />
                        <MetricCard
                            label="Quelle"
                            value={providerMeta.sourceName || "Kein Provider Konto"}
                            note="Provider Konto"
                            tone="white"
                        />
                    </div>
                </DashboardCard>

                <LiveCard
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <RiskPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    if (activeView === "balance") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Balance"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.lastSyncLabel}`}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                        <InfoChip label={providerMeta.providerTypeLabel} tone="violet" />
                        <InfoChip
                            label={providerMeta.providerStatusLabel}
                            tone={providerMeta.providerStatusTone}
                        />
                        <InfoChip label={`Orders ${providerMeta.orderCount}`} tone="yellow" />
                        <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                    </div>
                </DashboardCard>

                <AccountBalancePanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    if (activeView === "accounts") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Accounts"
                    subtitle="Gruppen, Slots und Provider Status auf einen Blick."
                >
                    <div
                        style={{
                            display: "grid",
                            gap: 12,
                        }}
                    >
                        {accountGroups.length ? (
                            accountGroups.map((group) => (
                                <AccountGroupCard
                                    key={group.id}
                                    group={group}
                                    onSelectAccount={onSelectAccount}
                                    onDeleteAccount={onDeleteAccount}
                                    onUnlinkAccounts={onUnlinkAccounts}
                                    getAccountDisplayName={getAccountDisplayName}
                                    getAccountPhase={getAccountPhase}
                                    getAccountMode={getAccountMode}
                                    getAccountSizeLabel={getAccountSizeLabel}
                                    getAccountRiskStatus={getAccountRiskStatus}
                                    getRiskColors={getRiskColors}
                                />
                            ))
                        ) : (
                            <EmptyState text="Noch keine Account Gruppen vorhanden." />
                        )}
                    </div>
                </DashboardCard>
                {!accountGroups.length && accounts.length ? (
                    <DashboardCard
                        title="Einzelkonten"
                        subtitle="Falls noch keine Gruppen gebildet wurden."
                    >
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                                gap: 12,
                            }}
                        >
                            {accounts.map((account) => {
                                const runtimeMeta = buildRuntimeAccountMeta(account);

                                return (
                                    <div
                                        key={account.id}
                                        style={{
                                            borderRadius: 16,
                                            border: `1px solid ${COLORS.border}`,
                                            background: "rgba(255,255,255,0.02)",
                                            padding: 14,
                                            display: "grid",
                                            gap: 10,
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: COLORS.text,
                                                fontSize: 14,
                                                fontWeight: 800,
                                                overflowWrap: "anywhere",
                                            }}
                                        >
                                            {getAccountDisplayName(account)}
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <InfoChip label={getAccountPhase(account)} tone="cyan" />
                                            <InfoChip label={getAccountMode(account)} tone="violet" />
                                            <InfoChip label={getAccountSizeLabel(account)} tone="yellow" />
                                        </div>

                                        <div
                                            style={{
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            {runtimeMeta.providerLabel} • {runtimeMeta.providerTypeLabel} • {runtimeMeta.providerStatusLabel}
                                        </div>

                                        <div
                                            style={{
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            Sync: {runtimeMeta.lastSyncLabel}
                                        </div>

                                        <div
                                            style={{
                                                color: COLORS.muted,
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                                overflowWrap: "anywhere",
                                            }}
                                        >
                                            Trading Ref: {runtimeMeta.tradingRef}
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSelectAccount(account.id)}
                                                style={{
                                                    border: `1px solid ${COLORS.cyan}`,
                                                    background: "rgba(34, 211, 238, 0.12)",
                                                    color: COLORS.text,
                                                    borderRadius: 12,
                                                    padding: "9px 12px",
                                                    fontWeight: 800,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Aktiv setzen
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onDeleteAccount(account.id)}
                                                style={{
                                                    border: `1px solid rgba(239, 68, 68, 0.28)`,
                                                    background: "rgba(239, 68, 68, 0.10)",
                                                    color: "#fecaca",
                                                    borderRadius: 12,
                                                    padding: "9px 12px",
                                                    fontWeight: 800,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Löschen
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </DashboardCard>
                ) : null}
            </div>
        );
    }

    if (activeView === "trades") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Trades"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • Orders ${providerMeta.orderCount} • Fills ${providerMeta.fillCount}`}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                        <InfoChip label={providerMeta.providerTypeLabel} tone="violet" />
                        <InfoChip
                            label={providerMeta.providerStatusLabel}
                            tone={providerMeta.providerStatusTone}
                        />
                        <InfoChip label={`Sync ${providerMeta.lastSyncLabel}`} tone="neutral" />
                    </div>
                </DashboardCard>

                <OrdersPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <PositionsPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <JournalPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    if (activeView === "analysis") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Analyse"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.lastSyncLabel}`}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <MetricCard
                            label="Provider"
                            value={providerMeta.providerLabel}
                            note={providerMeta.providerTypeLabel}
                            tone="cyan"
                        />
                        <MetricCard
                            label="Status"
                            value={providerMeta.providerStatusLabel}
                            note={providerMeta.lastSyncLabel}
                            tone={
                                providerMeta.providerStatusTone === "green"
                                    ? "green"
                                    : providerMeta.providerStatusTone === "yellow"
                                        ? "yellow"
                                        : providerMeta.providerStatusTone === "red"
                                            ? "red"
                                            : "white"
                            }
                        />
                        <MetricCard
                            label="Orders"
                            value={providerMeta.orderCount}
                            note="Aktiver Speicherstand"
                            tone="yellow"
                        />
                        <MetricCard
                            label="Fills"
                            value={providerMeta.fillCount}
                            note="Aktiver Speicherstand"
                            tone="yellow"
                        />
                    </div>
                </DashboardCard>

                <ValidationPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <SimulatorPanel
                    activeAccount={activeAccount}
                    title="Simulator Panel"
                />
            </div>
        );
    }

    if (activeView === "imports") {
        return (
            <div style={{ display: "grid", gap: 14 }}>
                <DashboardCard
                    title="Import"
                    subtitle={`${providerMeta.providerLabel} • ${providerMeta.providerStatusLabel} • ${providerMeta.lastSyncLabel}`}
                >
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <InfoChip label={providerMeta.providerLabel} tone="cyan" />
                        <InfoChip label={providerMeta.providerTypeLabel} tone="violet" />
                        <InfoChip
                            label={providerMeta.providerStatusLabel}
                            tone={providerMeta.providerStatusTone}
                        />
                        <InfoChip label={`Orders ${providerMeta.orderCount}`} tone="yellow" />
                        <InfoChip label={`Fills ${providerMeta.fillCount}`} tone="yellow" />
                    </div>
                </DashboardCard>

                <ImportCenterPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />

                <ValidationPanel
                    activeAccount={activeAccount}
                    activeAccountId={activeAccountId}
                    accountId={activeAccount?.id}
                />
            </div>
        );
    }

    return <EmptyState text="Diese Ansicht ist aktuell nicht verfügbar." />;
}