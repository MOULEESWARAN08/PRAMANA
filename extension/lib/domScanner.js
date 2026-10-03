import { PII_PATTERNS } from "./piiPatterns.js";

export function detectSensitiveDOMRegions() {
  const regions = [];

  // Password fields — full blackout
  document.querySelectorAll("input[type='password']").forEach((el) => {
    regions.push({
      rect: el.getBoundingClientRect(),
      type: "password",
      severity: "critical",
    });
  });

  // Autocomplete sensitive fields
  const sensitiveAC = ["cc-number", "cc-csc", "email", "tel", 
    "given-name", "family-name", "street-address"];
  document.querySelectorAll("input[autocomplete]").forEach((el) => {
    if (sensitiveAC.includes(el.getAttribute("autocomplete"))) {
      regions.push({
        rect: el.getBoundingClientRect(),
        type: el.getAttribute("autocomplete"),
        severity: "high",
      });
    }
  });

  // Text node regex matching
  const walker = document.createTreeWalker(document.body, 
    NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    for (const p of PII_PATTERNS) {
      if (p.regex.test(node.textContent)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        regions.push({
          rect: range.getBoundingClientRect(),
          type: p.name,
          severity: "high",
        });
      }
    }
  }
  return regions;
}