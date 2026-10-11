import { useId } from 'react'
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

// Separate contexts keep episode moves and page moves within their own lists.
export function OutlineSorting({ items, onMove, t, children }) {
  const contextId = useId()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 230, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter keeps the row's normal select/expand action. Space starts sorting.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter', 'Tab'] },
    }),
  )
  const label = (id) => items.find(item => item.id === id)?.label ?? ''
  return (
    <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter}
      modifiers={[({ transform }) => ({ ...transform, x: 0 })]}
      accessibility={{
        screenReaderInstructions: { draggable: t('sortHint') },
        announcements: {
          onDragStart: ({ active }) => `${t('sortStart')} ${label(active.id)}`,
          onDragOver: ({ over }) => over ? `${t('sortOver')} ${label(over.id)}` : undefined,
          onDragEnd: () => t('sortEnd'),
          onDragCancel: () => t('sortCancel'),
        },
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(active.id, over.id)
      }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  )
}

export function SortableOutlineItem({ id, disabled, t, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const dragProps = {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
    disabled,
    'aria-roledescription': t('sortable'),
    onDragStart: event => event.preventDefault(),
  }
  return <div ref={setNodeRef} data-outline-id={id} className={cn('relative min-w-0', isDragging && 'z-10')}
    style={{ transform: CSS.Transform.toString(transform), transition }}>{children(dragProps)}</div>
}
