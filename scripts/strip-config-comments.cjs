const fs = require('node:fs');
const childProcess = require('node:child_process');

function stripSqlComments(source) {
  let result = '';
  let position = 0;
  while (position < source.length) {
    const character = source[position];
    if (character === "'" || character === '"') {
      const quote = character;
      const start = position++;
      const escapedString = quote === "'" && /[eE]/.test(source[start - 1] || '');
      while (position < source.length) {
        if (escapedString && source[position] === '\\') {
          position += 2;
          continue;
        }
        if (source[position] === quote) {
          position++;
          if (source[position] === quote) {
            position++;
            continue;
          }
          break;
        }
        position++;
      }
      result += source.slice(start, position);
      continue;
    }
    const dollarQuote = source.slice(position).match(/^\$[A-Za-z_0-9]*\$/);
    if (dollarQuote) {
      const delimiter = dollarQuote[0];
      const end = source.indexOf(delimiter, position + delimiter.length);
      if (end !== -1) {
        const body = source.slice(position + delimiter.length, end);
        result += delimiter + stripSqlComments(body) + delimiter;
        position = end + delimiter.length;
        continue;
      }
    }
    if (source.startsWith('--', position)) {
      const end = source.indexOf('\n', position);
      if (end === -1) {
        result += ' ';
        break;
      }
      result += ' ';
      position = end;
      continue;
    }
    if (source.startsWith('/*', position)) {
      let depth = 1;
      position += 2;
      result += ' ';
      while (position < source.length && depth > 0) {
        if (source.startsWith('/*', position)) {
          depth++;
          position += 2;
        } else if (source.startsWith('*/', position)) {
          depth--;
          position += 2;
        } else {
          if (source[position] === '\n') result += '\n';
          position++;
        }
      }
      if (depth) throw Error('Unclosed SQL comment');
      continue;
    }
    result += character;
    position++;
  }
  return result;
}

if (require.main === module) {
  const files = childProcess
    .execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/);
  const changed = [];
  for (const filename of files) {
    if (!/\.(sql|toml|svg)$/.test(filename)) continue;
    const source = fs.readFileSync(filename, 'utf8');
    let cleaned = source;
    if (filename.endsWith('.sql')) cleaned = stripSqlComments(source);
    else if (filename.endsWith('.toml')) cleaned = source.replace(/^\s*#[^\r\n]*/gm, '');
    else if (filename.endsWith('.svg')) cleaned = source.replace(/<!--[\s\S]*?-->/g, '');
    else continue;
    if (source !== cleaned) {
      fs.writeFileSync(filename, cleaned);
      changed.push(filename);
    }
  }
  console.log(JSON.stringify(changed));
}
module.exports = { stripSqlComments };
