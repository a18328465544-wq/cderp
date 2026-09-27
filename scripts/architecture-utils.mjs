/**
 * Collect JSX opening elements and their active ancestors without relying on
 * regular-expression counting. This is intentionally a small lexical scanner:
 * it understands comments, strings, JSX attributes, expressions and closing
 * tags, which is enough for architecture-region checks without adding a full
 * TypeScript compiler dependency to the lint scripts.
 */
export function collectJsxElements(source) {
  const elements = [];
  const stack = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const lineEnd = source.indexOf("\n", index + 2);
      index = lineEnd === -1 ? source.length : lineEnd + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }
    if (source[index] === "'" || source[index] === '"' || source[index] === "`") {
      index = skipQuoted(source, index);
      continue;
    }
    if (source[index] !== "<") {
      index += 1;
      continue;
    }

    const closing = source[index + 1] === "/";
    const nameStart = index + (closing ? 2 : 1);
    const nameMatch = source.slice(nameStart).match(/^[A-Za-z][A-Za-z0-9_.:-]*/);
    if (!nameMatch) {
      index += 1;
      continue;
    }

    const name = nameMatch[0];
    const tagStart = nameStart + name.length;
    const tagEnd = findTagEnd(source, tagStart);
    if (tagEnd === -1) {
      index = source.length;
      continue;
    }

    if (closing) {
      const matchingIndex = findLastIndex(stack, (item) => item.name === name);
      if (matchingIndex !== -1) stack.splice(matchingIndex);
    } else {
      elements.push({name, ancestors: stack.map((item) => item.name)});
      if (!isSelfClosing(source, tagEnd)) stack.push({name});
    }

    index = tagEnd + 1;
  }

  return elements;
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function skipQuoted(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function findTagEnd(source, start) {
  let quote = null;
  let braceDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      continue;
    }
    if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }
    if (character === ">" && braceDepth === 0) return index;
  }
  return -1;
}

function isSelfClosing(source, tagEnd) {
  let index = tagEnd - 1;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  return source[index] === "/";
}
