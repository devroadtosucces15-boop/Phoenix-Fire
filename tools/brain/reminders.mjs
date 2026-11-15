// End-of-session reminder: prints every open brainstorm idea with the question "tackle it or drop it?".
//   node tools/brain/reminders.mjs            list open ideas
//   node tools/brain/reminders.mjs tackle <id> | drop <id>     mark one (same files the Brainstorm tab writes)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openNotes, setStatus } from './inbox.mjs';

export function reminderText(notes = openNotes()) {
  if (!notes.length) return 'Brainstorm inbox: no open ideas.';
  return [`Brainstorm inbox: ${notes.length} open idea${notes.length === 1 ? '' : 's'}. For each: tackle it (roadmap item or inbox row) or drop it.`,
    ...notes.map((n) => `- ${n.id} (${n.date.slice(0, 10)}, ${n.source}): ${n.text.replace(/\s+/g, ' ').slice(0, 140)}`),
    'Mark one: node tools/brain/reminders.mjs tackle <id>  |  node tools/brain/reminders.mjs drop <id>'].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, id] = process.argv.slice(2);
  if (cmd === 'tackle' || cmd === 'drop') {
    const r = setStatus(id, cmd === 'tackle' ? 'tackled' : 'dropped');
    console.log(r.ok ? `${id}: ${r.note.status}` : `error: ${r.error}`); process.exitCode = r.ok ? 0 : 1;
  } else console.log(reminderText());
}
