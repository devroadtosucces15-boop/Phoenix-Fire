// Result club pill: every result says which of our clubs it came from; an XI friendly is flagged PHOENIX XI VPG, high importance.
import { clubTag } from '../scripts/lib/clubtag.mjs';
import { tagBlock } from '../bot/ui.js';
import { t, done } from './lib.mjs';

const config = { siteTitle: 'PHOENIX FIRE', homeClubId: 1111, clubTags: { 2484: { label: 'PHOENIX XI', friendlyLabel: 'PHOENIX XI VPG' } } };
const org = { primary: '1111', clubs: [{ ea_club_id: '1111', display_name: 'Phoenix Fire 1' }, { ea_club_id: '2484', display_name: 'Phoenix Fire XI' }, { ea_club_id: '2500', display_name: 'Phoenix Fire 2' }] };
const tag = (src, type) => clubTag({ src, type, org, config });

t('main club league result is tagged with its org name', tag('1111', 'league').label === 'PHOENIX FIRE 1' && !tag('1111', 'league').important);
t('XI league result is tagged PHOENIX XI, not important', tag('2484', 'league').label === 'PHOENIX XI' && !tag('2484', 'league').important);
t('XI friendly is PHOENIX XI VPG and important', tag('2484', 'friendly').label === 'PHOENIX XI VPG' && tag('2484', 'friendly').important === true);
t('another club friendly stays a normal pill', tag('2500', 'friendly').label === 'PHOENIX FIRE 2' && !tag('2500', 'friendly').important);
t('no org snapshot falls back to config/siteTitle', clubTag({ src: '1111', config }).label === 'PHOENIX FIRE');
t('pill text: badge for normal, sirens + bold kind for important',
  tagBlock(tag('1111', 'league'), 'League').content === '**`PHOENIX FIRE 1`** · LEAGUE'
  && tagBlock(tag('2484', 'friendly'), 'Friendly').content === '🚨 **`PHOENIX XI VPG`** · **FRIENDLY** 🚨');
t('no tag → no block', tagBlock(null, 'League') === null);
done();
