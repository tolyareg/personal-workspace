import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Block, PriorityLevel } from '../types/models';
import { CanvasBlock } from './CanvasBlock';
import styles from './SortableBlockItem.module.css';

interface SortableBlockItemProps {
  block: Block;
  onUpdate: (block: Block) => void;
  onDelete: (id: string) => void;
}

export const SortableBlockItem: React.FC<SortableBlockItemProps> = ({ block, onUpdate, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto'
  };

  const handleTitleChange = (newTitle: string) => {
    onUpdate({ ...block, title: newTitle, updatedAt: Date.now() });
  };

  const handleStatusToggle = () => {
    const nextStatus = block.status === 'completed' ? 'todo' : 'completed';
    onUpdate({ ...block, status: nextStatus, updatedAt: Date.now() });
  };

  const handlePriorityChange = (priority: PriorityLevel) => {
    onUpdate({ ...block, priority, updatedAt: Date.now() });
  };

  const handleAddChecklistItem = (text: string) => {
    if (!text.trim()) return;
    const newItem = { id: crypto.randomUUID(), text, completed: false, order: (block.checklist?.length || 0) };
    const nextChecklist = [...(block.checklist || []), newItem];
    onUpdate({ ...block, checklist: nextChecklist, updatedAt: Date.now() });
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const nextChecklist = (block.checklist || []).map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    onUpdate({ ...block, checklist: nextChecklist, updatedAt: Date.now() });
  };

  return (
    <div ref={setNodeRef} style={style} className={`${styles.blockCard} ${styles[block.type]}`}>
      {/* Верхняя строка блока */}
      <div className={styles.header}>
        {/* Ручка для перемещения */}
        <button {...attributes} {...listeners} className={styles.dragHandle} title="Перетащить блок" tabIndex={0}>
          ⋮⋮
        </button>

        {block.type === 'task' && (
          <input
            type="checkbox"
            checked={block.status === 'completed'}
            onChange={handleStatusToggle}
            className={styles.statusCheck}
          />
        )}

        <input
          type="text"
          value={block.title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder={block.type === 'task' ? 'Заголовок задачи...' : 'Название заметки / схемы...'}
          className={`${styles.titleInput} ${block.status === 'completed' ? styles.completedText : ''}`}
        />

        {block.type === 'task' && (
          <select
            value={block.priority || 'medium'}
            onChange={e => handlePriorityChange(e.target.value as PriorityLevel)}
            className={`${styles.prioritySelect} ${styles[`priority_${block.priority || 'medium'}`]}`}
          >
            <option value="low">Низкий</option>
            <option value="medium">Обычный</option>
            <option value="high">Высокий</option>
            <option value="critical">Критический</option>
          </select>
        )}

        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? 'Свернуть' : 'Развернуть'}
        >
          {isExpanded ? '▲' : '▼'}
        </button>

        <button
          type="button"
          className={styles.deleteBtn}
          onClick={() => onDelete(block.id)}
          title="Удалить блок"
        >
          ✕
        </button>
      </div>

      {/* Развернутое содержимое */}
      {isExpanded && (
        <div className={styles.detailsBody}>
          {block.type === 'note' && (
            <textarea
              className={styles.noteContent}
              value={block.content || ''}
              onChange={e => onUpdate({ ...block, content: e.target.value, updatedAt: Date.now() })}
              placeholder="Текст стратегии, идеи, инструкции (поддерживается markdown)..."
              rows={8}
            />
          )}

          {block.type === 'task' && (
            <div className={styles.taskExtras}>
              <div className={styles.taskMetaRow}>
                <label className={styles.metaLabel}>
                  Дедлайн:
                  <input
                    type="datetime-local"
                    className={styles.dateInput}
                    value={block.deadline ? new Date(block.deadline).toISOString().slice(0, 16) : ''}
                    onChange={e => {
                      const val = e.target.value ? new Date(e.target.value).getTime() : null;
                      onUpdate({ ...block, deadline: val, updatedAt: Date.now() });
                    }}
                  />
                </label>
              </div>

              <div className={styles.checklistSection}>
                <div className={styles.subTitle}>Подзадачи / Чек-лист:</div>
                <div className={styles.checklistItems}>
                  {(block.checklist || []).map(item => (
                    <label key={item.id} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => handleToggleChecklistItem(item.id)}
                      />
                      <span className={item.completed ? styles.completedText : ''}>{item.text}</span>
                    </label>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="+ Добавить пункт (Enter)..."
                  className={styles.addChecklistInput}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleAddChecklistItem(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
            </div>
          )}

          {block.type === 'canvas' && (
            <CanvasBlock
              initialData={block.canvasData}
              onChange={canvasData => onUpdate({ ...block, canvasData, updatedAt: Date.now() })}
            />
          )}
        </div>
      )}
    </div>
  );
};