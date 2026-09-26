import { toCsv } from "./csv";
import { exportFilename } from "./filename";
import { toXlsx } from "./xlsx";
import {
  EXPORT_CONTENT_TYPE,
  type ExportFile,
  type ExportFormat,
  type ExportRenderOptions,
  type ExportSheet,
  type ExportWorkbookDefinition,
} from "./types";

/** The sheet a CSV carries: `csvSheet` when the adapter names one, otherwise the first --
 * a CSV is one table (§33). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a sheet of whichever row type the adapter used
export function primarySheet(workbook: ExportWorkbookDefinition): ExportSheet<any> {
  const named = workbook.csvSheet ? workbook.sheets.find((sheet) => sheet.sheetName === workbook.csvSheet) : undefined;
  return named ?? workbook.sheets[0] ?? { sheetName: "Data", columns: [], rows: [] };
}

/** EXP-PLAT-02/03 -- one dataset definition in, one file out, in either format. */
export async function renderExport(
  workbook: ExportWorkbookDefinition,
  format: ExportFormat,
  options: ExportRenderOptions,
): Promise<ExportFile> {
  const filename = exportFilename(workbook.module, workbook.resource, format, options.generatedAt, options.timeZone);
  const rowCount = primarySheet(workbook).rows.length;
  const body =
    format === "csv"
      ? new TextEncoder().encode(toCsv(primarySheet(workbook), options.timeZone))
      : await toXlsx(workbook, options);
  return { filename, contentType: EXPORT_CONTENT_TYPE[format], body, rowCount };
}
