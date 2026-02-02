import { Comment, MessageToPlugin, MessageToUI } from "./types";

const STORAGE_KEY = "comments-plugin-data";
const USER_NAME_KEY = "comments-plugin-username";

figma.showUI(__html__, { width: 360, height: 520, themeColors: true });

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function loadComments(): Promise<Comment[]> {
  const data = await figma.clientStorage.getAsync(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as Comment[];
  } catch {
    return [];
  }
}

async function saveComments(comments: Comment[]): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY, JSON.stringify(comments));
}

async function getUserName(): Promise<string> {
  const name = await figma.clientStorage.getAsync(USER_NAME_KEY);
  return name || figma.currentPage.parent?.name || "User";
}

async function setUserName(name: string): Promise<void> {
  await figma.clientStorage.setAsync(USER_NAME_KEY, name);
}

function sendToUI(msg: MessageToUI): void {
  figma.ui.postMessage(msg);
}

function getNodeCenter(node: SceneNode): { x: number; y: number } {
  return {
    x: node.absoluteBoundingBox
      ? node.absoluteBoundingBox.x + node.absoluteBoundingBox.width / 2
      : 0,
    y: node.absoluteBoundingBox
      ? node.absoluteBoundingBox.y + node.absoluteBoundingBox.height / 2
      : 0,
  };
}

async function handleMessage(msg: MessageToPlugin): Promise<void> {
  switch (msg.type) {
    case "init": {
      const comments = await loadComments();
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
      const comments = await loadComments();
      sendToUI({ type: "comments-loaded", comments });
      break;
    }

    case "set-user-name": {
      await setUserName(msg.name);
      break;
    }

    case "add-comment": {
      const comments = await loadComments();
      const node = figma.getNodeById(msg.nodeId) as SceneNode | null;
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
      await saveComments(comments);
      sendToUI({ type: "comment-added", comment: newComment });
      figma.notify(`Comment added on "${msg.nodeName}"`);
      break;
    }

    case "reply-to-comment": {
      const comments = await loadComments();
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

      await saveComments(comments);
      sendToUI({ type: "comment-updated", comment });
      break;
    }

    case "resolve-comment": {
      const comments = await loadComments();
      const comment = comments.find((c) => c.id === msg.commentId);
      if (!comment) {
        sendToUI({ type: "error", message: "Comment not found" });
        return;
      }

      comment.resolved = true;
      await saveComments(comments);
      sendToUI({ type: "comment-updated", comment });
      figma.notify("Comment resolved");
      break;
    }

    case "unresolve-comment": {
      const comments = await loadComments();
      const comment = comments.find((c) => c.id === msg.commentId);
      if (!comment) {
        sendToUI({ type: "error", message: "Comment not found" });
        return;
      }

      comment.resolved = false;
      await saveComments(comments);
      sendToUI({ type: "comment-updated", comment });
      break;
    }

    case "delete-comment": {
      let comments = await loadComments();
      comments = comments.filter((c) => c.id !== msg.commentId);
      await saveComments(comments);
      sendToUI({ type: "comment-deleted", commentId: msg.commentId });
      figma.notify("Comment deleted");
      break;
    }

    case "navigate-to-node": {
      const node = figma.getNodeById(msg.nodeId) as SceneNode | null;
      if (node) {
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
