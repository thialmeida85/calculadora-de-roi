const SHEET_NAME = "Leads";

const HEADERS = [
  "created_at",
  "source",
  "name",
  "email",
  "phone",
  "business_name",
  "segment",
  "revenue_model",
  "total_investment",
  "break_even_customers",
  "required_leads",
  "max_media_cpl",
  "probable_customers",
  "probable_roi_pct",
  "analysis_source",
  "summary",
  "verdict",
  "raw_json",
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const payload = parsePayload_(e);
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    sheet.appendRow(toRow_(payload));

    return jsonResponse_({
      ok: true,
      saved: true,
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "calculadora_roi_verticale_sheets_webhook",
  });
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Body vazio.");
  }
  return JSON.parse(e.postData.contents);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
}

function toRow_(payload) {
  const contact = payload.contact || {};
  const calculation = payload.calculation || {};
  const input = calculation.input || {};
  const metrics = calculation.metrics || {};
  const scenarios = calculation.scenarios || [];
  const probable = scenarios.length >= 2 ? scenarios[1] : null;
  const analysis = payload.analysis || {};

  return [
    new Date(),
    payload.source || "",
    contact.name || "",
    contact.email || "",
    contact.phone || "",
    input.business_name || "",
    input.segment || "",
    input.revenue_model || "",
    metrics.total_investment || "",
    metrics.break_even_customers || "",
    metrics.required_leads || "",
    metrics.max_media_cpl || "",
    probable ? probable.customers : "",
    probable ? probable.roi_pct : "",
    analysis.source || "",
    analysis.summary || "",
    analysis.verdict || "",
    JSON.stringify(payload),
  ];
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
