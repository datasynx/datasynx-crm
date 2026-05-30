// Public type exports
export type { GlobalSources } from "./schemas/sources.js";
export type { MainFacts } from "./schemas/main-facts.js";
export type { InteractionEntry } from "./schemas/interaction.js";
export type { PipelineDeal } from "./schemas/pipeline.js";
export type { Ticket as TicketRecord, TicketStatus, TicketPriority } from "./schemas/ticket.js";
export type { Quote as QuoteRecord, QuoteLineItem } from "./schemas/quote.js";
export type { KbArticle } from "./schemas/kb-article.js";
export type { SurveyDefinition, SurveyResponse } from "./schemas/survey.js";

// Public runtime exports — programmatic API for embedding dxcrm in other tools
export { createCustomer } from "./commands/create.js";
export { runBackup } from "./commands/backup.js";
export { runAudit } from "./commands/audit.js";
export { runValidate } from "./commands/validate.js";
export { readMainFacts, customerExists } from "./fs/customer-dir.js";
export { readAuditLog, filterAuditLog } from "./fs/audit-log.js";
export { getRbacConfig, getRole, canSeeCustomer } from "./core/rbac.js";
export { getSession, setSession, clearSession } from "./core/session-store.js";
export { VERSION } from "./version.js";
