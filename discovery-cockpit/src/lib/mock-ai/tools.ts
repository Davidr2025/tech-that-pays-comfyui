export interface ToolDef {
  name: string;
  /** Matches a mention of the tool in free text. */
  pattern: RegExp;
  /** What the tool is for, phrased for a client-facing document. */
  purpose: string;
}

const t = (name: string, pattern: RegExp, purpose: string): ToolDef => ({ name, pattern, purpose });

export const TOOL_CATALOG: ToolDef[] = [
  t("QuickBooks", /\bquick\s?books?\b/i, "Accounting and invoicing"),
  t("Xero", /\bxero\b/i, "Accounting and invoicing"),
  t("FreshBooks", /\bfresh\s?books\b/i, "Accounting and invoicing"),
  t("Wave", /\bwave (accounting|invoic\w*)\b/i, "Accounting and invoicing"),
  t("Mailchimp", /\bmail\s?chimp\b/i, "Email marketing"),
  t("Constant Contact", /\bconstant contact\b/i, "Email marketing"),
  t("Klaviyo", /\bklaviyo\b/i, "Email and SMS marketing"),
  t("HubSpot", /\bhub\s?spot\b/i, "CRM and marketing"),
  t("Salesforce", /\bsales\s?force\b/i, "CRM"),
  t("Pipedrive", /\bpipedrive\b/i, "CRM and sales pipeline"),
  t("Zoho", /\bzoho\b/i, "Business software suite"),
  t("Calendly", /\bcalendly\b/i, "Appointment scheduling"),
  t("Acuity", /\bacuity\b/i, "Appointment scheduling"),
  t("Slack", /\bslack\b/i, "Team messaging"),
  t("Zoom", /\bzoom\b/i, "Video meetings"),
  t("Google Sheets", /\bgoogle sheets?\b/i, "Spreadsheet tracking"),
  t("Excel", /\bexcel\b/i, "Spreadsheet tracking"),
  t("Airtable", /\bairtable\b/i, "Database and tracking"),
  t("Notion", /\bnotion\b/i, "Documents and notes"),
  t("Trello", /\btrello\b/i, "Task tracking"),
  t("Asana", /\basana\b/i, "Project and task tracking"),
  t("Monday.com", /\bmonday\.com\b/i, "Project and task tracking"),
  t("ClickUp", /\bclick\s?up\b/i, "Project and task tracking"),
  t("Zapier", /\bzapier\b/i, "Workflow automation"),
  t("Shopify", /\bshopify\b/i, "E-commerce"),
  t("Squarespace", /\bsquarespace\b/i, "Website"),
  t("Wix", /\bwix\b/i, "Website"),
  t("WordPress", /\bword\s?press\b/i, "Website"),
  t("Stripe", /\bstripe\b/i, "Payment processing"),
  t("PayPal", /\bpaypal\b/i, "Payment processing"),
  t("DocuSign", /\bdocu\s?sign\b/i, "E-signature"),
  t("Dropbox", /\bdropbox\b/i, "File storage"),
  t("Google Workspace", /\bgoogle workspace\b|\bg suite\b/i, "Email and office suite"),
  t("Microsoft 365", /\b(microsoft|office) 365\b|\bm365\b/i, "Email and office suite"),
  t("Gusto", /\bgusto\b/i, "Payroll"),
  t("Jobber", /\bjobber\b/i, "Field service management"),
  t("ServiceTitan", /\bservice\s?titan\b/i, "Field service management"),
  t("Housecall Pro", /\bhousecall\s?pro\b/i, "Field service management"),
  t("Canva", /\bcanva\b/i, "Design"),
];
