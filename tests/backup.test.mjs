// The nightly backup workflow, the restore runbook, wrangler and bot.yml all name the same Phoenix resources.
import fs from 'node:fs';
import { t, done } from './lib.mjs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const backup = read('.github/workflows/backup.yml'), restore = read('bot/RESTORE.md'), toml = read('bot/wrangler.toml');
const botYml = read('.github/workflows/bot.yml'), ensure = read('bot/ensure-resources.mjs');
const db = toml.match(/database_name = "([^"]+)"/)?.[1], bucket = toml.match(/bucket_name = "([^"]+)"/)?.[1];

t('wrangler names the database phoenix', db === 'phoenix');
t('bot.yml migrates that database', botYml.includes(`migrations apply ${db} `));
t('ensure-resources creates that database and bucket', ensure.includes(`D1_NAME = '${db}'`) && ensure.includes(`BUCKET = '${bucket}'`));
t('backup.yml exports that database', backup.includes(`D1_NAME: ${db}`) && /d1 export "\$D1_NAME" --remote/.test(backup));
t('backup.yml uploads to that bucket under backups/', backup.includes(`R2_BUCKET: ${bucket}`) && backup.includes('backups/phoenix-') && /r2 object put "\$R2_BUCKET\/\$KEY"/.test(backup));
t('backup.yml runs nightly and on demand', /cron: "\d+ \d+ \* \* \*"/.test(backup) && backup.includes('workflow_dispatch'));
t('backup.yml uses the existing Cloudflare secrets only', ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].every((s) => backup.includes(`secrets.${s}`)));
t('backup.yml fails when the token is missing or the dump is empty', /exit 1/.test(backup) && backup.includes('CREATE TABLE'));
t('RESTORE.md uses the same names', restore.includes(`d1 execute ${db}`) && restore.includes(`${bucket}/backups/phoenix-`));
t('RESTORE.md and ensure-resources name no NOREX resource', !/norex-(media|members|jobs)|d1 (execute|delete) norex|`norex` D1/.test(restore + ensure));
done();
