import React from 'react';
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
import { Block } from '../types/models';
import { SortableBlockItem } from './SortableBlockItem';
import styles from './BlockList.module.css';

interface BlockListProps {
  blocks: Block[];
  onReorder: (newBlocks: Block[]) => void;
  onUpdateBlock: (block: Block) => void;
  onDeleteBlock: (id: string) => void;
}

export const BlockList: React.FC<BlockListProps> = ({
  blocks,
  onReorder,
  onUpdateBlock,
  onDeleteBlock
}) => {
  // Настройка сенсоров: отступ 8px для предотвращения случайного сдвига при выделении текста
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex(b => b.id === active.id);
      const newIndex = blocks.findIndex(b => b.id === over.id);
      const reordered = arrayMove(blocks, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        order: idx,
        updatedAt: Date.now()
      }));
      onReorder(reordered);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.list}>
          {blocks.map(block => (
            <SortableBlockItem
              key={block.id}
              block={block}
              onUpdate={onUpdateBlock}
              onDelete={onDeleteBlock}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};