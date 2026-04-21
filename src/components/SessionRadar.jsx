import { useEffect, useMemo, useState } from "react";

const TRADING_TIMEZONE = "America/New_York";

const COLORS = {
    panelBg: "rgba(8, 15, 37, 0.92)",
    panelBgStrong: "rgba(20, 30, 55, 0.96)",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    title: "#e0f2fe",
    text: "#e2e8f0",
    muted: "#94a3b8",
    cyan: "#22d3ee",
    yellow: "#facc15",
    purple: "#a78bfa",
    shadow: "0 0 30px rgba(0, 0, 0, 0.25)",
};

function cleanString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function getDisplayAccountName(account) {
    return (
        cleanString(account?.tradingAccountName) ||
        cleanString(account?.displayName) ||
        cleanString(account?.tradingAccountId) ||
        cleanString(account?.accountName) ||
        cleanString(account?.name) ||
        "Kein aktiver Account"
    );
}

function formatDateInTimezone(date, timeZone) {
    return new Intl.DateTimeFormat("de-CH", {
        timeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

function formatTimeInTimezone(date, timeZone) {
    return new Intl.DateTimeFormat("de-CH", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(date);
}

function formatWeekdayInTimezone(date, timeZone) {
    return new Intl.DateTimeFormat("de-CH", {
        timeZone,
        weekday: "long",
    }).format(date);
}

function getTimeZoneLabel(timeZone) {
    return cleanString(timeZone) || "Europe/Zurich";
}

function getNyParts(date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: TRADING_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const result = {};

    parts.forEach((part) => {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
    });

    return {
        year: Number(result.year),
        month: Number(result.month),
        day: Number(result.day),
        hour: Number(result.hour),
        minute: Number(result.minute),
        second: Number(result.second),
    };
}

function addUtcDays(year, month, day, days) {
    const next = new Date(Date.UTC(year, month - 1, day + days));

    return {
        year: next.getUTCFullYear(),
        month: next.getUTCMonth() + 1,
        day: next.getUTCDate(),
    };
}

function getTradingDayLabel(date) {
    const ny = getNyParts(date);

    const tradingDay =
        ny.hour >= 18
            ? addUtcDays(ny.year, ny.month, ny.day, 1)
            : { year: ny.year, month: ny.month, day: ny.day };

    const local = new Date(
        tradingDay.year,
        tradingDay.month - 1,
        tradingDay.day
    );

    return new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(local);
}

function getSessionCardStyle(label) {
    const key = String(label || "").toLowerCase();

    if (key.includes("timezone")) {
        return {
            border: "rgba(34, 211, 238, 0.28)",
            background:
                "linear-gradient(180deg, rgba(8, 47, 73, 0.52) 0%, rgba(15, 23, 42, 0.88) 100%)",
            valueColor: "#e0f2fe",
        };
    }

    if (key.includes("trading day")) {
        return {
            border: "rgba(250, 204, 21, 0.30)",
            background:
                "linear-gradient(180deg, rgba(71, 57, 11, 0.42) 0%, rgba(15, 23, 42, 0.88) 100%)",
            valueColor: "#fef08a",
        };
    }

    if (key.includes("current time")) {
        return {
            border: "rgba(59, 130, 246, 0.28)",
            background:
                "linear-gradient(180deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.88) 100%)",
            valueColor: "#dbeafe",
        };
    }

    if (key.includes("weekday")) {
        return {
            border: "rgba(167, 139, 250, 0.28)",
            background:
                "linear-gradient(180deg, rgba(46, 16, 101, 0.34) 0%, rgba(15, 23, 42, 0.88) 100%)",
            valueColor: "#ede9fe",
        };
    }

    return {
        border: "rgba(125, 211, 252, 0.24)",
        background:
            "linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(18, 34, 64, 0.82) 100%)",
        valueColor: "#f8fafc",
    };
}

export default function SessionRadar(props) {
    const resolvedAccount =
        props?.account || props?.activeAccount || props?.selectedAccount || null;

    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setNow(new Date());
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    const userTimeZone = useMemo(() => {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich";
    }, []);

    const items = useMemo(() => {
        return [
            {
                label: "Timezone",
                value: getTimeZoneLabel(userTimeZone),
            },
            {
                label: "Trading Day",
                value: getTradingDayLabel(now),
            },
            {
                label: "Current Time",
                value: formatTimeInTimezone(now, userTimeZone),
            },
            {
                label: "Weekday",
                value: formatWeekdayInTimezone(now, userTimeZone),
            },
        ];
    }, [now, userTimeZone]);

    return (
        <div
            style={{
                borderRadius: 22,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelBgStrong,
                boxShadow: COLORS.shadow,
                padding: 16,
                display: "grid",
                gap: 12,
                minWidth: 0,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            color: COLORS.title,
                            fontSize: 18,
                            fontWeight: 800,
                            lineHeight: 1.2,
                        }}
                    >
                        Session Radar
                    </div>

                    <div
                        style={{
                            marginTop: 4,
                            color: COLORS.muted,
                            fontSize: 12,
                            lineHeight: 1.35,
                            wordBreak: "break-word",
                        }}
                    >
                        Account: {getDisplayAccountName(resolvedAccount)}
                    </div>
                </div>

                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: `1px solid ${COLORS.borderStrong}`,
                        background: "rgba(255,255,255,0.04)",
                        color: COLORS.cyan,
                        fontSize: 11,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                    }}
                >
                    {formatDateInTimezone(now, userTimeZone)}
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 10,
                    width: "100%",
                    alignItems: "stretch",
                }}
            >
                {items.map((item) => {
                    const ui = getSessionCardStyle(item.label);

                    return (
                        <div
                            key={item.label}
                            style={{
                                minHeight: 62,
                                borderRadius: 12,
                                border: `1px solid ${ui.border}`,
                                background: ui.background,
                                padding: "8px 10px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                gap: 3,
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                            }}
                        >
                            <div
                                style={{
                                    color: "rgba(148, 163, 184, 0.95)",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    lineHeight: 1.1,
                                }}
                            >
                                {item.label}
                            </div>

                            <div
                                style={{
                                    color: ui.valueColor,
                                    fontSize: 13,
                                    fontWeight: 800,
                                    lineHeight: 1.15,
                                    letterSpacing: "0.01em",
                                }}
                            >
                                {item.value}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}