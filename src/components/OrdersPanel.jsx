import { useMemo } from "react";

const COLORS = {
    panelBg: "#050816",
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    text: "#dbeafe",
    muted: "#94a3b8",
    cyan: "#22d3ee",
    green: "#34d399",
    orange: "#fb923c",
};

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function formatDateTime(value) {
    if (!value) {
        return "–";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatNumber(value, digits = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "–";
    }

    return number.toLocaleString("de-CH", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function getOrderId(order, index) {
    return (
        order?.orderId ||
        order?.id ||
        order?.order_id ||
        order?.orderNumber ||
        `order-${index}`
    );
}

function getOrderSide(order) {
    return (
        order?.side ||
        order?.action ||
        order?.buySell ||
        order?.direction ||
        "–"
    );
}

function getOrderInstrument(order) {
    return (
        order?.instrument ||
        order?.symbol ||
        order?.contract ||
        order?.market ||
        "–"
    );
}

function getOrderQty(order) {
    return (
        order?.quantity ||
        order?.qty ||
        order?.filledQty ||
        order?.size ||
        0
    );
}

function getOrderStatus(order) {
    return order?.status || order?.orderStatus || "–";
}

function getOrderTime(order) {
    return (
        order?.timestamp ||
        order?.createdAt ||
        order?.submittedAt ||
        order?.time ||
        order?.date ||
        ""
    );
}

export default function OrdersPanel({
    orders = [],
    simulationTrades = [],
    selectedAccount = null,
}) {
    const safeOrders = useMemo(() => toArray(orders), [orders]);
    const safeSimulationTrades = useMemo(
        () => toArray(simulationTrades),
        [simulationTrades]
    );

    const orderRows = useMemo(() => {
        if (safeOrders.length > 0) {
            return safeOrders.map((order, index) => ({
                id: getOrderId(order, index),
                source: "CSV",
                instrument: getOrderInstrument(order),
                side: getOrderSide(order),
                qty: getOrderQty(order),
                status: getOrderStatus(order),
                time: getOrderTime(order),
                raw: order,
            }));
        }

        return safeSimulationTrades.map((trade, index) => ({
            id:
                trade?.id ||
                trade?.tradeId ||
                trade?.orderId ||
                `sim-${index}`,
            source: "SIM",
            instrument:
                trade?.instrument ||
                trade?.symbol ||
                trade?.contract ||
                "–",
            side:
                trade?.side ||
                trade?.direction ||
                trade?.action ||
                "–",
            qty:
                trade?.quantity ||
                trade?.qty ||
                trade?.contracts ||
                0,
            status: trade?.status || "Simuliert",
            time:
                trade?.timestamp ||
                trade?.createdAt ||
                trade?.time ||
                trade?.date ||
                "",
            raw: trade,
        }));
    }, [safeOrders, safeSimulationTrades]);

    const stats = useMemo(() => {
        const total = orderRows.length;

        const buyCount = orderRows.filter((row) =>
            String(row.side).toLowerCase().includes("buy")
        ).length;

        const sellCount = orderRows.filter((row) =>
            String(row.side).toLowerCase().includes("sell")
        ).length;

        const totalQty = orderRows.reduce((sum, row) => {
            const qty = Number(row.qty);
            return sum + (Number.isFinite(qty) ? qty : 0);
        }, 0);

        return {
            total,
            buyCount,
            sellCount,
            totalQty,
        };
    }, [orderRows]);

    const accountLabel =
        selectedAccount?.name ||
        selectedAccount?.accountId ||
        selectedAccount?.id ||
        "Kein Account gewählt";

    return (
        <section
            style={{
                background: COLORS.panelBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 0 24px rgba(0, 0, 0, 0.22)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                    flexWrap: "wrap",
                }}
            >
                <div>
                    <div
                        style={{
                            color: COLORS.text,
                            fontSize: 18,
                            fontWeight: 700,
                            marginBottom: 4,
                        }}
                    >
                        Orders
                    </div>
                    <div
                        style={{
                            color: COLORS.muted,
                            fontSize: 13,
                        }}
                    >
                        Account: {accountLabel}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                    }}
                >
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.borderStrong}`,
                            color: COLORS.text,
                            fontSize: 13,
                        }}
                    >
                        Orders: {stats.total}
                    </div>
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.borderStrong}`,
                            color: COLORS.green,
                            fontSize: 13,
                        }}
                    >
                        Buy: {stats.buyCount}
                    </div>
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.borderStrong}`,
                            color: COLORS.orange,
                            fontSize: 13,
                        }}
                    >
                        Sell: {stats.sellCount}
                    </div>
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: `1px solid ${COLORS.borderStrong}`,
                            color: COLORS.cyan,
                            fontSize: 13,
                        }}
                    >
                        Qty: {formatNumber(stats.totalQty, 0)}
                    </div>
                </div>
            </div>

            {orderRows.length === 0 ? (
                <div
                    style={{
                        padding: 18,
                        borderRadius: 14,
                        border: `1px dashed ${COLORS.borderStrong}`,
                        color: COLORS.muted,
                        fontSize: 14,
                    }}
                >
                    Keine Orders geladen.
                </div>
            ) : (
                <div
                    style={{
                        overflowX: "auto",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 14,
                    }}
                >
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: 760,
                        }}
                    >
                        <thead>
                            <tr
                                style={{
                                    background: "rgba(255,255,255,0.03)",
                                }}
                            >
                                <th style={thStyle}>Zeit</th>
                                <th style={thStyle}>Quelle</th>
                                <th style={thStyle}>Instrument</th>
                                <th style={thStyle}>Side</th>
                                <th style={thStyle}>Qty</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Order ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderRows.map((row) => (
                                <tr key={row.id}>
                                    <td style={tdStyle}>{formatDateTime(row.time)}</td>
                                    <td style={tdStyle}>{row.source}</td>
                                    <td style={tdStyle}>{row.instrument}</td>
                                    <td style={tdStyle}>{row.side}</td>
                                    <td style={tdStyle}>{formatNumber(row.qty, 0)}</td>
                                    <td style={tdStyle}>{row.status}</td>
                                    <td style={tdStyle}>{row.id}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

const thStyle = {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 12,
    color: "#94a3b8",
    borderBottom: "1px solid rgba(125, 211, 252, 0.18)",
    whiteSpace: "nowrap",
};

const tdStyle = {
    padding: "12px 14px",
    fontSize: 13,
    color: "#dbeafe",
    borderBottom: "1px solid rgba(125, 211, 252, 0.10)",
    whiteSpace: "nowrap",
};