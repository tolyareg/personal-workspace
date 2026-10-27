import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from './db';
import { Block, Folder } from '../types/models';

export class SyncEngine {
  private client: SupabaseClient | null = null;
  private isSyncing = false;
  private currentUserId: string | null = null;
  private syncTimer: number | null = null;

  public init(supabaseUrl: string, supabaseAnonKey: string) {
    if (!supabaseUrl || !supabaseAnonKey) return;
    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  public getSupabase() {
    return this.client;
  }

  public setUserId(userId: string | null) {
    this.currentUserId = userId;
  }

  /**
   * Миграция данных анонимного гостя при первой авторизации
   */
  public async linkLocalDataToUser(userId: string): Promise<void> {
    this.currentUserId = userId;
    await db.transaction('rw', db.folders, db.blocks, async () => {
      const guestFolders = await db.folders.filter(f => f.userId === null).toArray();
      for (const f of guestFolders) {
        await db.folders.update(f.id, { userId, syncStatus: 'pending', updatedAt: Date.now() });
      }

      const guestBlocks = await db.blocks.filter(b => b.userId === null).toArray();
      for (const b of guestBlocks) {
        await db.blocks.update(b.id, { userId, syncStatus: 'pending', updatedAt: Date.now() });
      }
    });
  }

  /**
   * Очистка или сброс контекста при логауте для предотвращения утечки чужих данных
   */
  public handleLogout(): void {
    if (this.currentUserId) {
      localStorage.removeItem(`last_sync_${this.currentUserId}`);
    }
    this.currentUserId = null;
  }

  public async sync(): Promise<{ success: boolean; error?: string }> {
    if (!this.client || this.isSyncing || !navigator.onLine || !this.currentUserId) {
      return { success: false, error: 'Offline, in-progress, or guest mode' };
    }

    this.isSyncing = true;
    const userId = this.currentUserId;
    const syncCursorKey = `last_sync_${userId}`;

    try {
      // ================= 1. PUSH (Отправка локальных изменений) =================
      const pendingFolders = await db.folders
        .where('userId')
        .equals(userId)
        .filter(f => f.syncStatus === 'pending')
        .toArray();

      for (const folder of pendingFolders) {
        const { error } = await this.client.from('folders').upsert({
          id: folder.id,
          user_id: userId,
          parent_id: folder.parentId,
          title: folder.title,
          color: folder.color,
          icon: folder.icon,
          order: folder.order,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
          is_deleted: folder.isDeleted
        });

        if (error) throw new Error(`Push folder ${folder.id} failed: ${error.message}`);
        await db.folders.update(folder.id, { syncStatus: 'synced' });
      }

      const pendingBlocks = await db.blocks
        .where('userId')
        .equals(userId)
        .filter(b => b.syncStatus === 'pending')
        .toArray();

      for (const block of pendingBlocks) {
        const { error } = await this.client.from('blocks').upsert({
          id: block.id,
          user_id: userId,
          folder_id: block.folderId, // null для корневых блоков
          type: block.type,
          title: block.title,
          order: block.order,
          status: block.status,
          priority: block.priority,
          color: block.color,
          deadline: block.deadline,
          checklist: block.checklist,
          content: block.content,
          canvas_data: block.canvasData,
          metadata: block.metadata,
          created_at: block.createdAt,
          updated_at: block.updatedAt,
          is_deleted: block.isDeleted
        });

        if (error) throw new Error(`Push block ${block.id} failed: ${error.message}`);
        await db.blocks.update(block.id, { syncStatus: 'synced' });
      }

      // ================= 2. PULL (Получение облачных изменений) =================
      const lastSyncTimestamp = Number(localStorage.getItem(syncCursorKey) || '0');
      let maxRemoteTimestamp = lastSyncTimestamp;

      const { data: remoteFolders, error: pullFolderErr } = await this.client
        .from('folders')
        .select('*')
        .eq('user_id', userId)
        .gt('updated_at', lastSyncTimestamp);

      if (pullFolderErr) throw new Error(`Pull folders error: ${pullFolderErr.message}`);

      if (remoteFolders && remoteFolders.length > 0) {
        await db.transaction('rw', db.folders, async () => {
          for (const rf of remoteFolders) {
            const local = await db.folders.get(rf.id);
            const remoteUpdated = Number(rf.updated_at);
            if (remoteUpdated > maxRemoteTimestamp) maxRemoteTimestamp = remoteUpdated;

            // Разрешение LWW + tie-breaker
            if (!local || local.updatedAt < remoteUpdated || (local.updatedAt === remoteUpdated && local.syncStatus === 'synced')) {
              await db.folders.put({
                id: rf.id,
                userId: rf.user_id,
                parentId: rf.parent_id,
                title: rf.title,
                color: rf.color,
                icon: rf.icon,
                order: rf.order,
                createdAt: Number(rf.created_at),
                updatedAt: remoteUpdated,
                isDeleted: rf.is_deleted,
                syncStatus: 'synced'
              });
            }
          }
        });
      }

      const { data: remoteBlocks, error: pullBlockErr } = await this.client
        .from('blocks')
        .select('*')
        .eq('user_id', userId)
        .gt('updated_at', lastSyncTimestamp);

      if (pullBlockErr) throw new Error(`Pull blocks error: ${pullBlockErr.message}`);

      if (remoteBlocks && remoteBlocks.length > 0) {
        await db.transaction('rw', db.blocks, async () => {
          for (const rb of remoteBlocks) {
            const local = await db.blocks.get(rb.id);
            const remoteUpdated = Number(rb.updated_at);
            if (remoteUpdated > maxRemoteTimestamp) maxRemoteTimestamp = remoteUpdated;

            if (!local || local.updatedAt < remoteUpdated || (local.updatedAt === remoteUpdated && local.syncStatus === 'synced')) {
              await db.blocks.put({
                id: rb.id,
                userId: rb.user_id,
                folderId: rb.folder_id,
                type: rb.type,
                title: rb.title,
                order: rb.order,
                status: rb.status,
                priority: rb.priority,
                color: rb.color,
                deadline: rb.deadline,
                checklist: rb.checklist,
                content: rb.content,
                canvasData: rb.canvas_data,
                metadata: rb.metadata,
                createdAt: Number(rb.created_at),
                updatedAt: remoteUpdated,
                isDeleted: rb.is_deleted,
                syncStatus: 'synced'
              });
            }
          }
        });
      }

      // Курсор сдвигается только после полной фиксации всех шагов
      localStorage.setItem(syncCursorKey, maxRemoteTimestamp.toString());
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  public startPeriodicSync(intervalMs = 25000) {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = window.setInterval(() => this.sync(), intervalMs);
    window.addEventListener('online', () => this.sync());
  }

  public stopPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }
}

export const syncEngine = new SyncEngine();