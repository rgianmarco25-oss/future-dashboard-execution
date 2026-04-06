import LiveCard from "../components/LiveCard";
import RiskPanel from "../components/RiskPanel";
import RulesPanel from "../components/RulesPanel";
import OrdersPanel from "../components/OrdersPanel";
import PositionsPanel from "../components/PositionsPanel";
import JournalPanel from "../components/JournalPanel";
import SessionRadar from "../components/SessionRadar";
import CsvImportPanel from "../components/CsvImportPanel";
import TradeChecklistPanel from "../components/TradeChecklistPanel";

const COLORS = {
    pageBg: "#050816",
    panelBg: "rgba(255, 255, 255, 0.03)",
    border: "rgba(125, 211, 252, 0.18)",
    title: "#7dd3fc",
    text: "#dbeafe",
    muted: "#94a3b8",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
};

const pageStyle = {
    minHeight: "100%",
    background: COLORS.pageBg,
    color: COLORS.text,
    padding: "16px",
};

const contentStyle = {
    maxWidth: "1600px",
    margin: "0 auto",
};

const dashboardGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gap: "16px",
    alignItems: "stretch",
};

const col12 = {
    gridColumn: "span 12",
    minWidth: 0,
};

const col4 = {
    gridColumn: "span 4",
    minWidth: 0,
};

const panelCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "24px",
    background: COLORS.panelBg,
    boxShadow: COLORS.shadow,
    padding: "18px",
    minWidth: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
};

const panelHeaderStyle = {
    color: COLORS.title,
    fontSize: "14px",
    fontWeight: "800",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: "14px",
    lineHeight: 1.2,
};

const panelBodyStyle = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
};

const checklistWrapStyle = {
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
};

const emptyPanelStyle = {
    width: "100%",
    minHeight: "120px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "20px",
    background: "rgba(255, 255, 255, 0.02)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: COLORS.muted,
    padding: "20px",
    boxSizing: "border-box",
};

function SectionCard({ title, style, children, bodyStyle }) {
    return (
        <section style={{ ...panelCardStyle, ...style }}>
            <div style={panelHeaderStyle}>{title}</div>
            <div style={{ ...panelBodyStyle, ...bodyStyle }}>{children}</div>
        </section>
    );
}

function EmptyPanel({ text }) {
    return <div style={emptyPanelStyle}>{text}</div>;
}

export default function Dashboard({
    accountId,
    activeAccountId,
    account,
    activeAccount,
    onAccountUpdated,
}) {
    const resolvedAccountId =
        activeAccountId ||
        accountId ||
        activeAccount?.id ||
        account?.id ||
        "";

    const resolvedAccount =
        resolvedAccountId
            ? activeAccount ||
            account ||
            { id: resolvedAccountId }
            : null;

    const hasActiveAccount = Boolean(resolvedAccountId && resolvedAccount);

    return (
        <div style={pageStyle}>
            <div style={contentStyle}>
                <div style={dashboardGridStyle}>
                    <SectionCard title="Live" style={col12}>
                        {hasActiveAccount ? (
                            <LiveCard
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                                onAccountUpdated={onAccountUpdated}
                            />
                        ) : (
                            <EmptyPanel text="Kein aktiver Account ausgewählt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Session Radar" style={col12}>
                        <SessionRadar
                            accountId={resolvedAccountId}
                            account={resolvedAccount}
                            onAccountUpdated={onAccountUpdated}
                        />
                    </SectionCard>

                    <SectionCard title="Risk" style={col12}>
                        {hasActiveAccount ? (
                            <RiskPanel
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                                onAccountUpdated={onAccountUpdated}
                            />
                        ) : (
                            <EmptyPanel text="Risk wird nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Rules" style={col12}>
                        {hasActiveAccount ? (
                            <RulesPanel
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                                onAccountUpdated={onAccountUpdated}
                            />
                        ) : (
                            <EmptyPanel text="Rules werden nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Trade Checkliste" style={col4}>
                        {hasActiveAccount ? (
                            <div style={checklistWrapStyle}>
                                <TradeChecklistPanel accountId={resolvedAccountId} />
                            </div>
                        ) : (
                            <EmptyPanel text="Checkliste wird nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Orders" style={col4}>
                        {hasActiveAccount ? (
                            <OrdersPanel
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                                onAccountUpdated={onAccountUpdated}
                            />
                        ) : (
                            <EmptyPanel text="Orders werden nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Positions" style={col4}>
                        {hasActiveAccount ? (
                            <PositionsPanel
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                                onAccountUpdated={onAccountUpdated}
                            />
                        ) : (
                            <EmptyPanel text="Positions werden nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Journal" style={col12}>
                        {hasActiveAccount ? (
                            <JournalPanel
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                            />
                        ) : (
                            <EmptyPanel text="Journal wird nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>

                    <SectionCard title="Import Center" style={col12}>
                        {hasActiveAccount ? (
                            <CsvImportPanel
                                accountId={resolvedAccountId}
                                account={resolvedAccount}
                                onAccountUpdated={onAccountUpdated}
                            />
                        ) : (
                            <EmptyPanel text="Import Center wird nach Auswahl eines Accounts angezeigt." />
                        )}
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}