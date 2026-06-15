(function () {
  const vscode = acquireVsCodeApi();
  const contentEl = document.getElementById("content");

  // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation
  window.addEventListener("message", (event) => {
    const m = event.data;
    if (m?.type !== "state") return;
    contentEl.innerHTML = m.html ?? "";
  });

  contentEl.addEventListener("click", (event) => {
    const anchor = event.target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    vscode.postMessage({ type: "openLink", href });
  });

  vscode.postMessage({ type: "ready" });
})();
