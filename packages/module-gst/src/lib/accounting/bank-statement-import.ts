import { importFingerprint } from "./bank-matching";

/**
 * Reading a bank statement CSV.
 *
 * Every bank exports a different shape and none of them ask what you'd like. This maps
 * the shapes that actually turn up — separate withdrawal/deposit columns, one signed
 * amount column, `dd/mm/yyyy` dates, amounts with Indian digit grouping — onto one row
 * type, and reports what it could not read rather than dropping it.
 *
 * Skipping a line silently is the one thing an importer must never do: a statement that
 * imports "successfully" with four lines missing produces a reconciliation that will not
 * balance, and nothing on screen to say why.
 */

export interface ParsedBankRow {
  txnDate: string;
  description: string;
  reference: string | null;
  /** Signed: positive is money in, negative is money out. */
  amount: number;
  balanceAfter: number | null;
  importFingerprint: string;
}

export interface ParseProblem {
  /** 1-based line number in the file, as a spreadsheet would show it. */
  line: number;
  reason: string;
  raw: string;
}

export interface ParseResult {
  rows: ParsedBankRow[];
  problems: ParseProblem[];
  /** The header the parser decided each field came from, so someone can check its
   * reading rather than trust it. */
  columns: Record<string, string | null>;
}

/** Header spellings seen across Indian bank exports, per field. Matched on a normalised
 * header, longest-first so "closing balance" wins over "balance". */
const HEADER_ALIASES: Record<string, string[]> = {
  date: ["transaction date", "txn date", "value date", "date", "tran date", "posting date"],
  description: ["narration", "description", "particulars", "transaction remarks", "details", "remarks"],
  reference: ["reference number", "cheque number", "chq no", "ref no", "reference", "utr", "cheque no"],
  debit: ["withdrawal amount", "withdrawal amt", "withdrawal", "debit amount", "debit", "dr"],
  credit: ["deposit amount", "deposit amt", "deposit", "credit amount", "credit", "cr"],
  amount: ["amount", "transaction amount"],
  balance: ["closing balance", "running balance", "balance amount", "balance"],
};

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Splits one CSV line, honouring quoted fields (a description with a comma in it is
 * extremely common and must not become two columns). */
export function splitCsvLine(input: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * Parses a date the way the file wrote it.
 *
 * `dd/mm/yyyy` is what Indian banks export and is the default reading for an ambiguous
 * date — `03/04/2026` is 3 April here, not 4 March. ISO is recognised by its own shape,
 * so a file that uses it is never misread.
 */
export function parseStatementDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parts = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (parts) {
    const day = Number(parts[1]);
    const month = Number(parts[2]);
    let year = Number(parts[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "17 Sep 2026" / "17-Sep-2026"
  const named = text.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-](\d{2,4})/);
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(named[2]!.slice(0, 3).toLowerCase()) + 1;
    if (month === 0) return null;
    let year = Number(named[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Parses an amount as a statement writes it: `1,23,456.78`, `1234.56 Cr`, `(500)` for a
 * negative, an empty cell for "this column doesn't apply to this row".
 *
 * Returns null for an empty cell and NaN for something that looked like a number and
 * wasn't — the two mean different things, and only the second is a problem.
 */
export function parseAmount(value: string): number | null {
  const text = value.trim();
  if (!text || text === "-") return null;

  const negativeByParens = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()]/g, "").replace(/[₹$,\s]/g, "");
  const suffix = cleaned.match(/(cr|dr)$/i)?.[1]?.toLowerCase();
  const numeric = Number(cleaned.replace(/(cr|dr)$/i, ""));
  if (!Number.isFinite(numeric)) return Number.NaN;

  const magnitude = Math.abs(numeric);
  if (suffix === "dr") return -magnitude;
  if (suffix === "cr") return magnitude;
  if (negativeByParens) return -magnitude;
  return numeric;
}

/** Whether `header` contains `alias` as a run of whole words.
 *
 * Whole words, not a substring: the short aliases banks use for the debit and credit
 * columns ("dr", "cr") appear inside ordinary header words -- "des-cr-iption" contains
 * "cr" -- so a substring test reads a plain `Date,Description,Amount` statement as having
 * a credit column and then fails to read a single amount off any row in it. */
function containsPhrase(header: string, alias: string): boolean {
  const words = header.split(" ");
  const phrase = alias.split(" ");
  for (let i = 0; i + phrase.length <= words.length; i += 1) {
    if (phrase.every((word, j) => words[i + j] === word)) return true;
  }
  return false;
}

function findColumn(headers: string[], field: string): number {
  const aliases = HEADER_ALIASES[field] ?? [];
  for (const alias of aliases) {
    const index = headers.findIndex((h) => h === alias);
    if (index !== -1) return index;
  }
  for (const alias of aliases) {
    const index = headers.findIndex((h) => containsPhrase(h, alias));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Reads a statement CSV into rows ready to import.
 *
 * The header row is found rather than assumed to be first: bank exports routinely open
 * with the account holder's name, the account number and a blank line before the actual
 * table starts.
 */
export function parseBankStatementCsv(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/);
  const problems: ParseProblem[] = [];

  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const candidate = splitCsvLine(lines[i] ?? "").map(normaliseHeader);
    if (findColumn(candidate, "date") !== -1 && candidate.some((h) => h)) {
      const hasMoney =
        findColumn(candidate, "debit") !== -1 ||
        findColumn(candidate, "credit") !== -1 ||
        findColumn(candidate, "amount") !== -1;
      if (hasMoney) {
        headerIndex = i;
        headers = candidate;
        break;
      }
    }
  }

  if (headerIndex === -1) {
    return {
      rows: [],
      problems: [
        {
          line: 1,
          reason:
            "Couldn't find a header row with a date column and an amount (or debit/credit) column. Export the statement as CSV and try again.",
          raw: lines[0] ?? "",
        },
      ],
      columns: {},
    };
  }

  const index = {
    date: findColumn(headers, "date"),
    description: findColumn(headers, "description"),
    reference: findColumn(headers, "reference"),
    debit: findColumn(headers, "debit"),
    credit: findColumn(headers, "credit"),
    amount: findColumn(headers, "amount"),
    balance: findColumn(headers, "balance"),
  };

  // "Amount" and "Debit"/"Credit" can both appear; the split pair is the more specific
  // reading, so it wins when the file has both.
  const useSplitColumns = index.debit !== -1 || index.credit !== -1;

  const rows: ParsedBankRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (!raw.trim()) continue;

    const fields = splitCsvLine(raw);
    const at = (position: number) => (position >= 0 ? (fields[position] ?? "") : "");

    const txnDate = parseStatementDate(at(index.date));
    if (!txnDate) {
      // A trailing "Statement generated on..." footer has no date in the date column and
      // is not worth reporting as an error; a row with other content is.
      if (fields.filter((f) => f).length > 1) {
        problems.push({ line: i + 1, reason: "Couldn't read the date on this row.", raw });
      }
      continue;
    }

    let amount: number | null;
    if (useSplitColumns) {
      const debit = parseAmount(at(index.debit));
      const credit = parseAmount(at(index.credit));
      if (Number.isNaN(debit) || Number.isNaN(credit)) {
        problems.push({ line: i + 1, reason: "Couldn't read the amount on this row.", raw });
        continue;
      }
      // Money out is negative whichever way the bank wrote it in its withdrawal column.
      amount = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : null;
    } else {
      amount = parseAmount(at(index.amount));
      if (Number.isNaN(amount)) {
        problems.push({ line: i + 1, reason: "Couldn't read the amount on this row.", raw });
        continue;
      }
    }

    if (amount === null || amount === 0) {
      problems.push({ line: i + 1, reason: "This row has no amount on it.", raw });
      continue;
    }

    const balanceRaw = parseAmount(at(index.balance));
    const row: Omit<ParsedBankRow, "importFingerprint"> = {
      txnDate,
      description: at(index.description) || "(no description)",
      reference: at(index.reference) || null,
      amount,
      balanceAfter: balanceRaw === null || Number.isNaN(balanceRaw) ? null : balanceRaw,
    };
    const fingerprint = importFingerprint(row);

    // Two identical rows within one file are the same transaction listed twice, and the
    // database's unique index would reject the second anyway -- saying so here is kinder
    // than a constraint error.
    if (seen.has(fingerprint)) {
      problems.push({ line: i + 1, reason: "Same as an earlier row in this file — skipped.", raw });
      continue;
    }
    seen.add(fingerprint);
    rows.push({ ...row, importFingerprint: fingerprint });
  }

  return {
    rows,
    problems,
    columns: Object.fromEntries(
      Object.entries(index).map(([field, position]) => [field, position >= 0 ? (headers[position] ?? null) : null]),
    ),
  };
}
