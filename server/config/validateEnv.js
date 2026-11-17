// Fails fast at startup on configuration that would make the app unsafe or
// silently broken, instead of discovering it mid-sale. In production the
// rules are strict; elsewhere problems are only warnings.

const WEAK_SECRETS = new Set(['replace-with-a-long-random-string', 'secret', 'changeme', 'test-jwt-secret', 'ci-smoke-test-secret']);

function checkEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const isProd = env.NODE_ENV === 'production';
  const need = (key, why) => { if (!env[key]) errors.push(`${key} is required${why ? ` (${why})` : ''}`); };

  need('MONGO_URI');
  need('JWT_SECRET');
  if (env.JWT_SECRET && (env.JWT_SECRET.length < 32 || WEAK_SECRETS.has(env.JWT_SECRET))) {
    (isProd ? errors : warnings).push('JWT_SECRET must be a long random value (32+ characters) — generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  }
  if (isProd) need('CLIENT_URL', 'CORS allowlist for the POS web app');

  const mpesa = env.MPESA_MODE || 'mock';
  if (!['mock', 'sandbox', 'production'].includes(mpesa)) errors.push(`MPESA_MODE must be mock, sandbox or production (got "${mpesa}")`);
  if (mpesa !== 'mock') {
    ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_URL', 'MPESA_CALLBACK_TOKEN'].forEach((k) => need(k, `MPESA_MODE=${mpesa}`));
    if (env.MPESA_CALLBACK_TOKEN && env.MPESA_CALLBACK_TOKEN.length < 32) errors.push('MPESA_CALLBACK_TOKEN must be at least 32 characters');
    if (env.MPESA_CALLBACK_URL && !env.MPESA_CALLBACK_URL.startsWith('https://')) errors.push('MPESA_CALLBACK_URL must be https');
    if (!env.MPESA_INITIATOR_NAME || !env.MPESA_SECURITY_CREDENTIAL) {
      warnings.push('MPESA_INITIATOR_NAME / MPESA_SECURITY_CREDENTIAL not set — automatic M-Pesa refunds will fail and need manual handling');
    }
  }

  const etims = env.ETIMS_MODE || 'mock';
  if (!['mock', 'live'].includes(etims)) errors.push(`ETIMS_MODE must be mock or live (got "${etims}")`);
  if (etims === 'live') ['ETIMS_BASE_URL', 'ETIMS_TIN', 'ETIMS_CMC_KEY'].forEach((k) => need(k, 'ETIMS_MODE=live'));

  const sms = env.SMS_MODE || 'mock';
  if (!['mock', 'live'].includes(sms)) errors.push(`SMS_MODE must be mock or live (got "${sms}")`);
  if (sms === 'live') ['AT_USERNAME', 'AT_API_KEY'].forEach((k) => need(k, 'SMS_MODE=live'));

  if (isProd) {
    if (mpesa === 'mock') warnings.push('MPESA_MODE=mock in production — M-Pesa payments are simulated, no money moves');
    if (etims === 'mock') warnings.push('ETIMS_MODE=mock in production — invoices are NOT being sent to KRA');
    if (sms === 'mock') warnings.push('SMS_MODE=mock in production — receipts and balance codes are not actually sent');
    if (!env.SENTRY_DSN) warnings.push('SENTRY_DSN not set — production errors will only be in the logs');
    if (!env.TRUST_PROXY) warnings.push('TRUST_PROXY not set — if this runs behind a proxy/load balancer, every client shares one rate-limit bucket');
  }

  return { errors, warnings };
}

function validateEnvOrExit(logger, env = process.env) {
  const { errors, warnings } = checkEnv(env);
  warnings.forEach((w) => logger.warn(`Config: ${w}`));
  if (errors.length) {
    errors.forEach((e) => logger.error(`Config: ${e}`));
    logger.error('Refusing to start with invalid configuration — see server/.env.example');
    process.exit(1);
  }
}

module.exports = { checkEnv, validateEnvOrExit };
