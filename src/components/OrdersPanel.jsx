import { useEffect, useState } from "react"
import { getAccountById, getOrders, saveOrders } from "../utils/storage"
import { syncStoredAccountBalance } from "../utils/accountBalance"
import {
    validateOrdersAgainstAccount,
    validateSingleOrder,
} from "../utils/orderValidation"
import * as csvImportUtils from "../utils/csvImportUtils"
import { formatDateTime } from "../utils/dateFormat"

const COLORS = {
    border: "rgba(125, 211, 252, 0.18)",
    borderStrong: "rgba(125, 211, 252, 0.28)",
    label: "#94a3b8",
    neutral: "#dbeafe",
    cyan: "#22d3ee",
    orange: "#fb923c",
    inputBg: "#000",
    cardBg: "rgba(255, 255, 255, 0.03)",
    okBg: "rgba(34, 211, 238, 0.16)",
    okBorder: "rgba(34, 211, 238, 0.35)",
    okText: "#67e8f9",
    warningBg: "rgba(124, 45, 18, 0.22)",
    warningBorder: "rgba(251, 146, 60, 0.35)",
    warningText: "#fdba74",
    breachBg: "rgba(153, 27, 27, 0.22)",
    breachBorder: "rgba(248, 113, 113, 0.35)",
    breachText: "#fca5a5",
    buttonBg: "#7dd3fc",
    buttonText: "#04111d",
}

const BASE_INSTRUMENT_OPTIONS = ["MNQM26", "NQM26", "ES"]

const wrapperStyle = {
    width: "100%",
}

const summaryGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginBottom: "16px",
}

const summaryCardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "14px",
    background: COLORS.cardBg,
    textAlign: "center",
    minHeight: "88px",
}

const summaryLabelStyle = {
    color: COLORS.label,
    fontSize: "13px",
    marginBottom: "6px",
    lineHeight: 1.35,
}

const validationBoxBaseStyle = {
    borderRadius: "16px",
    padding: "14px 16px",
    marginBottom: "16px",
    lineHeight: 1.45,
}

const buttonRowStyle = {
    marginBottom: "16px",
}

const buttonStyle = {
    width: "100%",
    background: COLORS.buttonBg,
    color: COLORS.buttonText,
    border: "none",
    borderRadius: "14px",
    padding: "12px 16px",
    fontWeight: "700",
    cursor: "pointer",
}

const deleteButtonStyle = {
    ...buttonStyle,
    width: "auto",
    padding: "10px 16px",
}

const emptyStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "18px",
    textAlign: "center",
    color: COLORS.label,
    background: COLORS.cardBg,
}

const ordersListStyle = {
    display: "grid",
    gap: "12px",
}

const cardStyle = {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "18px",
    padding: "16px",
    background: COLORS.cardBg,
    display: "grid",
    gap: "12px",
}

const orderHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
}

const orderTitleStyle = {
    color: COLORS.neutral,
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: 1.35,
}

const orderStatusBadgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: 1.3,
}

const formRowLargeStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
}

const formRowMediumStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
}

const labelStyle = {
    display: "block",
    color: COLORS.label,
    fontSize: "14px",
    marginBottom: "8px",
    textAlign: "center",
}

const inputStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    outline: "none",
}

const orderNoticeBaseStyle = {
    borderRadius: "12px",
    padding: "10px 12px",
    fontSize: "13px",
    lineHeight: 1.45,
}

const messageListStyle = {
    display: "grid",
    gap: "6px",
}

const readonlyValueStyle = {
    width: "100%",
    background: COLORS.inputBg,
    color: COLORS.neutral,
    border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: "14px",
    padding: "12px 14px",
    boxSizing: "border-box",
    minHeight: "46px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    wordBreak: "break-word",
}

function createId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID()
    }

    return `order_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function hasValue(value) {
    if (value === null || value === undefined) {
        return false
    }

    if (typeof value === "string" && value.trim() === "") {
        return false
    }

    return true
}

function cleanString(value) {
    return String(value ?? "").trim()
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null
    }

    if (!hasValue(value)) {
        return null
    }

    let text = String(value)
        .trim()
        .replace(/\s/g, "")
        .replace(/[$€£]/g, "")
        .replace(/USD|EUR|CHF/gi, "")
        .replace(/'/g, "")

    const negativeByParens = text.startsWith("(") && text.endsWith(")")
    text = text.replace(/[()]/g, "")

    if (!text) {
        return null
    }

    const hasComma = text.includes(",")
    const hasDot = text.includes(".")

    if (hasComma && hasDot) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
            text = text.replace(/\./g, "").replace(/,/g, ".")
        } else {
            text = text.replace(/,/g, "")
        }
    } else if (hasComma && !hasDot) {
        const lastPart = text.split(",").pop() || ""

        if (lastPart.length === 1 || lastPart.length === 2) {
            text = text.replace(/,/g, ".")
        } else {
            text = text.replace(/,/g, "")
        }
    }

    const parsed = Number(text)

    if (!Number.isFinite(parsed)) {
        return null
    }

    return negativeByParens ? -Math.abs(parsed) : parsed
}

function toNumber(value, fallback = 0) {
    const parsed = parseFlexibleNumber(value)
    return parsed !== null ? parsed : fallback
}

function getInstrumentOptions(currentValue) {
    const safeValue = String(currentValue || "").trim()

    if (!safeValue) {
        return BASE_INSTRUMENT_OPTIONS
    }

    if (BASE_INSTRUMENT_OPTIONS.includes(safeValue)) {
        return BASE_INSTRUMENT_OPTIONS
    }

    return [safeValue, ...BASE_INSTRUMENT_OPTIONS]
}

function createEmptyOrder() {
    return {
        id: createId(),
        symbol: "MNQM26",
        side: "Buy",
        status: "Open",
        contracts: "1",
        entry: "",
        stopLoss: "",
        takeProfit: "",
        realizedPnl: "0",
    }
}

function isCancelled(order) {
    return String(order?.status || "").toLowerCase() === "cancelled"
}

function getTotalRealizedPnl(orders) {
    return orders.reduce((sum, order) => {
        if (isCancelled(order)) {
            return sum
        }

        return sum + toNumber(order.realizedPnl)
    }, 0)
}

function getTotalPlannedStop(orders) {
    return orders.reduce((sum, order) => {
        if (isCancelled(order)) {
            return sum
        }

        return sum + toNumber(order.stopLoss)
    }, 0)
}

function formatMoney(value) {
    const parsed = parseFlexibleNumber(value)

    if (parsed === null) {
        return "-"
    }

    return `${parsed.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} $`
}

function getValueColor(value) {
    const numericValue = toNumber(value)

    if (numericValue > 0) {
        return COLORS.cyan
    }

    if (numericValue < 0) {
        return COLORS.orange
    }

    return COLORS.neutral
}

function getSummaryValueStyle(value) {
    return {
        color: getValueColor(value),
        fontSize: "18px",
        fontWeight: "700",
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    }
}

function getValidationBoxStyle(status) {
    if (status === "breach") {
        return {
            border: `1px solid ${COLORS.breachBorder}`,
            background: COLORS.breachBg,
            color: COLORS.breachText,
        }
    }

    if (status === "warning") {
        return {
            border: `1px solid ${COLORS.warningBorder}`,
            background: COLORS.warningBg,
            color: COLORS.warningText,
        }
    }

    return {
        border: `1px solid ${COLORS.okBorder}`,
        background: COLORS.okBg,
        color: COLORS.okText,
    }
}

function getStatusLabel(status) {
    if (status === "breach") {
        return "Verletzt"
    }

    if (status === "warning") {
        return "Warnung"
    }

    return "OK"
}

function getInputHighlightStyle(orderValidation, field, order) {
    if (String(order?.status || "").toLowerCase() === "cancelled") {
        return {}
    }

    const messages = orderValidation?.messages || []

    const fieldMap = {
        contracts: "Contracts müssen größer als 0 sein.",
        entry: "Entry fehlt für eine offene Order.",
        stopLoss: "Stop Loss fehlt für eine offene Order.",
        takeProfit: "Take Profit ist nicht gesetzt.",
    }

    const targetMessage = fieldMap[field]

    if (!targetMessage) {
        return {}
    }

    const hasMessage = messages.includes(targetMessage)

    if (!hasMessage) {
        return {}
    }

    if (field === "takeProfit") {
        return {
            border: `1px solid ${COLORS.warningBorder}`,
            boxShadow: "0 0 0 1px rgba(251, 146, 60, 0.18)",
        }
    }

    return {
        border: `1px solid ${COLORS.breachBorder}`,
        boxShadow: "0 0 0 1px rgba(248, 113, 113, 0.18)",
    }
}

function normalizeCsvStatus(status) {
    const value = cleanString(status).toLowerCase()

    if (!value) {
        return "-"
    }

    if (value.includes("cancel")) {
        return "Cancelled"
    }

    if (value.includes("fill")) {
        return "Filled"
    }

    if (
        value.includes("open") ||
        value.includes("work") ||
        value.includes("pend") ||
        value.includes("submit")
    ) {
        return "Open"
    }

    if (value.includes("reject")) {
        return "Rejected"
    }

    return cleanString(status) || "-"
}

function normalizeCsvSide(side) {
    const value = cleanString(side).toLowerCase()

    if (value === "buy") {
        return "Buy"
    }

    if (value === "sell") {
        return "Sell"
    }

    return cleanString(side) || "-"
}

function getCsvStatusStyle(status) {
    const normalized = normalizeCsvStatus(status)

    if (normalized === "Cancelled" || normalized === "Rejected") {
        return {
            border: `1px solid ${COLORS.warningBorder}`,
            background: COLORS.warningBg,
            color: COLORS.warningText,
        }
    }

    if (normalized === "Filled") {
        return {
            border: `1px solid ${COLORS.okBorder}`,
            background: COLORS.okBg,
            color: COLORS.okText,
        }
    }

    return {
        border: `1px solid ${COLORS.borderStrong}`,
        background: "rgba(255, 255, 255, 0.06)",
        color: COLORS.neutral,
    }
}

function resolveOrderTimestamp(order) {
    return (
        order?.timestamp ||
        order?.dateTime ||
        order?.date ||
        order?.fillTime ||
        order?.orderTime ||
        order?.createdAt ||
        order?.submittedAt ||
        order?.transactTime ||
        ""
    )
}

function buildFillsByOrderId(fillRows = []) {
    return fillRows.reduce((acc, fill) => {
        const orderId = cleanString(fill?.orderId)

        if (!orderId) {
            return acc
        }

        if (!acc[orderId]) {
            acc[orderId] = []
        }

        acc[orderId].push(fill)
        return acc
    }, {})
}

function summarizeOrderFills(fills = []) {
    if (!Array.isArray(fills) || fills.length === 0) {
        return {
            fillCount: 0,
            filledContracts: 0,
            fillAveragePrice: null,
            fillLastTime: "",
            totalCommission: 0,
        }
    }

    let filledContracts = 0
    let weightedPriceTotal = 0
    let weightedPriceQty = 0
    let totalCommission = 0
    let fillLastTime = ""
    let lastTimestamp = 0

    fills.forEach((fill) => {
        const contracts = toNumber(fill?.contracts)
        const price = parseFlexibleNumber(fill?.price)
        const commission = toNumber(fill?.commission)

        filledContracts += contracts
        totalCommission += commission

        if (price !== null && contracts > 0) {
            weightedPriceTotal += price * contracts
            weightedPriceQty += contracts
        }

        const rawTime =
            fill?.timestamp ||
            fill?.date ||
            fill?.tradeDate ||
            fill?.raw?._timestamp ||
            fill?.raw?._tradeDate ||
            ""

        const parsedTime = rawTime ? new Date(rawTime) : null
        const timestamp =
            parsedTime && !Number.isNaN(parsedTime.getTime())
                ? parsedTime.getTime()
                : 0

        if (timestamp >= lastTimestamp) {
            lastTimestamp = timestamp
            fillLastTime = rawTime || fillLastTime
        }
    })

    return {
        fillCount: fills.length,
        filledContracts,
        fillAveragePrice:
            weightedPriceQty > 0 ? weightedPriceTotal / weightedPriceQty : null,
        fillLastTime,
        totalCommission,
    }
}

function mapCsvOrderToDisplay(order, fillsForOrder = []) {
    const fillSummary = summarizeOrderFills(fillsForOrder)

    const avgFillPrice = parseFlexibleNumber(order?.avgFillPrice)
    const limitPrice = parseFlexibleNumber(order?.limitPrice)
    const stopPrice = parseFlexibleNumber(order?.stopPrice)

    const displayPrice =
        avgFillPrice !== null && avgFillPrice !== 0
            ? avgFillPrice
            : fillSummary.fillAveragePrice !== null && fillSummary.fillAveragePrice !== 0
                ? fillSummary.fillAveragePrice
                : limitPrice !== null && limitPrice !== 0
                    ? limitPrice
                    : stopPrice !== null && stopPrice !== 0
                        ? stopPrice
                        : null

    return {
        id: order?.id,
        orderId: order?.orderId || order?.id || "",
        source: "csv",
        symbol: order?.instrument || order?.contract || order?.product || "-",
        side: normalizeCsvSide(order?.side),
        status: normalizeCsvStatus(order?.status),
        type: order?.type || "-",
        contracts: String(order?.contracts ?? 0),
        entry: displayPrice !== null ? String(displayPrice) : "",
        stopLoss: "",
        takeProfit: "",
        realizedPnl: "0",
        createdAt: resolveOrderTimestamp(order),
        filledContracts:
            fillSummary.filledContracts > 0
                ? fillSummary.filledContracts
                : toNumber(order?.filledQty),
        fillCount: fillSummary.fillCount,
        fillAveragePrice:
            fillSummary.fillAveragePrice !== null
                ? fillSummary.fillAveragePrice
                : avgFillPrice,
        fillLastTime: fillSummary.fillLastTime || order?.fillTime || "",
        totalCommission: fillSummary.totalCommission,
        hasFillDetails: fillSummary.fillCount > 0,
        rawValueForSort: order,
        raw: order?.raw || {},
    }
}

export default function OrdersPanel({ accountId, account: accountProp, onAccountUpdated }) {
    const resolvedAccountId = accountId || accountProp?.id || ""
    const [ordersByAccount, setOrdersByAccount] = useState({})
    const [, setCsvVersion] = useState(0)

    useEffect(() => {
        const handleCsvRefresh = () => {
            setCsvVersion((prev) => prev + 1)
        }

        window.addEventListener("tradovate-csv-imports-updated", handleCsvRefresh)
        window.addEventListener("storage", handleCsvRefresh)
        window.addEventListener("focus", handleCsvRefresh)

        return () => {
            window.removeEventListener("tradovate-csv-imports-updated", handleCsvRefresh)
            window.removeEventListener("storage", handleCsvRefresh)
            window.removeEventListener("focus", handleCsvRefresh)
        }
    }, [])

    const storedAccount = resolvedAccountId ? getAccountById(resolvedAccountId) : null
    const account = resolvedAccountId
        ? {
            ...(storedAccount || {}),
            ...(accountProp || {}),
            id: resolvedAccountId,
        }
        : null

    const localOrders = resolvedAccountId
        ? ordersByAccount[resolvedAccountId] || getOrders(resolvedAccountId)
        : []

    const importData =
        typeof csvImportUtils.getAllParsedImports === "function"
            ? csvImportUtils.getAllParsedImports()
            : null

    const importedOrdersData =
        resolvedAccountId &&
            importData &&
            typeof csvImportUtils.buildOrdersData === "function"
            ? csvImportUtils.buildOrdersData(importData, resolvedAccountId)
            : {
                readOnly: false,
                fileName: "",
                importedAt: "",
                stats: {
                    total: 0,
                    filled: 0,
                    canceled: 0,
                    working: 0,
                    rejected: 0,
                },
                entries: [],
            }

    const importedFillsRaw = importData?.fills?.byAccount?.[resolvedAccountId]
    const importedFills = Array.isArray(importedFillsRaw) ? [...importedFillsRaw] : []

    const fillsSummary = importData?.fills?.summaryByAccount?.[resolvedAccountId] || {
        total: 0,
        totalCommission: 0,
    }

    const fillsByOrderId = buildFillsByOrderId(importedFills)

    const importedOrders = Array.isArray(importedOrdersData?.entries)
        ? importedOrdersData.entries.map((order) =>
            mapCsvOrderToDisplay(
                order,
                fillsByOrderId[cleanString(order?.orderId || order?.id)] || []
            )
        )
        : []

    const isCsvMode = Boolean(importedOrdersData.readOnly && importedOrders.length > 0)

    const orders = isCsvMode ? importedOrders : localOrders
    const totalRealizedPnl = getTotalRealizedPnl(orders)
    const totalPlannedStop = getTotalPlannedStop(orders)

    const importedContracts = importedOrders.reduce(
        (sum, order) => sum + toNumber(order.contracts),
        0
    )

    const importedFilledContracts = importedOrders.reduce(
        (sum, order) => sum + toNumber(order.filledContracts),
        0
    )

    const ordersWithFills = importedOrders.filter((order) => order.hasFillDetails).length

    const validation = isCsvMode
        ? {
            status: "ok",
            messages: [],
            totalContracts: importedContracts,
            maxContracts: null,
        }
        : validateOrdersAgainstAccount(account, orders)

    function persistOrders(updated) {
        if (!resolvedAccountId || isCsvMode) {
            return
        }

        setOrdersByAccount((prev) => ({
            ...prev,
            [resolvedAccountId]: updated,
        }))

        saveOrders(resolvedAccountId, updated)
        syncStoredAccountBalance(resolvedAccountId)

        if (typeof onAccountUpdated === "function") {
            onAccountUpdated()
        }
    }

    function handleAddOrder() {
        if (!resolvedAccountId || isCsvMode) {
            return
        }

        persistOrders([...orders, createEmptyOrder()])
    }

    function handleDeleteOrder(orderId) {
        if (!resolvedAccountId || isCsvMode) {
            return
        }

        persistOrders(orders.filter((order) => order.id !== orderId))
    }

    function handleChange(orderId, field, value) {
        if (!resolvedAccountId || isCsvMode) {
            return
        }

        const updated = orders.map((order) =>
            order.id === orderId
                ? {
                    ...order,
                    [field]: value,
                }
                : order
        )

        persistOrders(updated)
    }

    if (!resolvedAccountId) {
        return <div style={emptyStyle}>Kein Account gewählt.</div>
    }

    if (isCsvMode) {
        const filledCount = importedOrders.filter((order) => order.status === "Filled").length
        const openCount = importedOrders.filter((order) => order.status === "Open").length
        const cancelledCount = importedOrders.filter(
            (order) => order.status === "Cancelled"
        ).length

        return (
            <div style={wrapperStyle}>
                <div style={summaryGridStyle}>
                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Importierte Orders</div>
                        <div style={getSummaryValueStyle(importedOrders.length)}>
                            {importedOrders.length}
                        </div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Gesamt Contracts</div>
                        <div style={getSummaryValueStyle(validation.totalContracts)}>
                            {validation.totalContracts}
                        </div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Filled Orders</div>
                        <div style={getSummaryValueStyle(filledCount)}>{filledCount}</div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Open Orders</div>
                        <div style={getSummaryValueStyle(openCount)}>{openCount}</div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Orders mit Fills</div>
                        <div style={getSummaryValueStyle(ordersWithFills)}>
                            {ordersWithFills}
                        </div>
                    </div>

                    <div style={summaryCardStyle}>
                        <div style={summaryLabelStyle}>Filled Contracts</div>
                        <div style={getSummaryValueStyle(importedFilledContracts)}>
                            {importedFilledContracts}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        ...validationBoxBaseStyle,
                        ...getValidationBoxStyle("ok"),
                    }}
                >
                    <div style={messageListStyle}>
                        <div>Orders CSV Import ist aktiv. Das Orders Panel zeigt jetzt importierte Daten an.</div>
                        <div>Datei. {importedOrdersData.fileName || "-"}</div>
                        <div>Import Zeit. {formatDateTime(importedOrdersData.importedAt)}</div>
                        <div>Cancelled Orders. {cancelledCount}</div>
                        <div>Fills aktiv. {importedFills.length > 0 ? "Ja" : "Nein"}</div>
                        <div>Fills gesamt. {fillsSummary.total || 0}</div>
                        <div>Kommission gesamt. {formatMoney(fillsSummary.totalCommission || 0)}</div>
                        <div>Im CSV Modus sind die Orders hier read only.</div>
                    </div>
                </div>

                {orders.length === 0 ? (
                    <div style={emptyStyle}>Noch keine importierten Orders vorhanden.</div>
                ) : (
                    <div style={ordersListStyle}>
                        {orders.map((order, index) => (
                            <div key={order.id} style={cardStyle}>
                                <div style={orderHeaderStyle}>
                                    <div style={orderTitleStyle}>
                                        Import Order {index + 1}
                                        {order.symbol ? ` · ${order.symbol}` : ""}
                                    </div>

                                    <div
                                        style={{
                                            ...orderStatusBadgeStyle,
                                            ...getCsvStatusStyle(order.status),
                                        }}
                                    >
                                        {order.status || "-"}
                                    </div>
                                </div>

                                <div style={formRowLargeStyle}>
                                    <div>
                                        <label style={labelStyle}>Instrument</label>
                                        <div style={readonlyValueStyle}>{order.symbol || "-"}</div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Side</label>
                                        <div style={readonlyValueStyle}>{order.side || "-"}</div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Status</label>
                                        <div style={readonlyValueStyle}>{order.status || "-"}</div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Contracts</label>
                                        <div style={readonlyValueStyle}>
                                            {order.contracts || "0"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Typ</label>
                                        <div style={readonlyValueStyle}>{order.type || "-"}</div>
                                    </div>
                                </div>

                                <div style={formRowMediumStyle}>
                                    <div>
                                        <label style={labelStyle}>Preis</label>
                                        <div style={readonlyValueStyle}>
                                            {order.entry || "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Order Zeit</label>
                                        <div style={readonlyValueStyle}>
                                            {formatDateTime(order.createdAt)}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Import Quelle</label>
                                        <div style={readonlyValueStyle}>
                                            {order.hasFillDetails ? "Orders + Fills" : "Orders CSV"}
                                        </div>
                                    </div>
                                </div>

                                <div style={formRowMediumStyle}>
                                    <div>
                                        <label style={labelStyle}>Filled Contracts</label>
                                        <div style={readonlyValueStyle}>
                                            {order.filledContracts || 0}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Fill Ø Preis</label>
                                        <div style={readonlyValueStyle}>
                                            {order.fillAveragePrice !== null &&
                                                order.fillAveragePrice !== undefined
                                                ? String(order.fillAveragePrice)
                                                : "-"}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Letzter Fill</label>
                                        <div style={readonlyValueStyle}>
                                            {formatDateTime(order.fillLastTime)}
                                        </div>
                                    </div>
                                </div>

                                <div style={formRowMediumStyle}>
                                    <div>
                                        <label style={labelStyle}>Fills</label>
                                        <div style={readonlyValueStyle}>{order.fillCount || 0}</div>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Kommission</label>
                                        <div style={readonlyValueStyle}>
                                            {formatMoney(order.totalCommission || 0)}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        ...orderNoticeBaseStyle,
                                        ...getValidationBoxStyle("ok"),
                                    }}
                                >
                                    {order.hasFillDetails
                                        ? "Diese Order stammt aus Orders.csv und wurde mit Fills.csv angereichert."
                                        : "Diese Order stammt aus dem Orders CSV Import und ist im Panel read only."}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div style={wrapperStyle}>
            <div style={summaryGridStyle}>
                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Total Realized PnL</div>
                    <div style={getSummaryValueStyle(totalRealizedPnl)}>
                        {formatMoney(totalRealizedPnl)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Planned Stop Total</div>
                    <div style={getSummaryValueStyle(-totalPlannedStop)}>
                        {formatMoney(totalPlannedStop)}
                    </div>
                </div>

                <div style={summaryCardStyle}>
                    <div style={summaryLabelStyle}>Active Contracts</div>
                    <div style={getSummaryValueStyle(0)}>
                        {validation.totalContracts}
                        {validation.maxContracts !== null ? ` / ${validation.maxContracts}` : ""}
                    </div>
                </div>
            </div>

            <div
                style={{
                    ...validationBoxBaseStyle,
                    ...getValidationBoxStyle(validation.status),
                }}
            >
                {validation.messages.length === 0 ? (
                    <div>Order Validierung aktiv. Kein Contract Verstoß erkannt.</div>
                ) : (
                    <div style={messageListStyle}>
                        {validation.messages.map((message, index) => (
                            <div key={`${message}-${index}`}>{message}</div>
                        ))}
                    </div>
                )}
            </div>

            <div style={buttonRowStyle}>
                <button style={buttonStyle} onClick={handleAddOrder}>
                    Add Order
                </button>
            </div>

            {orders.length === 0 ? (
                <div style={emptyStyle}>Noch keine Orders vorhanden.</div>
            ) : (
                <div style={ordersListStyle}>
                    {orders.map((order, index) => {
                        const orderValidation = validateSingleOrder(account, order, orders)

                        return (
                            <div key={order.id} style={cardStyle}>
                                <div style={orderHeaderStyle}>
                                    <div style={orderTitleStyle}>
                                        Order {index + 1} {order.symbol ? `· ${order.symbol}` : ""}
                                    </div>

                                    <div
                                        style={{
                                            ...orderStatusBadgeStyle,
                                            ...getValidationBoxStyle(orderValidation.status),
                                        }}
                                    >
                                        Status. {getStatusLabel(orderValidation.status)}
                                    </div>
                                </div>

                                <div style={formRowLargeStyle}>
                                    <div>
                                        <label style={labelStyle}>Instrument</label>
                                        <select
                                            style={inputStyle}
                                            value={order.symbol}
                                            onChange={(e) =>
                                                handleChange(order.id, "symbol", e.target.value)
                                            }
                                        >
                                            {getInstrumentOptions(order.symbol).map((instrument) => (
                                                <option key={instrument} value={instrument}>
                                                    {instrument}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Side</label>
                                        <select
                                            style={inputStyle}
                                            value={order.side}
                                            onChange={(e) =>
                                                handleChange(order.id, "side", e.target.value)
                                            }
                                        >
                                            <option value="Buy">Buy</option>
                                            <option value="Sell">Sell</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Status</label>
                                        <select
                                            style={inputStyle}
                                            value={order.status}
                                            onChange={(e) =>
                                                handleChange(order.id, "status", e.target.value)
                                            }
                                        >
                                            <option value="Open">Open</option>
                                            <option value="Filled">Filled</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Contracts</label>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                ...getInputHighlightStyle(
                                                    orderValidation,
                                                    "contracts",
                                                    order
                                                ),
                                            }}
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={order.contracts ?? "1"}
                                            onChange={(e) =>
                                                handleChange(order.id, "contracts", e.target.value)
                                            }
                                        />
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Realized PnL</label>
                                        <input
                                            style={inputStyle}
                                            type="number"
                                            step="0.01"
                                            value={order.realizedPnl ?? "0"}
                                            onChange={(e) =>
                                                handleChange(
                                                    order.id,
                                                    "realizedPnl",
                                                    e.target.value
                                                )
                                            }
                                        />
                                    </div>
                                </div>

                                <div style={formRowMediumStyle}>
                                    <div>
                                        <label style={labelStyle}>Entry</label>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                ...getInputHighlightStyle(
                                                    orderValidation,
                                                    "entry",
                                                    order
                                                ),
                                            }}
                                            type="number"
                                            step="0.01"
                                            value={order.entry}
                                            onChange={(e) =>
                                                handleChange(order.id, "entry", e.target.value)
                                            }
                                        />
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Stop Loss</label>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                ...getInputHighlightStyle(
                                                    orderValidation,
                                                    "stopLoss",
                                                    order
                                                ),
                                            }}
                                            type="number"
                                            step="0.01"
                                            value={order.stopLoss}
                                            onChange={(e) =>
                                                handleChange(order.id, "stopLoss", e.target.value)
                                            }
                                        />
                                    </div>

                                    <div>
                                        <label style={labelStyle}>Take Profit</label>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                ...getInputHighlightStyle(
                                                    orderValidation,
                                                    "takeProfit",
                                                    order
                                                ),
                                            }}
                                            type="number"
                                            step="0.01"
                                            value={order.takeProfit}
                                            onChange={(e) =>
                                                handleChange(
                                                    order.id,
                                                    "takeProfit",
                                                    e.target.value
                                                )
                                            }
                                        />
                                    </div>
                                </div>

                                <div
                                    style={{
                                        ...orderNoticeBaseStyle,
                                        ...getValidationBoxStyle(orderValidation.status),
                                    }}
                                >
                                    {orderValidation.messages.length === 0 ? (
                                        <div>Diese Order ist aktuell regelkonform.</div>
                                    ) : (
                                        <div style={messageListStyle}>
                                            {orderValidation.messages.map((message, msgIndex) => (
                                                <div key={`${order.id}-${message}-${msgIndex}`}>
                                                    {message}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <button
                                        style={deleteButtonStyle}
                                        onClick={() => handleDeleteOrder(order.id)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}