import { Comment, MessageToPlugin, MessageToUI } from "./types";

const STORAGE_KEY = "comments-plugin-data";
const USER_NAME_KEY = "comments-plugin-username";

figma.showUI(__html__, { width: 360, height: 520, themeColors: true });

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

function loadComments(): Comment[] {
  const data = figma.root.getPluginData(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as Comment[];
  } catch {
    return [];
  }
}

function saveComments(comments: Comment[]): void {
  figma.root.setPluginData(STORAGE_KEY, JSON.stringify(comments));
}

async function getUserName(): Promise<string> {
  const stored = await figma.clientStorage.getAsync(USER_NAME_KEY);
  if (stored) return stored;
  return figma.currentUser?.name || "User";
}

async function setUserName(name: string): Promise<void> {
  await figma.clientStorage.setAsync(USER_NAME_KEY, name);
}

function sendToUI(msg: MessageToUI): void {
  figma.ui.postMessage(msg);
}

function getNodeCenter(node: SceneNode): { x: number; y: number } {
  const box = node.absoluteBoundingBox;
  if (!box) return { x: 0, y: 0 };
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function findNodeAcrossPages(nodeId: string): SceneNode | null {
  // getNodeById searches all pages
  const node = figma.getNodeById(nodeId);
  if (!node) return null;
  // Ensure it's a SceneNode (not DocumentNode or PageNode used as target)
  if ("absoluteBoundingBox" in node || "x" in node) {
    return node as SceneNode;
  }
  return null;
}

function getNodePage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === "PAGE") return current as PageNode;
    current = current.parent;
  }
  return null;
}

async function handleMessage(msg: MessageToPlugin): Promise<void> {
  switch (msg.type) {
    case "init": {
      const comments = loadComments();
      sendToUI({ type: "comments-loaded", comments });
      const userName = await getUserName();
      sendToUI({ type: "user-name", name: userName });

      const sel = figma.currentPage.selection;
      if (sel.length > 0) {
        sendToUI({
          type: "selection-changed",
          nodeId: sel[0].id,
          nodeName: sel[0].name,
        });
      } else {
        sendToUI({ type: "selection-changed", nodeId: null, nodeName: null });
      }
      break;
    }

    case "load-comments": {
      const comments = loadComments();
      sendToUI({ type: "comments-loaded", comments });
      break;
    }

    case "set-user-name": {
      await setUserName(msg.name);
      break;
    }

    case "add-comment": {
      const comments = loadComments();
      const node = findNodeAcrossPages(msg.nodeId);
      const pos = node ? getNodeCenter(node) : { x: 0, y: 0 };

      const newComment: Comment = {
        id: generateId(),
        nodeId: msg.nodeId,
        nodeName: msg.nodeName,
        author: await getUserName(),
        text: msg.text,
        timestamp: Date.now(),
        resolved: false,
        replies: [],
        pinX: pos.x,
        pinY: pos.y,
      };

      comments.unshift(newComment);
      saveComments(comments);
      sendToUI({ type: "comment-added", comment: newComment });
      figma.notify(`Comment added on "${msg.nodeName}"`);
      break;
    }

    case "reply-to-comment": {
      const comments = loadComments();
      const comment = comments.find((c) => c.id === msg.commentId);
      if (!comment) {
        sendToUI({ type: "error", message: "Comment not found" });
        return;
      }

      comment.replies.push({
        id: generateId(),
        author: await getUserName(),
        text: msg.text,
        timestamp: Date.now(),
      });

      saveComments(comments);
      sendToUI({ type: "comment-updated", comment });
      break;
    }

    case "resolve-comment": {
      const comments = loadComments();
      const comment = comments.find((c) => c.id === msg.commentId);
      if (!comment) {
        sendToUI({ type: "error", message: "Comment not found" });
        return;
      }

      comment.resolved = true;
      saveComments(comments);
      sendToUI({ type: "comment-updated", comment });
      figma.notify("Comment resolved");
      break;
    }

    case "unresolve-comment": {
      const comments = loadComments();
      const comment = comments.find((c) => c.id === msg.commentId);
      if (!comment) {
        sendToUI({ type: "error", message: "Comment not found" });
        return;
      }

      comment.resolved = false;
      saveComments(comments);
      sendToUI({ type: "comment-updated", comment });
      break;
    }

    case "delete-comment": {
      let comments = loadComments();
      comments = comments.filter((c) => c.id !== msg.commentId);
      saveComments(comments);
      sendToUI({ type: "comment-deleted", commentId: msg.commentId });
      figma.notify("Comment deleted");
      break;
    }

    case "navigate-to-node": {
      const node = findNodeAcrossPages(msg.nodeId);
      if (node) {
        // Switch page if needed
        const page = getNodePage(node);
        if (page && page !== figma.currentPage) {
          figma.currentPage = page;
        }
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      } else {
        sendToUI({
          type: "error",
          message: "Element no longer exists in the document",
        });
        figma.notify("Element not found", { error: true });
      }
      break;
    }
  }
}

figma.ui.onmessage = (msg: MessageToPlugin) => {
  handleMessage(msg).catch((err) => {
    console.error("Plugin error:", err);
    sendToUI({ type: "error", message: String(err) });
  });
};

figma.on("selectionchange", () => {
  const sel = figma.currentPage.selection;
  if (sel.length > 0) {
    sendToUI({
      type: "selection-changed",
      nodeId: sel[0].id,
      nodeName: sel[0].name,
    });
  } else {
    sendToUI({ type: "selection-changed", nodeId: null, nodeName: null });
  }
});
