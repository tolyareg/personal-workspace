import Dexie, { Table } from 'dexie';
import { Folder, Block } from '../types/models';

export class WorkspaceDatabase extends Dexie {
  folders!: Table<Folder, string>;
  blocks!: Table<Block, string>;

  constructor() {
    super('PersonalWorkspaceDB');
    this.version(1).stores({
      folders: 'id, userId, parentId, order, updatedAt, isDeleted, syncStatus',
      blocks: 'id, userId, folderId, type, order, status, priority, deadline, updatedAt, isDeleted, syncStatus'
    });
  }
}

export const db = new WorkspaceDatabase();