export const PII_PATTERNS = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "phone", regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { name: "credit_card", regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { name: "aadhaar", regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
  { name: "api_key", regex: /(?:sk-|pk_|ghp_)[A-Za-z0-9_-]{20,}/g },
];