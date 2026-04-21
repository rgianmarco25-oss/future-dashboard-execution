import { formatDateTime } from "../utils/dateFormat";
import { getRiskBadgeTone } from "../utils/accountRiskStatus";

const PALETTES = {
    green: {
        bg: "rgba(34, 197, 94, 0.14)",
        border: "rgba(34, 197, 94, 0.36)",
        dot: "#22c55e",
        text: "#dcfce7",
    },
    yellow: {
        bg: "rgba(245, 158, 11, 0.14)",
        border: "rgba(245, 158, 11, 0.36)",
        dot: "#f59e0b",
        text: "#fef3c7",
    },
    red: {
        bg: "rgba(239, 68, 68, 0.14)",
        border: "rgba(239, 68, 68, 0.36)",
        dot: "#ef4444",
        text: "#fee2e2",
    },
    neutral: {
        bg: "rgba(148, 163, 184, 0.14)",
        border: "rgba(148, 163, 184, 0.3)",
        dot: "#94a3b8",
        text: "#e2e8f0",
    },
};

function getLabel(status, tone) {
    if (status?.label) {
        return status.label;
    }

    if (tone === "green") {
        return "Alles sauber";
    }

    if (tone === "yellow") {
        return "Kritisch";
    }

    if (tone === "red") {
        return "Regel verletzt";
    }

    return "Keine Basis";
}

export default function AccountRiskBadge({ status, compact = false }) {
    const tone = getRiskBadgeTone(status?.level);
    const palette = PALETTES[tone] || PALETTES.neutral;
    const label = getLabel(status, tone);
    const updatedText = status?.updatedAt ? formatDateTime(status.updatedAt) : "";

    return (
        <div
            title={updatedText ? `${label} · ${updatedText}` : label}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: compact ? "6px 10px" : "7px 12px",
                borderRadius: 999,
                border: `1px solid ${palette.border}`,
                background: palette.bg,
                minHeight: 32,
                whiteSpace: "nowrap",
            }}
        >
            <span
                style={{
                    width: 10,
                    height: 10,
                    minWidth: 10,
                    borderRadius: "50%",
                    background: palette.dot,
                    boxShadow: `0 0 12px ${palette.dot}`,
                }}
            />
            <span
                style={{
                    color: palette.text,
                    fontSize: compact ? 11 : 12,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                }}
            >
                {label}
            </span>
        </div>
    );
}