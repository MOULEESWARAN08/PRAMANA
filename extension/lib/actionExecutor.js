export async function executeAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXECUTE_ACTION",
      action,
    });
    return response;
  } catch (err) {
    throw new Error(`Action failed: ${err.message}`);
  }
}
