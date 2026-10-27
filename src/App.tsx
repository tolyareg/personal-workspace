import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { db } from './services/db';
import { syncEngine } from './services/syncEngine';
import { Folder, Block, BlockType, WorkspaceExportData } from './types/models';
import { FolderTree } from './components/FolderTree';
import { SortableBlockItem } from './components/SortableBlockItem';
import styles from './App.module.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const App: React.FC = () => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | BlockType>('all');
  const [user, setUser] = useState<any>(null);
  const [saveIndicator, setSaveIndicator] = useState<'saved' | 'saving' | 'error'>('saved');

  // Сенсоры Dnd: отступ 8px защищает от паразитного перетаскивания при выделении текста
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadLocalData = useCallback(async () => {
    const fList = await db.folders.filter(f => !f.isDeleted).toArray();
    const bList = await db.blocks.filter(b => !b.isDeleted).toArray();
    setFolders(fList);
    setBlocks(bList);
  }, []);

  useEffect(() => {
    syncEngine.init(SUPABASE_URL, SUPABASE_KEY);
    const client = syncEngine.getSupabase();

    if (client) {
      client.auth.getSession().then(({ data: { session } }) => {
        const u = session?.user || null;
        setUser(u);
        syncEngine.setUserId(u?.id || null);
        if (u) {
          syncEngine.linkLocalDataToUser(u.id).then(() => {
            syncEngine.sync().then(loadLocalData);
          });
        }
      });

      const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
        const u = session?.user || null;
        setUser(u);
        syncEngine.setUserId(u?.id || null);

        if (event === 'SIGNED_IN' && u) {
          await syncEngine.linkLocalDataToUser(u.id);
          await syncEngine.sync();
          await loadLocalData();
        } else if (event === 'SIGNED_OUT') {
          syncEngine.handleLogout();
          await loadLocalData();
        }
      });

      syncEngine.startPeriodicSync(30000);
      return () => {
        subscription.unsubscribe();
        syncEngine.stopPeriodicSync();
      };
    }
  }, [loadLocalData]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  const handleLogin = async () => {
    const client = syncEngine.getSupabase();
    if (!client) return;
    await client.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleLogout = async () => {
    const client = syncEngine.getSupabase();
    if (!client) return;
    await client.auth.signOut();
  };

  // CRUD Папки
  const handleCreateFolder = async (parentId: string | null, title: string) => {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      userId: user?.id || null,
      parentId,
      title,
      color: '#38bdf8',
      icon: 'folder',
      order: folders.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
      syncStatus: 'pending'
    };
    await db.folders.add(newFolder);
    await loadLocalData();
    syncEngine.sync();
  };

  const handleDeleteFolder = async (folderId: string) => {
    await db.folders.update(folderId, { isDeleted: true, updatedAt: Date.now(), syncStatus: 'pending' });
    if (activeFolderId === folderId) setActiveFolderId(null);
    await loadLocalData();
    syncEngine.sync();
  };

  // CRUD Блоки
  const handleCreateBlock = async (type: BlockType) => {
    setSaveIndicator('saving');
    const newBlock: Block = {
      id: crypto.randomUUID(),
      userId: user?.id || null,
      folderId: activeFolderId, // строго string | null, без невалидного 'root'
      type,
      title: type === 'task' ? 'Новая задача' : type === 'note' ? 'Новая заметка' : 'Новая схема',
      order: blocks.filter(b => b.folderId === activeFolderId).length,
      status: type === 'task' ? 'todo' : undefined,
      priority: type === 'task' ? 'medium' : undefined,
      content: '',
      checklist: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
      syncStatus: 'pending'
    };
    await db.blocks.add(newBlock);
    await loadLocalData();
    setSaveIndicator('saved');
    syncEngine.sync();
  };

  const handleUpdateBlock = async (updated: Block) => {
    setSaveIndicator('saving');
    await db.blocks.put({ ...updated, syncStatus: 'pending' });
    await loadLocalData();
    setSaveIndicator('saved');
  };

  const handleDeleteBlock = async (id: string) => {
    await db.blocks.update(id, { isDeleted: true, updatedAt: Date.now(), syncStatus: 'pending' });
    await loadLocalData();
    syncEngine.sync();
  };

  // Drag & Drop логика: переупорядочивание и перемещение в папки
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Сценарий 1: Сброс блока на папку в боковой панели
    if (over.data?.current?.type === 'folder') {
      const targetFolderId = over.data.current.targetFolderId as string | null;
      await db.blocks.update(active.id as string, {
        folderId: targetFolderId,
        updatedAt: Date.now(),
        syncStatus: 'pending'
      });
      await loadLocalData();
      syncEngine.sync();
      return;
    }

    // Сценарий 2: Перемещение блока внутри текущего списка
    if (active.id !== over.id) {
      const currentList = blocks.filter(b => b.folderId === activeFolderId && !b.isDeleted).sort((a, b) => a.order - b.order);
      const oldIndex = currentList.findIndex(b => b.id === active.id);
      const newIndex = currentList.findIndex(b => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(currentList, oldIndex, newIndex);
        await db.transaction('rw', db.blocks, async () => {
          for (let i = 0; i < reordered.length; i++) {
            await db.blocks.update(reordered[i].id, {
              order: i,
              updatedAt: Date.now(),
              syncStatus: 'pending'
            });
          }
        });
        await loadLocalData();
        syncEngine.sync();
      }
    }
  };

  // Экспорт данных
  const handleExport = async () => {
    const exportData: WorkspaceExportData = {
      version: 1,
      exportedAt: Date.now(),
      folders: await db.folders.toArray(),
      blocks: await db.blocks.toArray()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Импорт данных с валидацией схемы
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed: WorkspaceExportData = JSON.parse(text);

      if (!parsed.version || !Array.isArray(parsed.folders) || !Array.isArray(parsed.blocks)) {
        throw new Error('Некорректная структура JSON файла бэкапа');
      }

      const confirmed = window.confirm(
        `Будет импортировано папок: ${parsed.folders.length}, блоков: ${parsed.blocks.length}. Объединить с текущими данными?`
      );
      if (!confirmed) return;

      await db.transaction('rw', db.folders, db.blocks, async () => {
        for (const f of parsed.folders) {
          if (f.id && f.title) {
            await db.folders.put({
              ...f,
              userId: user?.id || null,
              syncStatus: 'pending',
              updatedAt: Date.now()
            });
          }
        }
        for (const b of parsed.blocks) {
          if (b.id && b.type && b.title !== undefined) {
            await db.blocks.put({
              ...b,
              userId: user?.id || null,
              syncStatus: 'pending',
              updatedAt: Date.now()
            });
          }
        }
      });

      await loadLocalData();
      syncEngine.sync();
      alert('Данные успешно импортированы!');
    } catch (err: any) {
      alert(`Ошибка импорта: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  const visibleBlocks = useMemo(() => {
    return blocks
      .filter(b => {
        if (b.isDeleted) return false;
        if (b.folderId !== activeFolderId) return false;
        if (typeFilter !== 'all' && b.type !== typeFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = b.title.toLowerCase().includes(q);
          const matchContent = b.content ? b.content.toLowerCase().includes(q) : false;
          return matchTitle || matchContent;
        }
        return true;
      })
      .sort((a, b) => a.order - b.order);
  }, [blocks, activeFolderId, typeFilter, searchQuery]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className={styles.appShell}>
        {/* Боковая панель */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.brand}>
              <span className={styles.brandIcon}>◈</span>
              <h1 className={styles.brandTitle}>Workspace</h1>
            </div>

            <div className={styles.authBox}>
              {user ? (
                <div className={styles.profile}>
                  <span className={styles.userEmail} title={user.email}>{user.email}</span>
                  <button type="button" className={styles.authBtn} onClick={handleLogout}>Выйти</button>
                </div>
              ) : (
                <button type="button" className={styles.authBtn} onClick={handleLogin}>
                  Вход с GitHub
                </button>
              )}
            </div>
          </div>

          <FolderTree
            folders={folders}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
          />

          <div className={styles.sidebarFooter}>
            <button type="button" className={styles.footerBtn} onClick={handleExport}>
              Экспорт JSON
            </button>
            <label className={styles.footerBtn}>
              Импорт JSON
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>
        </aside>

        {/* Главная рабочая зона */}
        <main className={styles.mainContent}>
          <header className={styles.topBar}>
            <div className={styles.searchWrapper}>
              <input
                type="search"
                placeholder="Поиск по задачам, стратегиям и планам..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.topActions}>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as any)}
                className={styles.filterSelect}
              >
                <option value="all">Все типы</option>
                <option value="task">Задачи</option>
                <option value="note">Заметки</option>
                <option value="canvas">Схемы</option>
              </select>

              <div className={styles.saveStatus}>
                <span className={`${styles.statusDot} ${styles[saveIndicator]}`} />
                <span>{saveIndicator === 'saving' ? 'Запись...' : 'Сохранено'}</span>
              </div>
            </div>
          </header>

          <div className={styles.createBar}>
            <button type="button" className={styles.addBtn} onClick={() => handleCreateBlock('task')}>
              + Задача
            </button>
            <button type="button" className={styles.addBtn} onClick={() => handleCreateBlock('note')}>
              + Заметка
            </button>
            <button type="button" className={styles.addBtn} onClick={() => handleCreateBlock('canvas')}>
              + Холст / Схема
            </button>
          </div>

          <div className={styles.contentBody}>
            {visibleBlocks.length === 0 ? (
              <div className={styles.emptyState}>
                <p>В этой папке пока нет блоков. Создайте задачу, заметку или схему выше.</p>
              </div>
            ) : (
              <SortableContext items={visibleBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.blockList}>
                  {visibleBlocks.map(b => (
                    <SortableBlockItem
                      key={b.id}
                      block={b}
                      onUpdate={handleUpdateBlock}
                      onDelete={handleDeleteBlock}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        </main>
      </div>
    </DndContext>
  );
};