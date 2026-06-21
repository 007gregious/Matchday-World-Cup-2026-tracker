/**
 * Add to calendar — generates a standard .ics file entirely client-side
 * (no server involved) and triggers a download. Works with every major
 * calendar app since .ics is a plain, decades-old open format.
 */

const ASSUMED_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours, including stoppage time

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Format a Date as the UTC "basic" form .ics requires: 20260621T153000Z */
function formatICSDate(date) {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/** Escape text per RFC 5545 (commas, semicolons, backslashes, newlines). */
function escapeICS(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildICS(match) {
  const start = new Date(match.utcDate);
  const end = new Date(start.getTime() + ASSUMED_DURATION_MS);
  const homeName = match.home?.name || 'TBD';
  const awayName = match.away?.name || 'TBD';
  const summary = `${homeName} vs ${awayName}`;
  const description = [match.stageLabel, match.group].filter(Boolean).join(' — ');
  const uid = `matchday-${match.id}@matchday.app`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Matchday//World Cup Tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${escapeICS(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
  if (match.venue) lines.push(`LOCATION:${escapeICS(match.venue)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  // .ics requires CRLF line endings.
  return lines.join('\r\n');
}

export function downloadICS(match) {
  const ics = buildICS(match);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const homeName = match.home?.name || 'TBD';
  const awayName = match.away?.name || 'TBD';
  const filename = `${homeName}-vs-${awayName}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') + '.ics';

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
