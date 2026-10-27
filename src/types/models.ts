export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export type BlockType = 'task' | 'note' | 'canvas' | 'link';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
}

export interface DrawingPath {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  /** Относительные координаты [x0/w, y0/h, x1/w, y1/h, ...], диапазон 0.0 – 1.0 */
  points: number[];
}

export interface CanvasData {
  version: number;
  paths: DrawingPath[];
  aspectRatio: number; // Сохранение соотношения сторон (w / h)
}

export interface BaseEntity {
  id: string;
  userId: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface Folder extends BaseEntity {
  title: string;
  parentId: string | null;
  color: string;
  icon: string;
  order: number;
}

export interface Block extends BaseEntity {
  folderId: string | null; // NULL означает корневой уровень рабочего пространства
  type: BlockType;
  title: string;
  order: number;
  status?: 'todo' | 'in_progress' | 'completed' | 'archived';
  priority?: PriorityLevel;
  color?: string;
  deadline?: number | null;
  checklist?: ChecklistItem[];
  content?: string;
  canvasData?: CanvasData;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceExportData {
  version: number;
  exportedAt: number;
  folders: Folder[];
  blocks: Block[];
}