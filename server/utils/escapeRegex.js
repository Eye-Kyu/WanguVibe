// User-supplied search text is matched literally — never interpreted as a
// regex — so a crafted pattern can't trigger catastrophic backtracking in
// MongoDB. Also caps length so a single search can't be arbitrarily large.
const MAX_SEARCH_LENGTH = 100;

function escapeRegex(input) {
  return String(input).slice(0, MAX_SEARCH_LENGTH).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex, MAX_SEARCH_LENGTH };
