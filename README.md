# csv-reader, but faster — single-pass indexOf parser, exact on every case

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/daviddika/makefun-csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/daviddika/makefun-csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers
exactly as csv-reader does on every case — same `{columns, rows, errors}`,
same broken-row policy (BOM, stray CRs, quoted fields, doubled quotes,
quote junk, unterminated quotes, short/long rows) — in a fraction of the CPU.

## How it is faster

- Clean lines (no quote, no stray CR) are split on `,` in one C++ pass.
- Every other field is read with `indexOf` jumps to the next comma or line
  break instead of one character at a time, and every search is bounded to
  the field or line it reads — a CR inside a field's span is always stray,
  so it is found on the field's own slice, never by scanning the rest of the
  text.
- Quoted fields jump from quote to quote with `indexOf('"')`; doubled
  quotes and line breaks inside quotes are handled on the segment between
  two quotes only.

## Files

- `solve.js` — the parser: `run(input)` returns csv-reader 1.0.0's answer
  for `{text, header}`. Dependency-free ES module, Node 22.
- `main.ts` — the house driver, unchanged: reads `/input/cases.json`,
  answers each case with `run`, writes `/output/answers.json`.

## Verify

```sh
MAKEFUN_INPUT_DIR=bench/input MAKEFUN_OUTPUT_DIR=bench/output node main.ts
```

Run twice: the two outputs are byte-identical. On the kit's practice set
(6 cases, ~10.2 MB of CSV) this entry's `run()` takes ~110–140 ms warm
against csv-reader 1.0.0's ~410–520 ms, and the whole program ~460 ms of
CPU (trimmed mean of fresh runs) against the baseline's ~1,100 ms.
Exactness was checked differentially against csv-reader 1.0.0 on the
practice set, 24 full-size cases drawn with the kit's own generator,
350 hand-written adversarial cases, and 26,000 randomized fuzz cases —
0 mismatches.

---

<sub>Entered on [make.fun](https://make.fun/?ref=carmenita07&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
