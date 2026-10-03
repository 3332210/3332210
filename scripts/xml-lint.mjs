/**
 * A small XML well-formedness checker, sufficient for the SVG subset this kit
 * generates.
 *
 * Why this exists: the first version of scripts/check.mjs validated everything
 * with regular expressions, so it happily passed two assets whose attributes
 * were malformed (`font-family="ui-monospace, "SF Mono", ..."` closed the
 * attribute early). The files were not valid XML. Browsers render such a file
 * only up to the error and paint a parse-error banner over it, so the failure
 * is invisible to a regex and obvious the moment a human opens it.
 *
 * Deliberately self-contained: it must run identically in CI (plain Node, no
 * dependencies) and locally.
 *
 * @param {string} src
 * @returns {{ ok: boolean, error?: string, line?: number, column?: number, root?: string, counts: Record<string, number> }}
 */
export function checkXml(src) {
  const counts = {};
  let i = 0;
  const len = src.length;
  const stack = [];
  let root = null;

  const posOf = (index) => {
    let line = 1, col = 1;
    for (let k = 0; k < index && k < len; k++) {
      if (src[k] === '\n') { line++; col = 1; } else col++;
    }
    return { line, column: col };
  };
  const fail = (msg, index = i) => {
    const { line, column } = posOf(index);
    return { ok: false, error: `${msg} (line ${line}, column ${column})`, line, column, counts };
  };

  const nameAt = (from) => {
    const m = /^[A-Za-z_:][-A-Za-z0-9_:.]*/.exec(src.slice(from));
    return m ? m[0] : null;
  };

  while (i < len) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;

    // Text content between tags must not contain a raw '<' or an unescaped '&'.
    const textChunk = src.slice(i, lt);
    const badAmp = /&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)/.exec(textChunk);
    if (badAmp) return fail(`unescaped '&' in text content`, i + badAmp.index);

    i = lt;

    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) return fail('unterminated comment');
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end === -1) return fail('unterminated CDATA section');
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end === -1) return fail('unterminated processing instruction');
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!', i)) {
      // DOCTYPE / markup declaration — skip to the matching '>'.
      const end = src.indexOf('>', i);
      if (end === -1) return fail('unterminated declaration');
      i = end + 1;
      continue;
    }

    if (src.startsWith('</', i)) {
      const name = nameAt(i + 2);
      if (!name) return fail('malformed closing tag');
      const after = i + 2 + name.length;
      const gt = src.indexOf('>', after);
      if (gt === -1) return fail('unterminated closing tag');
      if (src.slice(after, gt).trim() !== '') return fail(`junk inside closing tag </${name}>`, after);
      const open = stack.pop();
      if (open !== name) {
        return fail(`closing tag </${name}> does not match open <${open ?? 'nothing'}>`, i);
      }
      i = gt + 1;
      continue;
    }

    // Opening (or self-closing) tag.
    const name = nameAt(i + 1);
    if (!name) return fail(`malformed tag`, i);
    counts[name] = (counts[name] ?? 0) + 1;
    if (!root) root = name;

    let j = i + 1 + name.length;
    let selfClosing = false;
    // Parse attributes with a real state machine so a stray quote is caught.
    for (;;) {
      while (j < len && /\s/.test(src[j])) j++;
      if (j >= len) return fail(`unterminated tag <${name}>`, i);
      if (src[j] === '/') {
        if (src[j + 1] !== '>') return fail(`expected '>' after '/' in <${name}>`, j);
        selfClosing = true;
        j += 2;
        break;
      }
      if (src[j] === '>') { j += 1; break; }

      const an = /^[A-Za-z_:][-A-Za-z0-9_:.]*/.exec(src.slice(j));
      if (!an) {
        return fail(`invalid attribute name in <${name}> (unexpected '${src[j]}')`, j);
      }
      j += an[0].length;
      while (j < len && /\s/.test(src[j])) j++;
      if (src[j] === '=') {
        j++;
        while (j < len && /\s/.test(src[j])) j++;
        const quote = src[j];
        if (quote !== '"' && quote !== "'") {
          return fail(`attribute "${an[0]}" in <${name}> is not quoted`, j);
        }
        const close = src.indexOf(quote, j + 1);
        if (close === -1) return fail(`unterminated value for attribute "${an[0]}" in <${name}>`, j);
        const value = src.slice(j + 1, close);
        if (value.includes('<')) {
          return fail(`attribute "${an[0]}" in <${name}> contains a raw '<'`, j);
        }
        const badAmp = /&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)/.exec(value);
        if (badAmp) {
          return fail(`unescaped '&' in attribute "${an[0]}" of <${name}>`, j + 1 + badAmp.index);
        }
        j = close + 1;
      }
    }

    if (!selfClosing) stack.push(name);
    i = j;
  }

  if (stack.length) {
    return fail(`unclosed tag(s): <${stack.join('>, <')}>`, len - 1);
  }
  if (!root) return fail('no elements found');

  return { ok: true, root, counts };
}
