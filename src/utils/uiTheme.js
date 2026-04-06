// src/theme/uiTheme.js

export const colors = {
    bg: "#0F1115",
    panel: "#161A22",
    panelAlt: "#1B2130",
    border: "#2A3242",
    text: "#FFFFFF",
    textSoft: "#A9B4C7",
    label: "#7F8AA3",
    positive: "#3B82F6",
    negative: "#F59E0B",
    neutral: "#FFFFFF",
    danger: "#EF4444",
    warning: "#F59E0B",
};

export const cardStyle = {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 16,
};

export const sectionTitleStyle = {
    color: colors.text,
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
};

export const labelStyle = {
    color: colors.label,
    fontSize: 12,
    fontWeight: 500,
};

export const valueStyle = {
    color: colors.text,
    fontSize: 14,
    fontWeight: 600,
};

export const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
};

export const badgeStyle = {
    base: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 32,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${colors.border}`,
    },
    positive: {
        color: colors.positive,
        background: "rgba(59,130,246,0.12)",
    },
    negative: {
        color: colors.negative,
        background: "rgba(245,158,11,0.12)",
    },
    neutral: {
        color: colors.neutral,
        background: "rgba(255,255,255,0.06)",
    },
    danger: {
        color: colors.danger,
        background: "rgba(239,68,68,0.12)",
    },
};

export const getPnLColor = (value) => {
    if (value > 0) return colors.positive;
    if (value < 0) return colors.negative;
    return colors.neutral;
};

export const getBadgeStyle = (value) => {
    if (value > 0) {
        return { ...badgeStyle.base, ...badgeStyle.positive };
    }

    if (value < 0) {
        return { ...badgeStyle.base, ...badgeStyle.negative };
    }

    return { ...badgeStyle.base, ...badgeStyle.neutral };
};

export const buttonStyle = {
    primary: {
        background: colors.positive,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 10,
        padding: "10px 14px",
        fontWeight: 600,
        cursor: "pointer",
    },
    secondary: {
        background: colors.panelAlt,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontWeight: 600,
        cursor: "pointer",
    },
};