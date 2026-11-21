// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Same answer for every input, much less CPU: a fast path splits clean lines
// on ',' in one C++ pass, and every other field is read with indexOf jumps
// instead of one character at a time. The broken-row policy is the
// reference's own, kept exactly: BOM, stray CRs, quoted fields, doubled
// quotes, quote junk, unterminated quotes, short/long rows, and the error
// records {code, line, row} in the order met.
//
// Every search is bounded to the field or line it reads: a CR inside a
// field's span is always stray (a CR followed by LF would have ended the
// field at that LF), so it is found on the field's own slice, never by
// scanning the rest of the text for the next stray CR.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  const pushErr = (code) => {
    errors.push({ code, line: recordLine, row: recordRow });
  };

  // The span an unquoted field starting at `pos` covers: its end, how it
  // ended, and the end of its kept characters (a CR before a LF is the line
  // break's own, not part of the field).
  function fieldSpan() {
    const c = text.indexOf(',', pos);
    const n = text.indexOf('\n', pos);
    let end = len;
    let ended = END;
    if (c !== -1 && (n === -1 || c < n)) {
      end = c;
      ended = COMMA;
    } else if (n !== -1) {
      end = n;
      ended = LINE_BREAK;
    }
    let fend = end;
    if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) fend = end - 1;
    return { end, ended, fend };
  }

  // The kept characters of text[pos..fend): a CR in there is always stray,
  // so it is dropped with one stray_cr error each; returns '' when the span
  // holds none (the common case is one slice, no scan of the rest).
  function keptSpan(fend) {
    const seg = text.slice(pos, fend);
    if (seg.indexOf('\r') === -1) return seg;
    const parts = seg.split('\r');
    for (let i = 1; i < parts.length; i++) pushErr('stray_cr');
    return parts.join('');
  }

  // Appends text[from..to) to `value`, turning each CRLF or lone CR in it
  // into one LF and counting the line breaks it holds.
  function appendSegment(value, from, to) {
    if (from === to) return value;
    const seg = text.slice(from, to);
    if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) return value === '' ? seg : value + seg;
    const breaks = seg.match(/\r\n|\r|\n/g);
    if (breaks !== null) line += breaks.length;
    const fixed = seg.replace(/\r\n?/g, '\n');
    return value === '' ? fixed : value + fixed;
  }

  // Reads unquoted characters onto `init` up to the next comma or line
  // break. Returns the field, how it ended, and how many characters were
  // kept after `init`. Used for quote junk and for the re-read after an
  // unterminated quote.
  function readUnquoted(init) {
    const span = fieldSpan();
    const seg = keptSpan(span.fend);
    const value = seg === '' ? init : init === '' ? seg : init + seg;
    if (span.ended === COMMA) {
      pos = span.end + 1;
      return { value, ended: COMMA, added: seg.length };
    }
    if (span.ended === LINE_BREAK) {
      pos = span.end + 1;
      line += 1;
      return { value, ended: LINE_BREAK, added: seg.length };
    }
    pos = len;
    return { value, ended: END, added: seg.length };
  }

  // Reads a quoted field whose opening quote is at pos; sets qv/qe.
  let qv = '';
  let qe = END;
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let p = pos + 1;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) break; // the quote never closes
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote in the value.
        value = appendSegment(value, p, q);
        value += '"';
        p = q + 2;
        continue;
      }
      value = appendSegment(value, p, q);
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      pushErr('unterminated_quote');
      const again = readUnquoted('"');
      qv = again.value;
      qe = again.ended;
      return;
    }
    pos = close + 1;
    if (pos >= len) {
      qv = value;
      qe = END;
      return;
    }
    const ch = text.charCodeAt(pos);
    if (ch === 44) {
      pos += 1;
      qv = value;
      qe = COMMA;
      return;
    }
    if (ch === 10) {
      pos += 1;
      line += 1;
      qv = value;
      qe = LINE_BREAK;
      return;
    }
    if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      qv = value;
      qe = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) pushErr('quote_junk');
    qv = junk.value;
    qe = junk.ended;
  }

  // Finishes a record's fields: the header, or a row padded or cut to the
  // first record's width. Returns false when the record is no record.
  function finishRecord(fields, lastQuoted) {
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) return false;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return true;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
    return true;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const ch = text.charCodeAt(pos);
      if (ch === 10) {
        pos += 1;
        line += 1;
      } else if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: one clean line, no quote and no stray CR in it.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= lineEnd) {
      const crlf = nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13;
      const lineStr = text.slice(pos, crlf ? lineEnd - 1 : lineEnd);
      if (lineStr.indexOf('\r') === -1) {
        const fields = lineStr.split(',');
        pos = nl === -1 ? len : nl + 1;
        if (nl !== -1) line += 1;
        finishRecord(fields, false);
        continue;
      }
    }

    // Slow path: the record holds a quote, a stray CR, or a quoted field
    // that spans lines; read it field by field.
    const fields = [];
    let ended;
    let lastQuoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        readQuoted();
        fields.push(qv);
        ended = qe;
        lastQuoted = true;
      } else {
        // Unquoted field, read with indexOf jumps (inlined: no call, no
        // span object, per field).
        const c = text.indexOf(',', pos);
        const n = text.indexOf('\n', pos);
        let end = len;
        ended = END;
        if (c !== -1 && (n === -1 || c < n)) {
          end = c;
          ended = COMMA;
        } else if (n !== -1) {
          end = n;
          ended = LINE_BREAK;
        }
        let fend = end;
        if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) fend = end - 1;
        let value = text.slice(pos, fend);
        if (value.indexOf('\r') !== -1) {
          // Every CR in the span is stray: drop it, one error each.
          const parts = value.split('\r');
          for (let i = 1; i < parts.length; i++) pushErr('stray_cr');
          value = parts.join('');
        }
        fields.push(value);
        if (ended === COMMA) {
          pos = end + 1;
        } else if (ended === LINE_BREAK) {
          pos = end + 1;
          line += 1;
        } else {
          pos = len;
        }
        lastQuoted = false;
      }
    } while (ended === COMMA);

    finishRecord(fields, lastQuoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
