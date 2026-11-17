// One password-strength rule for every place a password is set.
const MIN_PASSWORD_LENGTH = 8;

const isAcceptablePassword = (pw) => typeof pw === 'string' && pw.length >= MIN_PASSWORD_LENGTH && pw.length <= 128;

module.exports = { MIN_PASSWORD_LENGTH, isAcceptablePassword };
