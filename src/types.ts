export interface Comment {
  id: string;
  nodeId: string;
  nodeName: string;
  author: string;
  text: string;
  timestamp: number;
  resolved: boolean;
  replies: Reply[];
  pinX: number;
  pinY: number;
}

export interface Reply {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export type MessageToUI =
  | { type: "comments-loaded"; comments: Comment[] }
  | { type: "selection-changed"; nodeId: string | null; nodeName: string | null }
  | { type: "comment-added"; comment: Comment }
  | { type: "comment-updated"; comment: Comment }
  | { type: "comment-deleted"; commentId: string }
  | { type: "error"; message: string }
  | { type: "user-name"; name: string };

export type MessageToPlugin =
  | { type: "add-comment"; text: string; nodeId: string; nodeName: string }
  | { type: "reply-to-comment"; commentId: string; text: string }
  | { type: "resolve-comment"; commentId: string }
  | { type: "unresolve-comment"; commentId: string }
  | { type: "delete-comment"; commentId: string }
  | { type: "navigate-to-node"; nodeId: string }
  | { type: "load-comments" }
  | { type: "set-user-name"; name: string }
  | { type: "init" };
