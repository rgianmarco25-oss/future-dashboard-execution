import { useMemo } from "react";
import LiveCard from "../components/LiveCard";
import RiskPanel from "../components/RiskPanel";
import RulesPanel from "../components/RulesPanel";
import OrdersPanel from "../components/OrdersPanel";
import PositionsPanel from "../components/PositionsPanel";
import JournalPanel from "../components/JournalPanel";
import SessionRadar from "../components/SessionRadar";
import ImportCenterPanel from "../components/ImportCenterPanel";
import { formatDateTime } from "../utils/dateFormat";
import { getAccountBalanceHistory, getFills } from "../utils/storage";

const COLORS = {
    bg: "#050816",
    panelBg: "rgba(255, 255, 255, 0.04)",
    panelBgStrong: "rgba(255, 255, 255, 0.06)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
    title: "#e0f2fe",
    text: "#dbeafe",
    textSoft: "#94a3b8",
    cyan: "#22d3ee",
    green: "#4ade80",
    orange: "#fb923c",
    red: "#f87171",
    purple: "#a78bfa",
    yellow: "#facc15",
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function getPhaseLabel(phase) {
    const map = {
        eval: "EVAL",
        pa: "PA",
    };

    return map[cleanString(phase).toLowerCase()] || "EVAL";
}

function getStatusLabel(status) {
    const map = {
        open: "Offen",
        active: "Aktiv",
        passed: "Bestanden",
        failed: "Failed",
        archived: "Archiv",
    };

    return map[cleanString(status).toLowerCase()] || "Offen";
}

function getStatusColor(status) {
    const normalized = cleanString(status).toLowerCase();

    if (normalized === "active") {
        return COLORS.green;
    }

    if (normalized === "passed") {
        return COLORS.cyan;
    }

    if (normalized === "failed") {
        return COLORS.red;
    }

    if (normalized === "archived") {
        return COLORS.orange;
    }

    return COLORS.yellow;
}

function getProductTypeLabel(productType) {
    const map = {
        eod: "EOD",
        intraday: "Intraday",
    };

    return map[cleanString(productType).toLowerCase()] || "EOD";
}

function getGroupStatusMeta(status) {
    const normalized = cleanString(status).toLowerCase();

    if (normalized === "pa_active") {
        return {
            label: "PA aktiv",
            color: COLORS.green,
        };
    }

    if (normalized === "pa_passed") {
        return {
            label: "PA bestanden",
            color: COLORS.cyan,
        };
    }

    if (normalized === "pa_archived") {
        return {
            label: "PA archiviert",
            color: COLORS.orange,
        };
    }

    if (normalized === "eval_passed") {
        return {
            label: "EVAL bestanden",
            color: COLORS.purple,
        };
    }

    if (normalized === "failed") {
        return {
            label: "Gruppe failed",
            color: COLORS.red,
        };
    }

    if (normalized === "archived") {
        return {
            label: "Gruppe archiviert",
            color: COLORS.orange,
        };
    }

    return {
        label: "Gruppe offen",
        color: COLORS.yellow,
    };
}

function findGroupByAccountId(accountGroups, accountId) {
    const id = cleanString(accountId);

    if (!id || !Array.isArray(accountGroups)) {
        return null;
    }

    return (
        accountGroups.find((group) => {
            const evalId = cleanString(group?.evalAccount?.id);
            const paIds = Array.isArray(group?.paAccounts)
                ? group.paAccounts.map((account) => cleanString(account?.id))
                : [];

            return evalId === id || paIds.includes(id);
        }) || null
    );
}

function buildLifecycleItems(account) {
    if (!account) {
        return [];
    }

    return [
        { label: "Created", value: formatDateTime(account.createdAt) },
        { label: "Status geändert", value: formatDateTime(account.statusChangedAt) },
        { label: "Phase geändert", value: formatDateTime(account.phaseChangedAt) },
        { label: "Linked", value: formatDateTime(account.linkedAt) },
        { label: "Unlinked", value: formatDateTime(account.unlinkedAt) },
        { label: "Passed", value: formatDateTime(account.passedAt) },
        { label: "Failed", value: formatDateTime(account.failedAt) },
        { label: "Archived", value: formatDateTime(account.archivedAt) },
        {
            label: "Lifecycle Version",
            value:
                account.lifecycleVersion === null ||
                    account.lifecycleVersion === undefined
                    ? "0"
                    : String(account.lifecycleVersion),
        },
    ];
}

function InfoCard({ label, value, color }) {
    return (
        <div
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${color || COLORS.border}`,
                borderRadius: 16,
                padding: 14,
                minHeight: 78,
            }}
        >
            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 11,
                    marginBottom: 6,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color: color || COLORS.text,
                    fontSize: 14,
                    fontWeight: 700,
                    wordBreak: "break-word",
                }}
            >
                {value || "–"}
            </div>
        </div>
    );
}

function GridCell({ colSpan = 12, children }) {
    return (
        <div
            style={{
                gridColumn: `span ${colSpan}`,
                minWidth: 0,
            }}
        >
            {children}
        </div>
    );
}

export default function Dashboard(props) {
    const {
        accounts = [],
        accountGroups = [],
        activeAccount,
        activeAccountId = "",
        selectedAccount,
        selectedAccountId = "",
        orders = [],
        simulationTrades = [],
        fills: fillsFromProps,
    } = props || {};

    const resolvedAccountId =
        cleanString(activeAccountId) || cleanString(selectedAccountId);

    const resolvedAccount = useMemo(() => {
        if (activeAccount && cleanString(activeAccount.id) === resolvedAccountId) {
            return activeAccount;
        }

        if (selectedAccount && cleanString(selectedAccount.id) === resolvedAccountId) {
            return selectedAccount;
        }

        return (
            accounts.find((account) => cleanString(account?.id) === resolvedAccountId) || null
        );
    }, [accounts, activeAccount, selectedAccount, resolvedAccountId]);

    const activeGroup = useMemo(() => {
        return findGroupByAccountId(accountGroups, resolvedAccountId);
    }, [accountGroups, resolvedAccountId]);

    const lifecycleItems = useMemo(() => {
        return buildLifecycleItems(resolvedAccount);
    }, [resolvedAccount]);

    const groupStatusMeta = useMemo(() => {
        return getGroupStatusMeta(activeGroup?.groupStatus || "open");
    }, [activeGroup]);

    const linkedAccountsText = useMemo(() => {
        if (!activeGroup) {
            return "–";
        }

        const evalLabel = activeGroup.evalAccount
            ? activeGroup.evalAccount.displayName || activeGroup.evalAccount.id
            : "Kein EVAL";

        const paLabels = Array.isArray(activeGroup.paAccounts)
            ? activeGroup.paAccounts.map((account) => account.displayName || account.id)
            : [];

        if (!paLabels.length) {
            return `${evalLabel} | kein PA`;
        }

        return `${evalLabel} | ${paLabels.join(" | ")}`;
    }, [activeGroup]);

    const fills = useMemo(() => {
        if (Array.isArray(fillsFromProps)) {
            return fillsFromProps;
        }

        if (!resolvedAccountId) {
            return [];
        }

        const nextFills = getFills(resolvedAccountId);
        return Array.isArray(nextFills) ? nextFills : [];
    }, [resolvedAccountId, fillsFromProps]);

    const accountBalanceHistory = useMemo(() => {
        if (!resolvedAccountId) {
            return [];
        }

        const nextHistory = getAccountBalanceHistory(resolvedAccountId);
        return Array.isArray(nextHistory) ? nextHistory : [];
    }, [resolvedAccountId]);

    const safeOrders = useMemo(() => {
        return Array.isArray(orders) ? orders : [];
    }, [orders]);

    const safeSimulationTrades = useMemo(() => {
        return Array.isArray(simulationTrades) ? simulationTrades : [];
    }, [simulationTrades]);

    const panelProps = useMemo(() => {
        return {
            accountId: resolvedAccountId,
            resolvedAccountId,
            selectedAccountId: resolvedAccountId,
            activeAccountId: resolvedAccountId,
            account: resolvedAccount,
            selectedAccount: resolvedAccount,
            activeAccount: resolvedAccount,
            accounts,
            accountGroups,
            activeGroup,
            fills,
            accountBalanceHistory,
            orders: safeOrders,
            simulationTrades: safeSimulationTrades,
        };
    }, [
        resolvedAccountId,
        resolvedAccount,
        accounts,
        accountGroups,
        activeGroup,
        fills,
        accountBalanceHistory,
        safeOrders,
        safeSimulationTrades,
    ]);

    if (!resolvedAccount) {
        return (
            <div
                style={{
                    minHeight: "100%",
                    background: COLORS.bg,
                    color: COLORS.text,
                    padding: 16,
                }}
            >
                <div
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 24,
                        padding: 24,
                        boxShadow: COLORS.shadow,
                    }}
                >
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 22,
                            fontWeight: 800,
                            marginBottom: 8,
                        }}
                    >
                        Dashboard
                    </div>
                    <div
                        style={{
                            color: COLORS.textSoft,
                            fontSize: 14,
                        }}
                    >
                        Kein aktiver Account gewählt
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: "100%",
                background: COLORS.bg,
                color: COLORS.text,
                padding: 16,
            }}
        >
            <div
                style={{
                    display: "grid",
                    gap: 16,
                }}
            >
                <div
                    style={{
                        background: COLORS.panelBg,
                        border: `1px solid ${COLORS.borderStrong}`,
                        borderRadius: 24,
                        padding: 20,
                        boxShadow: COLORS.shadow,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                            marginBottom: 16,
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    color: COLORS.title,
                                    fontSize: 24,
                                    fontWeight: 900,
                                }}
                            >
                                {resolvedAccount.displayName || resolvedAccount.id}
                            </div>
                            <div
                                style={{
                                    color: COLORS.textSoft,
                                    fontSize: 13,
                                    marginTop: 4,
                                    wordBreak: "break-word",
                                }}
                            >
                                Aktive Gruppe und Lifecycle
                            </div>
                        </div>

                        <div
                            style={{
                                border: `1px solid ${groupStatusMeta.color}`,
                                borderRadius: 999,
                                padding: "8px 14px",
                                color: groupStatusMeta.color,
                                fontSize: 12,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {groupStatusMeta.label}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                            marginBottom: 12,
                        }}
                    >
                        <InfoCard
                            label="Aktiver Account"
                            value={resolvedAccount.displayName || resolvedAccount.id}
                            color={COLORS.cyan}
                        />
                        <InfoCard
                            label="Phase"
                            value={getPhaseLabel(resolvedAccount.accountPhase)}
                            color={COLORS.purple}
                        />
                        <InfoCard
                            label="Status"
                            value={getStatusLabel(resolvedAccount.accountStatus)}
                            color={getStatusColor(resolvedAccount.accountStatus)}
                        />
                        <InfoCard
                            label="Produkt"
                            value={getProductTypeLabel(resolvedAccount.productType)}
                            color={COLORS.yellow}
                        />
                        <InfoCard
                            label="Linked Accounts"
                            value={linkedAccountsText}
                            color={COLORS.orange}
                        />
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                            gap: 10,
                        }}
                    >
                        {lifecycleItems.map((item) => (
                            <InfoCard
                                key={item.label}
                                label={item.label}
                                value={item.value}
                            />
                        ))}
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                        gap: 16,
                    }}
                >
                    <GridCell colSpan={12}>
                        <LiveCard {...panelProps} />
                    </GridCell>

                    <GridCell colSpan={12}>
                        <RiskPanel key={`risk-${resolvedAccountId}`} {...panelProps} />
                    </GridCell>

                    <GridCell colSpan={12}>
                        <RulesPanel {...panelProps} />
                    </GridCell>

                    <GridCell colSpan={6}>
                        <OrdersPanel
                            key={`orders-${resolvedAccountId}-${safeOrders.length}-${safeSimulationTrades.length}`}
                            {...panelProps}
                        />
                    </GridCell>

                    <GridCell colSpan={6}>
                        <PositionsPanel {...panelProps} />
                    </GridCell>

                    <GridCell colSpan={12}>
                        <JournalPanel {...panelProps} />
                    </GridCell>

                    <GridCell colSpan={12}>
                        <SessionRadar {...panelProps} />
                    </GridCell>

                    <GridCell colSpan={12}>
                        <ImportCenterPanel accountId={resolvedAccountId} />
                    </GridCell>
                </div>
            </div>
        </div>
    );
}