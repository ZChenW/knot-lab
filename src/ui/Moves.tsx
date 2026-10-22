import { Popover } from 'radix-ui';
import { useT } from '../i18n/useT';
import type { AdditionMove, AvailableMove, MoveRequest, MoveResult } from '../core/moves';
import type { Point } from '../core/knot';
import { Tip } from './Tip';

/**
 * True when a marker's text box comes within 6 screen px of a crossing number
 * or strand label box (both measured as boxes, in board units; u = units per px).
 * Such markers are drawn as a ring of radius 5m instead of text.
 */
export function markCrowded(p: Point, labels: Point[], u: number, m: number): boolean {
  const markW = 9 * m,
    markH = 6 * m,
    labelW = 8 * m,
    labelH = 6 * m,
    pad = 6 * u;
  return labels.some((q) => {
    const gapX = Math.abs(q[0] - p[0]) - markW - labelW,
      gapY = Math.abs(q[1] - p[1]) - markH - labelH;
    return Math.max(gapX, gapY) < pad;
  });
}
export function MoveMarks({
  moves,
  u,
  m,
  labels = [],
  preview,
  apply,
}: {
  moves: AvailableMove[];
  u: number;
  m: number;
  labels?: Point[];
  preview: (move: AvailableMove | null) => void;
  apply: (move: MoveRequest) => void;
}) {
  const t = useT();
  const crowded = (p: Point) => markCrowded(p, labels, u, m);
  return (
    <g className="move-marks">
      {moves.map((move, i) => {
        const ring = crowded(move.point),
          kind = move.kind.slice(0, 2);
        return (
          <g
            key={i}
            data-move-mark={i}
            data-move-kind={move.kind}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => preview(move)}
            onPointerLeave={() => preview(null)}
            onFocus={() => preview(move)}
            onBlur={() => preview(null)}
          >
            <circle
              cx={move.point[0]}
              cy={move.point[1]}
              r={Math.max(11 * u, 12 * m)}
              className="move-mark-hit"
              role="button"
              tabIndex={0}
              aria-label={t('moves.apply', { kind })}
              onClick={(e) => {
                e.stopPropagation();
                apply(move);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!e.repeat) apply(move);
                }
              }}
            />
            {ring ? (
              <circle cx={move.point[0]} cy={move.point[1]} r={5 * m} className="move-mark-ring" />
            ) : (
              <text x={move.point[0]} y={move.point[1]} className="move-mark-text">
                {kind}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
export function MoveMenu({
  position,
  items,
  close,
  preview,
  apply,
}: {
  position: Point;
  items: AdditionMove[];
  close: () => void;
  preview: (result: MoveResult | null) => void;
  apply: (move: MoveRequest) => void;
}) {
  const t = useT();
  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Popover.Anchor asChild>
        <span className="move-menu-anchor" style={{ left: position[0], top: position[1] }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="picker-menu move-menu"
          align="start"
          side="bottom"
          sideOffset={0}
          collisionPadding={12}
          aria-label={t('moves.menu')}
          role="menu"
          onPointerLeave={() => preview(null)}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault();
            const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')],
              current = rows.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? rows.length - 1
                  : (current + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
            rows[next]?.focus();
          }}
        >
          {items.map((item, i) => {
            const refused = !item.result.ok,
              key =
                item.move.kind === 'R1+'
                  ? item.sign === 1
                    ? 'moves.addR1Positive'
                    : 'moves.addR1Negative'
                  : item.over
                    ? 'moves.addR2Over'
                    : 'moves.addR2Under';
            const row = (
              <button
                className="picker-item move-menu-item"
                role="menuitem"
                key={i}
                data-add-move={i}
                aria-disabled={refused}
                onMouseEnter={() => preview(item.result)}
                onFocus={() => preview(item.result)}
                onClick={() => {
                  if (!refused) apply(item.move);
                }}
              >
                {t(key)}
              </button>
            );
            return refused ? (
              <Tip
                key={i}
                side="right"
                text={t(!item.result.ok && item.result.reason === 'room' ? 'moves.room' : 'moves.geometry')}
              >
                {row}
              </Tip>
            ) : (
              row
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
