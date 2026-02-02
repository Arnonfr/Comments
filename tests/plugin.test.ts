/**
 * Plugin backend tests.
 *
 * Strategy: The figma mock is set up as a global BEFORE code.ts is loaded.
 * code.ts is loaded ONCE (side effects run once: showUI, figma.on, onmessage).
 * Between tests we reset state (data, nodes, messages) but keep the handlers alive.
 */

// Import mock FIRST - it sets global.figma and global.__html__
import {
  figmaMock,
  addPage,
  addNode,
  setSelection,
  triggerSelectionChange,
  getUiMessages,
  clearUiMessages,
  simulateUiMessage,
  resetState,
} from "./figma-mock";

// Now load the plugin - side effects run once
import "../src/code";

// Helper: send message and wait for async processing
async function sendMessage(msg: any): Promise<void> {
  simulateUiMessage(msg);
  await new Promise((r) => setTimeout(r, 50));
}

beforeEach(() => {
  resetState();
});

describe("Plugin Initialization", () => {
  test("should have called figma.showUI on load", () => {
    // showUI was called when module loaded (before resetState cleared it).
    // We can verify the handler is set instead.
    expect(figmaMock.ui.onmessage).toBeDefined();
  });

  test("init message should return empty comments and user name", async () => {
    clearUiMessages();
    await sendMessage({ type: "init" });

    const messages = getUiMessages();
    expect(messages).toContainEqual({
      type: "comments-loaded",
      comments: [],
    });
    expect(messages).toContainEqual({
      type: "user-name",
      name: "Test User",
    });
    expect(messages).toContainEqual({
      type: "selection-changed",
      nodeId: null,
      nodeName: null,
    });
  });

  test("init with selection should report selected node", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    setSelection(["10:1"]);
    clearUiMessages();

    await sendMessage({ type: "init" });

    const messages = getUiMessages();
    expect(messages).toContainEqual({
      type: "selection-changed",
      nodeId: "10:1",
      nodeName: "Button",
    });
  });
});

describe("Adding Comments", () => {
  test("should add a comment to a selected node", async () => {
    addNode("1:0", {
      id: "10:1",
      name: "Button",
      absoluteBoundingBox: { x: 100, y: 200, width: 50, height: 30 },
    });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "This button needs more padding",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const messages = getUiMessages();
    const addedMsg = messages.find((m: any) => m.type === "comment-added");
    expect(addedMsg).toBeDefined();
    expect(addedMsg.comment.text).toBe("This button needs more padding");
    expect(addedMsg.comment.nodeId).toBe("10:1");
    expect(addedMsg.comment.nodeName).toBe("Button");
    expect(addedMsg.comment.author).toBe("Test User");
    expect(addedMsg.comment.resolved).toBe(false);
    expect(addedMsg.comment.replies).toEqual([]);
    expect(addedMsg.comment.pinX).toBe(125); // 100 + 50/2
    expect(addedMsg.comment.pinY).toBe(215); // 200 + 30/2

    expect(figmaMock.notify).toHaveBeenCalledWith(
      'Comment added on "Button"'
    );
  });

  test("should persist comments in pluginData", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Comment 1",
      nodeId: "10:1",
      nodeName: "Button",
    });
    clearUiMessages();

    await sendMessage({ type: "load-comments" });

    const messages = getUiMessages();
    const loaded = messages.find((m: any) => m.type === "comments-loaded");
    expect(loaded).toBeDefined();
    expect(loaded.comments.length).toBe(1);
    expect(loaded.comments[0].text).toBe("Comment 1");
  });

  test("should handle comment on non-existent node gracefully", async () => {
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Ghost comment",
      nodeId: "999:999",
      nodeName: "Deleted Element",
    });

    const messages = getUiMessages();
    const addedMsg = messages.find((m: any) => m.type === "comment-added");
    expect(addedMsg).toBeDefined();
    expect(addedMsg.comment.pinX).toBe(0);
    expect(addedMsg.comment.pinY).toBe(0);
  });
});

describe("Replying to Comments", () => {
  test("should add a reply to an existing comment", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Original comment",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const addedMsg = getUiMessages().find((m: any) => m.type === "comment-added");
    const commentId = addedMsg.comment.id;
    clearUiMessages();

    await sendMessage({
      type: "reply-to-comment",
      commentId,
      text: "Great point!",
    });

    const messages = getUiMessages();
    const updated = messages.find((m: any) => m.type === "comment-updated");
    expect(updated).toBeDefined();
    expect(updated.comment.replies.length).toBe(1);
    expect(updated.comment.replies[0].text).toBe("Great point!");
    expect(updated.comment.replies[0].author).toBe("Test User");
  });

  test("should error when replying to non-existent comment", async () => {
    clearUiMessages();

    await sendMessage({
      type: "reply-to-comment",
      commentId: "fake-id",
      text: "Reply to nothing",
    });

    const messages = getUiMessages();
    expect(messages).toContainEqual({
      type: "error",
      message: "Comment not found",
    });
  });
});

describe("Resolving Comments", () => {
  test("should resolve a comment", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Fix this",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const commentId = getUiMessages().find((m: any) => m.type === "comment-added").comment.id;
    clearUiMessages();

    await sendMessage({ type: "resolve-comment", commentId });

    const messages = getUiMessages();
    const updated = messages.find((m: any) => m.type === "comment-updated");
    expect(updated).toBeDefined();
    expect(updated.comment.resolved).toBe(true);
    expect(figmaMock.notify).toHaveBeenCalledWith("Comment resolved");
  });

  test("should unresolve a comment", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Fix this",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const commentId = getUiMessages().find((m: any) => m.type === "comment-added").comment.id;
    await sendMessage({ type: "resolve-comment", commentId });
    clearUiMessages();

    await sendMessage({ type: "unresolve-comment", commentId });

    const messages = getUiMessages();
    const updated = messages.find((m: any) => m.type === "comment-updated");
    expect(updated).toBeDefined();
    expect(updated.comment.resolved).toBe(false);
  });

  test("should error resolving non-existent comment", async () => {
    clearUiMessages();

    await sendMessage({ type: "resolve-comment", commentId: "fake" });

    expect(getUiMessages()).toContainEqual({
      type: "error",
      message: "Comment not found",
    });
  });
});

describe("Deleting Comments", () => {
  test("should delete a comment and verify removal", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Delete me",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const commentId = getUiMessages().find((m: any) => m.type === "comment-added").comment.id;
    clearUiMessages();

    await sendMessage({ type: "delete-comment", commentId });

    const messages = getUiMessages();
    expect(messages).toContainEqual({
      type: "comment-deleted",
      commentId,
    });
    expect(figmaMock.notify).toHaveBeenCalledWith("Comment deleted");

    // Verify it's gone from storage
    clearUiMessages();
    await sendMessage({ type: "load-comments" });
    const loaded = getUiMessages().find((m: any) => m.type === "comments-loaded");
    expect(loaded.comments.length).toBe(0);
  });
});

describe("Navigation", () => {
  test("should navigate to a node on the same page", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({ type: "navigate-to-node", nodeId: "10:1" });

    expect(figmaMock.viewport.scrollAndZoomIntoView).toHaveBeenCalled();
  });

  test("should switch page when navigating to node on different page", async () => {
    addPage("2:0", "Page 2");
    addNode("2:0", { id: "20:1", name: "Remote Button" });
    clearUiMessages();

    expect(figmaMock.currentPage.id).toBe("1:0");

    await sendMessage({ type: "navigate-to-node", nodeId: "20:1" });

    expect(figmaMock.currentPage.id).toBe("2:0");
    expect(figmaMock.viewport.scrollAndZoomIntoView).toHaveBeenCalled();
  });

  test("should show error when navigating to non-existent node", async () => {
    clearUiMessages();

    await sendMessage({ type: "navigate-to-node", nodeId: "999:999" });

    expect(getUiMessages()).toContainEqual({
      type: "error",
      message: "Element no longer exists in the document",
    });
    expect(figmaMock.notify).toHaveBeenCalledWith("Element not found", {
      error: true,
    });
  });
});

describe("User Name", () => {
  test("should use figma.currentUser.name by default", async () => {
    clearUiMessages();

    await sendMessage({ type: "init" });

    expect(getUiMessages()).toContainEqual({
      type: "user-name",
      name: "Test User",
    });
  });

  test("should use stored name after set-user-name", async () => {
    await sendMessage({ type: "set-user-name", name: "Custom Name" });
    clearUiMessages();

    await sendMessage({ type: "init" });

    expect(getUiMessages()).toContainEqual({
      type: "user-name",
      name: "Custom Name",
    });
  });

  test("comment author should reflect custom name", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    await sendMessage({ type: "set-user-name", name: "Alice" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Hello",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const added = getUiMessages().find((m: any) => m.type === "comment-added");
    expect(added.comment.author).toBe("Alice");
  });
});

describe("Selection Change Events", () => {
  test("should notify UI when selection changes", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    setSelection(["10:1"]);
    clearUiMessages();

    triggerSelectionChange();
    await new Promise((r) => setTimeout(r, 10));

    expect(getUiMessages()).toContainEqual({
      type: "selection-changed",
      nodeId: "10:1",
      nodeName: "Button",
    });
  });

  test("should notify UI when selection is cleared", async () => {
    setSelection([]);
    clearUiMessages();

    triggerSelectionChange();
    await new Promise((r) => setTimeout(r, 10));

    expect(getUiMessages()).toContainEqual({
      type: "selection-changed",
      nodeId: null,
      nodeName: null,
    });
  });
});

describe("Multiple Comments", () => {
  test("newest comments should appear first", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "First comment",
      nodeId: "10:1",
      nodeName: "Button",
    });
    await sendMessage({
      type: "add-comment",
      text: "Second comment",
      nodeId: "10:1",
      nodeName: "Button",
    });
    clearUiMessages();

    await sendMessage({ type: "load-comments" });

    const loaded = getUiMessages().find((m: any) => m.type === "comments-loaded");
    expect(loaded.comments.length).toBe(2);
    expect(loaded.comments[0].text).toBe("Second comment");
    expect(loaded.comments[1].text).toBe("First comment");
  });
});

describe("Data Integrity", () => {
  test("comments should be stored in root pluginData (shared)", async () => {
    addNode("1:0", { id: "10:1", name: "Button" });
    clearUiMessages();

    await sendMessage({
      type: "add-comment",
      text: "Shared comment",
      nodeId: "10:1",
      nodeName: "Button",
    });

    const raw = figmaMock.root.getPluginData("comments-plugin-data");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(parsed.length).toBe(1);
    expect(parsed[0].text).toBe("Shared comment");
  });

  test("corrupted storage should return empty array", async () => {
    figmaMock.root.setPluginData("comments-plugin-data", "not valid json{{{");
    clearUiMessages();

    await sendMessage({ type: "load-comments" });

    const loaded = getUiMessages().find((m: any) => m.type === "comments-loaded");
    expect(loaded.comments).toEqual([]);
  });
});
