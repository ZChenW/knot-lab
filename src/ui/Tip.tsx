import type { ReactElement } from 'react';
import { Tooltip } from 'radix-ui';
export function Tip({
  text,
  children,
  side = 'bottom',
}: {
  text: string;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side={side} align="start" sideOffset={6} collisionPadding={12}>
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
