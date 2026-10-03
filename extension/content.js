// content.js — Injected into every page. Executes actions from background.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXECUTE_ACTION") {
    executeAction(msg.action)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_DOM_SNAPSHOT") {
    sendResponse({ snapshot: getDOMSnapshot() });
    return true;
  }

  if (msg.type === "GET_ELEMENT_AT_POINT") {
    const el = document.elementFromPoint(msg.x, msg.y);
    sendResponse({
      tag: el?.tagName,
      id: el?.id,
      className: el?.className,
      text: el?.textContent?.slice(0, 100),
    });
    return true;
  }
});

// ---------- Action Execution ----------
async function executeAction(action) {
  const { action: type, target, value } = action;

  switch (type) {
    case "click":
      return doClick(target);
    case "type":
      return doType(target, value);
    case "scroll":
      return doScroll(value);
    case "navigate":
      window.location.href = value;
      return { navigated: value };
    case "wait":
      await new Promise((r) => setTimeout(r, value || 1000));
      return { waited: value };
    case "done":
      return { done: true };
    default:
      throw new Error(`Unknown action: ${type}`);
  }
}

function findElement(target) {
  if (!target) return null;

  // Try CSS selector
  try {
    const el = document.querySelector(target);
    if (el) return el;
  } catch (_) {}

  // Try by visible text
  const all = document.querySelectorAll(
    "button, a, input, [role='button'], [role='link']"
  );
  for (const el of all) {
    const text = (el.textContent || el.value || el.placeholder || "").trim();
    if (text.toLowerCase().includes(target.toLowerCase())) return el;
  }

  // Try coordinates "x,y"
  if (typeof target === "string" && target.includes(",")) {
    const [x, y] = target.split(",").map(Number);
    return document.elementFromPoint(x, y);
  }

  return null;
}

function doClick(target) {
  const el = findElement(target);
  if (!el) throw new Error(`Element not found: ${target}`);

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus?.();

  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  for (const type of ["mousedown", "mouseup", "click"]) {
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      })
    );
  }
  return { clicked: target };
}

function doType(target, value) {
  const el = findElement(target);
  if (!el) throw new Error(`Element not found: ${target}`);

  el.focus();
  el.value = value;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));

  return { typed: target, length: value.length };
}

function doScroll(value) {
  window.scrollBy({ top: value || 500, behavior: "smooth" });
  return { scrolled: value };
}

// ---------- DOM Snapshot (for debugging / metadata) ----------
function getDOMSnapshot() {
  const nodes = [];
  const selectors = "button, a, input, textarea, select, [role='button']";
  document.querySelectorAll(selectors).forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    nodes.push({
      index: i,
      tag: el.tagName,
      type: el.type,
      id: el.id,
      name: el.name,
      text: (el.textContent || el.value || el.placeholder || "").trim().slice(0, 80),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    });
  });
  return nodes;
}

console.log("[Privacy Vision Agent] Content script loaded");