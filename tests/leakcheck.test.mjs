// The Phoenix build guard must catch another club's name or palette in built output, and ignore internal identifiers.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { t, done } from './lib.mjs';
import { findLeaks } from '../phoenix/leakcheck.mjs';

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-'));
const w = (f, s) => fs.writeFileSync(path.join(d, f), s);
w('clean.html', '<title>PHOENIX FIRE</title><script>localStorage.setItem("norex.as","owner");window.NOREX_API="x"</script><style>.a{color:#e8651a}</style>');
w('manifest.webmanifest', '{"name":"PHOENIX FIRE","theme_color":"#0a0705"}');
t('identifiers in scripts and a clean manifest pass', findLeaks(d).length === 0);

w('name.html', '<h1>NOREX UNITED</h1>');
t('a visible NOREX name must fail', findLeaks(d).length === 1);
fs.rmSync(path.join(d, 'name.html'));
w('alt.html', '<img alt="Norex crest" src="c.png">');
t('a NOREX name in an attribute must fail', findLeaks(d).length === 1);
fs.rmSync(path.join(d, 'alt.html'));
w('manifest.webmanifest', '{"name":"NOREX UNITED FC","theme_color":"#080b11"}');
t('NOREX manifest name and blue-black must both fail', findLeaks(d).length === 2);
w('manifest.webmanifest', '{"name":"PHOENIX FIRE"}');
w('x.css', 'a{color:#C8352C}');
t('the NOREX red in css must fail', findLeaks(d).length === 1);
fs.rmSync(d, { recursive: true });
done();
