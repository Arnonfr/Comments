import { Comment, MessageToUI, MessageToPlugin } from "./types";

// State
let comments: Comment[] = [];
let currentFilter: "open" | "resolved" | "all" = "open";
let selectedNodeId: string | null = null;
let selectedNodeName: string | null = null;
let userName = "User";
let replyingTo: string | null = null;

// DOM refs
const commentInput = document.getElementById("comment-input") as HTMLTextAreaElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const commentsList = document.getElementById("comments-list") as HTMLDivElement;
const emptyState = document.getElementById("empty-state") as HTMLDivElement;
const selectionDot = document.getElementById("selection-dot") as HTMLDivElement;
const selectionText = document.getElementById("selection-text") as HTMLSpanElement;
const commentCount = document.getElementById("comment-count") as HTMLSpanElement;
const settingsPanel = document.getElementById("settings-panel") as HTMLDivElement;
const settingsToggle = document.getElementById("settings-toggle") as HTMLButtonElement;
const userNameInput = document.getElementById("user-name-input") as HTMLInputElement;

// Send message to plugin
function sendToPlugin(msg: MessageToPlugin): void {
  parent.postMessage({ pluginMessage: msg }, "*");
}

// Format timestamp
function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Get filtered comments
function getFilteredComments(): Comment[] {
  switch (currentFilter) {
    case "open":
      return comments.filter((c) => !c.resolved);
    case "resolved":
      return comments.filter((c) => c.resolved);
    case "all":
      return comments;
  }
}

// Render the comments list
function render(): void {
  const filtered = getFilteredComments();
  commentCount.textContent = String(filtered.length);

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    // Clear existing comment cards but keep empty state
    const cards = commentsList.querySelectorAll(".comment-card");
    cards.forEach((c) => c.remove());
    return;
  }

  emptyState.style.display = "none";

  // Build HTML
  let html = "";
  for (const c of filtered) {
    const resolvedClass = c.resolved ? " resolved" : "";
    const resolvedBadge = c.resolved
      ? `<span class="resolved-badge">Resolved</span>`
      : "";

    let repliesHtml = "";
    if (c.replies.length > 0) {
      repliesHtml = `<div class="replies">`;
      for (const r of c.replies) {
        repliesHtml += `
          <div class="reply">
            <span class="reply-author">${escapeHtml(r.author)}</span>
            <span class="reply-time">${formatTime(r.timestamp)}</span>
            <div class="reply-text">${escapeHtml(r.text)}</div>
          </div>`;
      }
      repliesHtml += `</div>`;
    }

    const replyInput =
      replyingTo === c.id
        ? `<div class="reply-input-row">
            <input class="reply-input" id="reply-input-${c.id}" placeholder="Write a reply..." autofocus />
            <button class="reply-submit" data-reply-submit="${c.id}">Reply</button>
          </div>`
        : "";

    const resolveLabel = c.resolved ? "Reopen" : "Resolve";
    const resolveAction = c.resolved ? "unresolve" : "resolve";

    html += `
      <div class="comment-card${resolvedClass}" data-comment-id="${c.id}">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.author)}</span>
          <div class="comment-meta">
            <span class="comment-time">${formatTime(c.timestamp)}</span>
            ${resolvedBadge}
          </div>
        </div>
        <div class="comment-node" data-navigate="${c.nodeId}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          ${escapeHtml(c.nodeName)}
        </div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
        ${repliesHtml}
        ${replyInput}
        <div class="comment-actions">
          <button class="action-btn" data-action="reply" data-id="${c.id}">Reply</button>
          <button class="action-btn" data-action="${resolveAction}" data-id="${c.id}">${resolveLabel}</button>
          <button class="action-btn danger" data-action="delete" data-id="${c.id}">Delete</button>
        </div>
      </div>`;
  }

  // Keep empty state element, replace card content
  const cards = commentsList.querySelectorAll(".comment-card");
  cards.forEach((c) => c.remove());
  commentsList.insertAdjacentHTML("beforeend", html);

  // Focus reply input if open
  if (replyingTo) {
    const replyInputEl = document.getElementById(
      `reply-input-${replyingTo}`
    ) as HTMLInputElement | null;
    if (replyInputEl) {
      replyInputEl.focus();
      replyInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submitReply(replyingTo!);
        }
        if (e.key === "Escape") {
          replyingTo = null;
          render();
        }
      });
    }
  }
}

function submitReply(commentId: string): void {
  const input = document.getElementById(
    `reply-input-${commentId}`
  ) as HTMLInputElement | null;
  if (!input || !input.value.trim()) return;

  sendToPlugin({
    type: "reply-to-comment",
    commentId,
    text: input.value.trim(),
  });
  replyingTo = null;
}

// Update selection UI
function updateSelection(nodeId: string | null, nodeName: string | null): void {
  selectedNodeId = nodeId;
  selectedNodeName = nodeName;

  if (nodeId && nodeName) {
    selectionDot.classList.add("active");
    selectionText.innerHTML = `Selected: <strong>${escapeHtml(nodeName)}</strong>`;
    commentInput.disabled = false;
    commentInput.placeholder = `Comment on "${nodeName}"...`;
    updateSubmitState();
  } else {
    selectionDot.classList.remove("active");
    selectionText.textContent = "No element selected";
    commentInput.disabled = true;
    commentInput.placeholder = "Select an element to add a comment...";
    submitBtn.disabled = true;
  }
}

function updateSubmitState(): void {
  submitBtn.disabled = !selectedNodeId || !commentInput.value.trim();
}

// Event: Submit comment
submitBtn.addEventListener("click", () => {
  const text = commentInput.value.trim();
  if (!text || !selectedNodeId || !selectedNodeName) return;

  sendToPlugin({
    type: "add-comment",
    text,
    nodeId: selectedNodeId,
    nodeName: selectedNodeName,
  });

  commentInput.value = "";
  updateSubmitState();
});

// Event: Enter to submit
commentInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitBtn.click();
  }
});

commentInput.addEventListener("input", updateSubmitState);

// Auto-resize textarea
commentInput.addEventListener("input", () => {
  commentInput.style.height = "auto";
  commentInput.style.height = Math.min(commentInput.scrollHeight, 80) + "px";
});

// Event: Filter buttons
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = (btn as HTMLElement).dataset.filter as typeof currentFilter;
    render();
  });
});

// Event: Settings toggle
settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("visible");
  if (settingsPanel.classList.contains("visible")) {
    userNameInput.value = userName;
    userNameInput.focus();
  }
});

// Event: User name change
userNameInput.addEventListener("change", () => {
  const name = userNameInput.value.trim();
  if (name) {
    userName = name;
    sendToPlugin({ type: "set-user-name", name });
  }
});

userNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    userNameInput.blur();
    settingsPanel.classList.remove("visible");
  }
});

// Event delegation for comment actions
commentsList.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  // Navigate to node
  const navEl = target.closest("[data-navigate]") as HTMLElement | null;
  if (navEl) {
    sendToPlugin({ type: "navigate-to-node", nodeId: navEl.dataset.navigate! });
    return;
  }

  // Reply submit button
  const replySubmitEl = target.closest("[data-reply-submit]") as HTMLElement | null;
  if (replySubmitEl) {
    submitReply(replySubmitEl.dataset.replySubmit!);
    return;
  }

  // Action buttons
  const actionEl = target.closest("[data-action]") as HTMLElement | null;
  if (!actionEl) return;

  const action = actionEl.dataset.action!;
  const id = actionEl.dataset.id!;

  switch (action) {
    case "reply":
      replyingTo = replyingTo === id ? null : id;
      render();
      break;
    case "resolve":
      sendToPlugin({ type: "resolve-comment", commentId: id });
      break;
    case "unresolve":
      sendToPlugin({ type: "unresolve-comment", commentId: id });
      break;
    case "delete":
      sendToPlugin({ type: "delete-comment", commentId: id });
      break;
  }
});

// Handle messages from plugin
window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as MessageToUI;
  if (!msg) return;

  switch (msg.type) {
    case "comments-loaded":
      comments = msg.comments;
      render();
      break;

    case "selection-changed":
      updateSelection(msg.nodeId, msg.nodeName);
      break;

    case "comment-added":
      comments.unshift(msg.comment);
      render();
      break;

    case "comment-updated": {
      const idx = comments.findIndex((c) => c.id === msg.comment.id);
      if (idx !== -1) comments[idx] = msg.comment;
      render();
      break;
    }

    case "comment-deleted":
      comments = comments.filter((c) => c.id !== msg.commentId);
      render();
      break;

    case "user-name":
      userName = msg.name;
      userNameInput.value = msg.name;
      break;

    case "error":
      console.error("Plugin error:", msg.message);
      break;
  }
};

// Init
sendToPlugin({ type: "init" });
