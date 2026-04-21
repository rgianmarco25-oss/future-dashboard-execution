import { useEffect, useState } from "react";
import { RISK_ALERT_EVENT_NAME } from "../utils/riskAlertEvents";

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    text: "#dbeafe",
    textSoft: "#94a3b8",
    green: "#4ade80",
    orange: "#fb923c",
    red: "#f87171",
};

function getStatusUi(status) {
    if (status === "red") {
        return {
            border: COLORS.red,
            background: "rgba(248, 113, 113, 0.10)",
            text: COLORS.red,
            dot: COLORS.red,
            label: "Rot",
        };
    }

    if (status === "yellow") {
        return {
            border: COLORS.orange,
            background: "rgba(251, 146, 60, 0.10)",
            text: COLORS.orange,
            dot: COLORS.orange,
            label: "Gelb",
        };
    }

    return {
        border: COLORS.green,
        background: "rgba(74, 222, 128, 0.10)",
        text: COLORS.green,
        dot: COLORS.green,
        label: "Grün",
    };
}

function isValidDetail(detail) {
    return Boolean(
        detail &&
        typeof detail === "object" &&
        detail.alert &&
        typeof detail.alert === "object"
    );
}

export default function AccountSwitcherRiskStatus() {
    const [payload, setPayload] = useState(null);

    useEffect(() => {
        function handleRiskAlert(event) {
            const detail = event?.detail;

            if (!isValidDetail(detail)) {
                return;
            }

            setPayload(detail);
        }

        window.addEventListener(RISK_ALERT_EVENT_NAME, handleRiskAlert);

        return () => {
            window.removeEventListener(RISK_ALERT_EVENT_NAME, handleRiskAlert);
        };
    }, []);

    if (!payload?.alert) {
        return (
            <div
                style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16,
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.03)",
                    display: "grid",
                    gap: 4,
                }}
            >
                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 11,
                        fontWeight: 700,
                    }}
                >
                    Regelstatus
                </div>

                <div
                    style={{
                        color: COLORS.text,
                        fontSize: 13,
                        fontWeight: 800,
                    }}
                >
                    Status lädt
                </div>
            </div>
        );
    }

    const ui = getStatusUi(payload.alert.status);

    return (
        <div
            style={{
                border: `1px solid ${ui.border}`,
                borderRadius: 16,
                padding: "12px 14px",
                background: ui.background,
                display: "grid",
                gap: 6,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                }}
            >
                <div
                    style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: ui.dot,
                        flex: "0 0 auto",
                    }}
                />

                <div
                    style={{
                        color: COLORS.textSoft,
                        fontSize: 11,
                        fontWeight: 700,
                    }}
                >
                    Regelstatus
                </div>

                <div
                    style={{
                        color: ui.text,
                        fontSize: 11,
                        fontWeight: 900,
                    }}
                >
                    {ui.label}
                </div>
            </div>

            <div
                style={{
                    color: ui.text,
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1.4,
                }}
            >
                {payload.alert.message}
            </div>

            <div
                style={{
                    color: COLORS.textSoft,
                    fontSize: 11,
                    lineHeight: 1.4,
                }}
            >
                {payload.alert.detail}
            </div>
        </div>
    );
}