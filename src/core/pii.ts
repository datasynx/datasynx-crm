/**
 * Lightweight PII masking for LLM calls (Einstein-Trust-Layer-style).
 * Replaces emails and phone numbers with stable placeholders before text is
 * sent to an LLM, and can restore them in the response. Opt-in via
 * DXCRM_PII_MASKING=on so default behaviour and quality are unchanged.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone: optional +, then 7+ digits possibly grouped by spaces/dashes/parens.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

export interface MaskedText {
  masked: string;
  unmask: (text: string) => string;
}

export function piiMaskingEnabled(): boolean {
  return process.env["DXCRM_PII_MASKING"] === "on";
}

export function maskPii(input: string): MaskedText {
  const mapping = new Map<string, string>(); // original -> placeholder
  let emailCount = 0;
  let phoneCount = 0;

  let masked = input.replace(EMAIL_RE, (match) => {
    let ph = mapping.get(match);
    if (!ph) {
      ph = `[EMAIL_${emailCount++}]`;
      mapping.set(match, ph);
    }
    return ph;
  });

  masked = masked.replace(PHONE_RE, (match) => {
    // Ignore very short numeric runs that slipped through (already handled by {6,}).
    let ph = mapping.get(match);
    if (!ph) {
      ph = `[PHONE_${phoneCount++}]`;
      mapping.set(match, ph);
    }
    return ph;
  });

  const reverse = new Map<string, string>(); // placeholder -> original
  for (const [orig, ph] of mapping) reverse.set(ph, orig);

  const unmask = (text: string): string => {
    let out = text;
    for (const [ph, orig] of reverse) out = out.split(ph).join(orig);
    return out;
  };

  return { masked, unmask };
}
