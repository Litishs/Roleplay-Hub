// regex-utils — small shared helpers for regex script processing.

// Cheap short-circuit for scripts that do not match: expanding the replacement
// string on every large message is wasted work when most scripts miss most
// messages. Sticky regexes are left alone because test() would advance
// lastIndex and change replace() semantics.
export const replaceMatched = (text, re, replacement) => {
    if (re.sticky) return text.replace(re, replacement);
    re.lastIndex = 0;
    return re.test(text) ? text.replace(re, replacement) : text;
};