const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_LOCAL_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DMY_DOTS_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const DMY_SLASH_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isValidDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime());
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function buildDate(year, month, day, hours = 0, minutes = 0, seconds = 0) {
    const date = new Date(year, month - 1, day, hours, minutes, seconds);

    if (!isValidDate(date)) {
        return null;
    }

    if (
        date.getFullYear() !== Number(year) ||
        date.getMonth() !== Number(month) - 1 ||
        date.getDate() !== Number(day)
    ) {
        return null;
    }

    return date;
}

export function toDateValue(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (value instanceof Date) {
        return isValidDate(value) ? new Date(value.getTime()) : null;
    }

    if (typeof value === "number") {
        const date = new Date(value);
        return isValidDate(date) ? date : null;
    }

    if (typeof value !== "string") {
        return null;
    }

    const raw = value.trim();

    if (!raw) {
        return null;
    }

    if (/^\d+$/.test(raw)) {
        const numericDate = new Date(Number(raw));
        return isValidDate(numericDate) ? numericDate : null;
    }

    const dateOnlyMatch = raw.match(DATE_ONLY_PATTERN);
    if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        return buildDate(Number(year), Number(month), Number(day));
    }

    const dateTimeLocalMatch = raw.match(DATE_TIME_LOCAL_PATTERN);
    if (dateTimeLocalMatch) {
        const [, year, month, day, hours, minutes, seconds = "0"] =
            dateTimeLocalMatch;

        return buildDate(
            Number(year),
            Number(month),
            Number(day),
            Number(hours),
            Number(minutes),
            Number(seconds)
        );
    }

    const dmyDotsMatch = raw.match(DMY_DOTS_PATTERN);
    if (dmyDotsMatch) {
        const [, day, month, year] = dmyDotsMatch;
        return buildDate(Number(year), Number(month), Number(day));
    }

    const dmySlashMatch = raw.match(DMY_SLASH_PATTERN);
    if (dmySlashMatch) {
        const [, day, month, year] = dmySlashMatch;
        return buildDate(Number(year), Number(month), Number(day));
    }

    const parsed = new Date(raw);
    return isValidDate(parsed) ? parsed : null;
}

export function formatDateDMY(value, fallback = "—") {
    const date = toDateValue(value);

    if (!date) {
        return fallback;
    }

    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatTimeHM(value, fallback = "—") {
    const date = toDateValue(value);

    if (!date) {
        return fallback;
    }

    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTimeDMY(value, fallback = "—") {
    const date = toDateValue(value);

    if (!date) {
        return fallback;
    }

    return `${formatDateDMY(date, fallback)}, ${formatTimeHM(date, fallback)}`;
}

export function toInputDateValue(value) {
    const date = toDateValue(value);

    if (!date) {
        return "";
    }

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toInputDateTimeValue(value) {
    const date = toDateValue(value);

    if (!date) {
        return "";
    }

    return `${toInputDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/*
 Rückwärtskompatible Exporte für bestehende Imports in der App
*/
export const formatDate = formatDateDMY;
export const formatDateTime = formatDateTimeDMY;
export const formatTime = formatTimeHM;