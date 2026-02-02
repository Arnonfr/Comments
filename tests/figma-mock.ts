/**
 * Comprehensive mock of the Figma Plugin API.
 * Uses module-level state so the mock persists across require() calls.
 * The plugin module (code.ts) uses `figma` as a global, so we set it once.
 */

export interface MockNode {
  id: string;
  name: string;
  type: string;
  parent: MockNode | null;
  absoluteBoundingBox: { x: number; y: number; width: number; height: number } | null;
  children?: MockNode[];
  [key: string]: any;
}

// ---- Module-level state ----
const pluginData: Record<string, string> = {};
const clientStorage: Record<string, any> = {};
const pages: MockNode[] = [];
const allNodes: Map<string, MockNode> = new Map();
let selection: MockNode[] = [];
const uiMessages: any[] = [];
const eventHandlers: Record<string, Function[]> = {};
let uiOnMessage: ((msg: any) => void) | null = null;
let _currentPage: any = null;

const documentNode: MockNode = {
  id: "0:0",
  name: "Document",
  type: "DOCUMENT",
  parent: null,
  absoluteBoundingBox: null,
  children: [],
};

function findNodeById(id: string): MockNode | null {
  return allNodes.get(id) || null;
}

// ---- The figma mock object (singleton) ----
export const figmaMock: any = {
  showUI: jest.fn(),

  root: {
    getPluginData: (key: string) => pluginData[key] || "",
    setPluginData: (key: string, value: string) => {
      pluginData[key] = value;
    },
  },

  clientStorage: {
    getAsync: jest.fn(async (key: string) => clientStorage[key] || undefined),
    setAsync: jest.fn(async (key: string, value: any) => {
      clientStorage[key] = value;
    }),
  },

  currentUser: { name: "Test User" },

  get currentPage() {
    return _currentPage;
  },
  set currentPage(page: any) {
    _currentPage = page;
  },

  getNodeById: jest.fn((id: string) => findNodeById(id)),

  viewport: {
    scrollAndZoomIntoView: jest.fn(),
  },

  ui: {
    postMessage: jest.fn((msg: any) => {
      uiMessages.push(JSON.parse(JSON.stringify(msg)));
    }),
    get onmessage() {
      return uiOnMessage;
    },
    set onmessage(handler: any) {
      uiOnMessage = handler;
    },
  },

  on: jest.fn((event: string, handler: Function) => {
    if (!eventHandlers[event]) eventHandlers[event] = [];
    eventHandlers[event].push(handler);
  }),

  notify: jest.fn(),
};

// Set globals immediately so require("../src/code") can find them
(global as any).figma = figmaMock;
(global as any).__html__ = "<html></html>";

// ---- Helper functions ----

export function addPage(id: string, name: string): MockNode {
  const page: MockNode = {
    id,
    name,
    type: "PAGE",
    parent: documentNode,
    absoluteBoundingBox: null,
    children: [],
  };
  // Add selection property
  Object.defineProperty(page, "selection", {
    get: () => selection,
    set: (val: any) => { selection = val; },
    configurable: true,
  });
  pages.push(page);
  allNodes.set(id, page);
  documentNode.children!.push(page);
  if (!_currentPage) _currentPage = page;
  return page;
}

export function addNode(
  pageId: string,
  nodeData: Partial<MockNode> & { id: string; name: string }
): MockNode {
  const page = allNodes.get(pageId);
  if (!page) throw new Error(`Page ${pageId} not found`);

  const node: MockNode = {
    type: "FRAME",
    parent: page,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    ...nodeData,
  };
  if (!page.children) page.children = [];
  page.children.push(node);
  allNodes.set(node.id, node);
  return node;
}

export function setSelection(nodeIds: string[]): void {
  selection = nodeIds
    .map((id) => findNodeById(id))
    .filter(Boolean) as MockNode[];
}

export function triggerSelectionChange(): void {
  if (eventHandlers["selectionchange"]) {
    eventHandlers["selectionchange"].forEach((h) => h());
  }
}

export function getUiMessages(): any[] {
  return [...uiMessages];
}

export function clearUiMessages(): void {
  uiMessages.length = 0;
  figmaMock.ui.postMessage.mockClear();
}

export function simulateUiMessage(msg: any): void {
  if (uiOnMessage) {
    uiOnMessage(msg);
  }
}

/**
 * Reset state between tests. Does NOT destroy mock implementations -
 * just clears data, nodes, messages, and call counts.
 */
export function resetState(): void {
  Object.keys(pluginData).forEach((k) => delete pluginData[k]);
  Object.keys(clientStorage).forEach((k) => delete clientStorage[k]);
  pages.length = 0;
  allNodes.clear();
  documentNode.children = [];
  _currentPage = null;
  selection = [];
  uiMessages.length = 0;

  // Clear call counts but keep implementations
  figmaMock.showUI.mockClear();
  figmaMock.getNodeById.mockClear();
  figmaMock.viewport.scrollAndZoomIntoView.mockClear();
  figmaMock.ui.postMessage.mockClear();
  figmaMock.notify.mockClear();
  figmaMock.clientStorage.getAsync.mockClear();
  figmaMock.clientStorage.setAsync.mockClear();
  figmaMock.on.mockClear();

  // Re-create default page
  addPage("1:0", "Page 1");
}
