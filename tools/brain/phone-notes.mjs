// Pull ideas typed or dictated on the phone Brainstorm tab into LIBRARY/inbox/. No dependencies.
//   node tools/brain/phone-notes.mjs import <file.json>
// The file is a JSON array of {id, text, source, status} read from the hosted artifact's shared storage (collection phone-notes) by the session
// (ArtifactData list). Only status "open" rows are imported; a row whose text looks like a secret is refused. Prints the ids that were imported so
// the session can mark them pulled in the shared storage and not import them twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addNote } from './inbox.mjs';

export function importPhoneNotes(rows) {
  const done = []; const skipped = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.status !== 'open') { skipped.push({ id: r && r.id, why: 'not open' }); continue; }
    const res = addNote(String(r.text || ''), r.source === 'dictated' ? 'dictated' : 'typed');
    if (res.ok) done.push({ phoneId: r.id, note: res.note.id }); else skipped.push({ id: r.id, why: res.error });
  }
  return { imported: done, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'import' || !process.argv[3]) { console.error('usage: node tools/brain/phone-notes.mjs import <file.json>'); process.exit(2); }
  const r = importPhoneNotes(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')));
  console.log(JSON.stringify(r, null, 2));
}
