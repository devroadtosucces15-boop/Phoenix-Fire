// The shared-secret header that the site build, GitHub Actions and the scripts send to the keyed /api/*/public routes.
// A2 dual-read: X-Phoenix-Key is the name everything sends now; X-Norex-Key is still accepted for callers built before the rename.
export const KEY_HEADER = 'X-Phoenix-Key';
export const sharedKey = (request) => request.headers.get(KEY_HEADER) ?? request.headers.get('X-Norex-Key');
