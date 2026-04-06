// utils/session.ts

function pad2(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

export function getSessionKey(date = new Date()): string {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());

    return `${year}-${month}-${day}`;
}