import { formatDate } from "../utils/dateFormat";
import { getAccountById } from "../utils/storage";
import { getActiveRuleMode, getSessionContext } from "../utils/sessionUtils";

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    title: "#7dd3fc",
    label: "#94a3b8",
    neutral: "#dbeafe",
    activeBg: "rgba(34, 211, 238, 0.10)",
    activeBorder: "rgba(34, 211, 238, 0.35)",
    activeText: "#67e8f9",
    inactiveBg: "rgba(255, 255, 255, 0.03)",
    inactiveBorder: "rgba(125, 211, 252, 0.18)",
    intradayBg: "rgba(34, 211, 238, 0.12)",
    intradayBorder: "rgba(34, 211, 238, 0.35)",
    intradayText: "#67e8f9",
    eodBg: "rgba(251, 146, 60, 0.12)",
    eodBorder: "rgba(251, 146, 60, 0.35)",
    eodText: "#fdba74",
    cardBg: "rgba(255, 255, 255, 0.03)",
};

const wrapperStyle = {
    width: "100%",
};

const infoCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "18px",
    padding: "16px",
    background: COLORS.cardBg,
    color: COLORS.neutral,
    marginBottom: "16px",
};

const infoGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
};

const infoItemStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "12px",
    background: "rgba(255, 255, 255, 0.02)",
    textAlign: "center",
};

const infoLabelStyle = {
    fontSize: "13px",
    color: COLORS.label,
    marginBottom: "6px",
    lineHeight: 1.35,
};

const infoValueStyle = {
    fontSize: "15px",
    fontWeight: "700",
    color: COLORS.neutral,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
};

const sessionGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
};

const sessionCardBaseStyle = {
    borderRadius: "18px",
    padding: "16px",
    display: "grid",
    gap: "8px",
    textAlign: "center",
    minHeight: "120px",
    alignContent: "center",
};

const statusBadgeBaseStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    margin: "0 auto",
    lineHeight: 1.3,
};

const sessionLabelStyle = {
    fontSize: "18px",
    fontWeight: "700",
    color: COLORS.neutral,
    lineHeight: 1.35,
};

const timeStyle = {
    fontSize: "14px",
    color: COLORS.label,
    lineHeight: 1.35,
};

function getSessionCardStyle(isActive) {
    return {
        ...sessionCardBaseStyle,
        border: isActive
            ? `1px solid ${COLORS.activeBorder}`
            : `1px solid ${COLORS.inactiveBorder}`,
        background: isActive ? COLORS.activeBg : COLORS.inactiveBg,
        color: COLORS.neutral,
        boxShadow: isActive ? "0 0 18px rgba(34, 211, 238, 0.14)" : "none",
    };
}

function getStatusBadgeStyle(isActive) {
    if (isActive) {
        return {
            ...statusBadgeBaseStyle,
            border: `1px solid ${COLORS.activeBorder}`,
            background: COLORS.activeBg,
            color: COLORS.activeText,
        };
    }

    return {
        ...statusBadgeBaseStyle,
        border: `1px solid ${COLORS.inactiveBorder}`,
        background: COLORS.inactiveBg,
        color: COLORS.neutral,
    };
}

function getModeBadgeStyle(mode) {
    if (mode === "intraday") {
        return {
            ...statusBadgeBaseStyle,
            border: `1px solid ${COLORS.intradayBorder}`,
            background: COLORS.intradayBg,
            color: COLORS.intradayText,
        };
    }

    return {
        ...statusBadgeBaseStyle,
        border: `1px solid ${COLORS.eodBorder}`,
        background: COLORS.eodBg,
        color: COLORS.eodText,
    };
}

function buildSessionCards(context) {
    return [
        {
            key: "intraday",
            label: "Intraday Phase",
            start: context.sessionWindow.openLabel,
            end: context.sessionWindow.closeLabel,
            isActive: context.isIntradayPhase,
        },
        {
            key: "eod",
            label: "EOD Phase",
            start: "00:00",
            end: "23:59",
            isActive: context.isEodPhase,
        },
        {
            key: "market",
            label: "Session Window",
            start: context.sessionWindow.openLabel,
            end: context.sessionWindow.closeLabel,
            isActive: context.sessionOpen,
        },
    ];
}

export default function SessionRadar({ accountId, account: accountProp, timezone }) {
    const resolvedAccountId = accountId || accountProp?.id || "";
    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null;

    const account = {
        ...(storedAccount || {}),
        ...(accountProp || {}),
        id: resolvedAccountId || accountProp?.id || storedAccount?.id || "",
        timezone:
            accountProp?.timezone ||
            storedAccount?.timezone ||
            timezone ||
            "Europe/Zurich",
    };

    const context = getSessionContext(account);
    const activeRuleMode = getActiveRuleMode(account);
    const sessionCards = buildSessionCards(context);
    const displayedTradingDate = formatDate(context.tradingDate);

    return (
        <div style={wrapperStyle}>
            <div style={infoCardStyle}>
                <div style={infoGridStyle}>
                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Timezone</div>
                        <div style={infoValueStyle}>{context.timeZone}</div>
                    </div>

                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Trading Date</div>
                        <div style={infoValueStyle}>{displayedTradingDate}</div>
                    </div>

                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Current Time</div>
                        <div style={infoValueStyle}>{context.localTime}</div>
                    </div>

                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Weekday</div>
                        <div style={infoValueStyle}>{context.weekday}</div>
                    </div>

                    <div style={infoItemStyle}>
                        <div style={infoLabelStyle}>Active Rule Mode</div>
                        <div style={getModeBadgeStyle(activeRuleMode)}>
                            {String(activeRuleMode || "eod").toUpperCase()}
                        </div>
                    </div>
                </div>
            </div>

            <div style={sessionGridStyle}>
                {sessionCards.map((session) => (
                    <div key={session.key} style={getSessionCardStyle(session.isActive)}>
                        <div style={sessionLabelStyle}>{session.label}</div>
                        <div style={timeStyle}>
                            {session.start} - {session.end}
                        </div>
                        <div style={getStatusBadgeStyle(session.isActive)}>
                            {session.isActive ? "ACTIVE" : "INACTIVE"}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}