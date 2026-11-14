// node scripts/validate-events.mjs – how well the decoded EA event counters agree with EA's own named fields, on every archived match.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './lib.mjs';
import { validateDecoder, formatReport } from './lib/validate.mjs';

const dir = path.join(DATA, 'matches');
const matches = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
console.log(formatReport(validateDecoder(matches)));
