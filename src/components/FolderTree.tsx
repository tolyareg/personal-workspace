import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Folder } from '../types/models';
import styles from './FolderTree.module.css';

interface FolderTreeProps {
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (parentId: string | null, title: string) => void;
  onDeleteFolder: (id: string) => void;
}

const DroppableFolderItem: React.FC<{
  folder: Folder;
  isActive: boolean;
  onSelect: () => void;
  onAddSub: () => void;
  onDelete: () => void;
}> = ({ folder, isActive, onSelect, onAddSub, onDelete }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-target-${folder.id}`,
    data: { type: 'folder', targetFolderId: folder.id }
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.nodeRow} ${isActive ? styles.activeRow : ''} ${isOver ? styles.dropTargetOver : ''}`}
    >
      <span className={styles.icon} style={{ color: folder.color }}>📁</span>
      <span className={styles.title} onClick={onSelect} role="button" tabIndex={0}>
        {folder.title}
      </span>
      <button type="button" className={styles.subBtn} onClick={onAddSub} title="Вложенная папка">+</button>
      <button type="button" className={styles.deleteBtn} onClick={onDelete} title="Удалить">✕</button>
    </div>
  );
};

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);

  // Корневая зона сброса (перенос блока в "Все блоки" / Root)
  const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
    id: 'folder-target-root',
    data: { type: 'folder', targetFolderId: null }
  });

  const renderNodes = (parentId: string | null) => {
    const list = folders.filter(f => f.parentId === parentId && !f.isDeleted).sort((a, b) => a.order - b.order);

    return (
      <ul className={styles.treeList}>
        {list.map(f => (
          <li key={f.id} className={styles.nodeItem}>
            <DroppableFolderItem
              folder={f}
              isActive={f.id === activeFolderId}
              onSelect={() => onSelectFolder(f.id)}
              onAddSub={() => setCreatingParentId(f.id)}
              onDelete={() => {
                if (window.confirm(`Удалить папку "${f.title}"?`)) onDeleteFolder(f.id);
              }}
            />

            {creatingParentId === f.id && (
              <div className={styles.inlineCreate}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Имя подпапки..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newTitle.trim()) {
                      onCreateFolder(f.id, newTitle.trim());
                      setNewTitle('');
                      setCreatingParentId(undefined);
                    }
                    if (e.key === 'Escape') setCreatingParentId(undefined);
                  }}
                />
              </div>
            )}

            {renderNodes(f.id)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className={styles.treeContainer}>
      <div className={styles.topActions}>
        <div
          ref={setRootDropRef}
          className={`${styles.allBtn} ${activeFolderId === null ? styles.activeRow : ''} ${isRootOver ? styles.dropTargetOver : ''}`}
          onClick={() => onSelectFolder(null)}
          role="button"
          tabIndex={0}
        >
          📂 Все блоки (Корень)
        </div>
        <button
          type="button"
          className={styles.createRootBtn}
          onClick={() => setCreatingParentId(null)}
        >
          + Папка
        </button>
      </div>

      {creatingParentId === null && (
        <div className={styles.inlineCreate}>
          <input
            type="text"
            autoFocus
            placeholder="Имя корневой папки..."
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newTitle.trim()) {
                onCreateFolder(null, newTitle.trim());
                setNewTitle('');
                setCreatingParentId(undefined);
              }
              if (e.key === 'Escape') setCreatingParentId(undefined);
            }}
          />
        </div>
      )}

      {renderNodes(null)}
    </div>
  );
};