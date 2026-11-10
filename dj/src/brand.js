// Phoenix DJ brand: the one place for names, colours and the crest (Phoenix rule: brand values come from config).
// Reads the repo's config.json when it is next to this folder (running from the repo); the defaults below match it.
import fs from 'node:fs';

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(new URL('../../config.json', import.meta.url), 'utf8')).brand ?? {}; } catch { /* Docker build: dj/ only */ }
const hex = (h) => parseInt(String(h).replace('#', ''), 16);

export const CLUB = process.env.BRAND_CLUB || 'PHOENIX FIRE';
export const BOT = process.env.BRAND_BOT || 'Phoenix DJ';
export const ROOMS = `${CLUB.split(' ')[0]} ROOMS`; // fallback voice-room category name, e.g. "PHOENIX ROOMS"
export const ROOM_CODE = process.env.BRAND_ROOM_CODE || 'PHX'; // room codes: PHX-001, PHX-002...
export const EMOJI_PREFIX = 'px_'; // the bot's own application emoji: px_play, px_skip...
export const ACCENT = cfg.red || '#e8651a'; // Phoenix ember orange
export const ACCENT_2 = '#ff8a3d', ACCENT_SOFT = '#ffb27a', GOLD = '#efcf7a';
// Warm ink palette (Phoenix ink #0a0705) for drawn cards and icons.
export const INK = { bg0: '#140b07', bg1: cfg.ink || '#0a0705', pill: '#1a0f0a', line: '#3a2416', track: '#2e1a10', muted: '#8a7462', soft: '#bfa896', text: '#fbf3ea', glyph: '#f5ebe0' };
export const COLORS = { accent: hex(ACCENT), gold: hex(GOLD), green: 0x4be08a, ok: 0x3fa56b, warn: 0xe0a030, loss: 0xff7d72, steel: hex(INK.muted) };
