// Deliberately narrow text equivalent of the existing web/TG confirm action.
// A bare yes, quotation, correction or mixed instruction is not authorization.
export function isBriefConfirmation(message:string){return /^підтверджую бриф[.!]?$/iu.test(message.trim())}
