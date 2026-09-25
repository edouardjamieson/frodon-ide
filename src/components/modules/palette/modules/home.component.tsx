import {
  CommandPaletteBody,
  CommandPaletteHeader,
  CommandPaletteMenuItem,
  CommandPaletteSearch,
} from './templates.component';
import { usePalette, usePaletteItems } from '../palette.hook';
import { Fragment } from '@opentui/react/jsx-runtime';
import { useAutoScroll, useUpDownActions } from '~/lib/utils';
import { usePaletteStore } from '../palette.store';
import { useMemo, useRef } from 'react';
import type { ScrollBoxRenderable } from '@opentui/core';

export default function PaletteModuleHome() {
  const { search, setOpen } = usePaletteStore();
  const { items, executeAction } = usePaletteItems();

  const scrollBoxRef = useRef<ScrollBoxRenderable>(null);

  const filteredItems = useMemo(() => {
    return items.map((group) => ({
      ...group,
      items: group.items.filter(
        (i) =>
          i.title?.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
          i.description
            ?.toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()) ||
          group.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ),
    }));
  }, [items, search]);

  const itemsFlat = filteredItems.flatMap((i) => i.items);
  const { index } = useUpDownActions({
    maxIndex: itemsFlat.length,
    onEnter: (i) => {
      const item = itemsFlat[i];
      if (!item) return;

      if (item.type === 'MODULE') {
        setOpen(true, item.id);
      } else {
        executeAction(item);
      }
    },
  });

  useAutoScroll((index ?? 0) * 7, scrollBoxRef.current);

  return (
    <>
      <CommandPaletteHeader title="Command palette" icon="💡" />
      <CommandPaletteSearch />
      <CommandPaletteBody ref={scrollBoxRef}>
        {filteredItems.map(({ items, name }, i) => {
          if (items.length === 0) return null;
          return (
            <Fragment key={i}>
              <text marginBottom={1}>{name}</text>
              {items.map((item, j) => (
                <CommandPaletteMenuItem
                  key={j}
                  item={item}
                  selected={index !== null && itemsFlat[index]?.id === item.id}
                  onClick={() => {
                    if (item.type === 'MODULE') {
                      setOpen(true, item.id);
                    } else {
                      executeAction(item);
                    }
                  }}
                />
              ))}
            </Fragment>
          );
        })}
      </CommandPaletteBody>
    </>
  );
}
