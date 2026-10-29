#!/usr/bin/env node
// Uso: SES_UNLOCK_SECRET=tu_secreto node scripts/ses-code.js ses_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx [otro_id ...]
// Imprime la contraseña de desbloqueo de cada sesión (la misma que calcula el servidor; no se guarda en ningún sitio).
const { unlockCode, ID_RE } = require('../netlify/functions/_lib/ses-core');
if (!process.env.SES_UNLOCK_SECRET) { console.error('Falta SES_UNLOCK_SECRET.'); process.exit(1); }
const ids = process.argv.slice(2); if (!ids.length) { console.error('Pasa el código de sesión (ses_...).'); process.exit(1); }
for (const id of ids) console.log(ID_RE.test(id.trim()) ? id.trim() + '  ->  ' + unlockCode(id.trim()) : id + '  ->  código de sesión no válido');
