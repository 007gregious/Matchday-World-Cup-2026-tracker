/**
 * Share match card as image — draws a small "scoreboard" styled card to an
 * offscreen canvas using the page's CURRENT theme colors (read via
 * getComputedStyle, so a shared image always matches dark/light mode), then
 * shares it via the Web Share API (mobile) or falls back to a direct
 * download (desktop / unsupported browsers).
 */

const WIDTH = 600;
const HEIGHT = 315; // a friendly social-share aspect ratio

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

function statusText(match) {
  const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);
  if (LIVE.has(match.status)) return match.minute ? `${match.minute}'` : 'LIVE';
  if (match.status === 'FINISHED') return 'FULL TIME';
  return new Date(match.utcDate).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function drawMatchCardCanvas(match, getFlag) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  const bg = cssVar('--surface');
  const ink = cssVar('--ink');
  const muted = cssVar('--muted');
  const scoreboardBg = cssVar('--scoreboard-bg');
  const scoreboardInk = cssVar('--scoreboard-ink');
  const pitch = cssVar('--pitch');

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Top accent bar
  ctx.fillStyle = pitch;
  ctx.fillRect(0, 0, WIDTH, 6);

  const home = match.home?.name || 'TBD';
  const away = match.away?.name || 'TBD';
  const homeScore = match.score?.home ?? '–';
  const awayScore = match.score?.away ?? '–';

  // Tag (group/stage)
  ctx.fillStyle = muted;
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  const tag = (match.group || match.stageLabel || 'MATCHDAY').toUpperCase();
  ctx.fillText(tag, 28, 30);

  // Status, right-aligned
  ctx.textAlign = 'right';
  ctx.fillText(statusText(match).toUpperCase(), WIDTH - 28, 30);
  ctx.textAlign = 'left';

  // Team rows
  function teamRow(name, flag, score, y) {
    ctx.fillStyle = ink;
    ctx.font = '34px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui';
    ctx.fillText(flag, 28, y);

    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText(name, 80, y + 2);

    // Scoreboard chip
    const chipW = 64;
    const chipX = WIDTH - 28 - chipW;
    ctx.fillStyle = scoreboardBg;
    roundRect(ctx, chipX, y - 4, chipW, 44, 8);
    ctx.fill();
    ctx.fillStyle = scoreboardInk;
    ctx.font = '700 26px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(score), chipX + chipW / 2, y + 4);
    ctx.textAlign = 'left';
  }

  teamRow(home, getFlag(home), homeScore, 110);
  teamRow(away, getFlag(away), awayScore, 180);

  // Footer branding
  ctx.fillStyle = muted;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText('MATCHDAY', 28, HEIGHT - 36);

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shareMatchCard(match, getFlag) {
  return new Promise((resolve) => {
    const canvas = drawMatchCardCanvas(match, getFlag);
    canvas.toBlob(async (blob) => {
      if (!blob) return resolve();
      const home = match.home?.name || 'TBD';
      const away = match.away?.name || 'TBD';
      const filename = `${home}-vs-${away}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') + '.png';
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Matchday', text: `${home} vs ${away}` });
          return resolve();
        } catch {
          // Cancelled or failed silently — fall through to a plain download
          // so the action never feels like a dead end.
        }
      }
      downloadBlob(blob, filename);
      resolve();
    }, 'image/png');
  });
}
