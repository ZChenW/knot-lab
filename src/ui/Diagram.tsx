import { useT } from '../i18n/useT';
import { useMemo } from 'react';
import type { Analysis } from '../core/knot';
import { diagramGeometry, labelColor, markScale } from '../core/diagram';
import type { Hot } from '../state/store';
import { sub } from './format';
interface Props {
  D: Analysis;
  u: number;
  labels: number[] | null;
  p: number;
  hot: Hot;
  toggle: (key: string) => void;
  // 13.D
  renumber?: (arc: number) => void;
  pointPath?: boolean;
  movesOn?: boolean;
  alone?: number | null;
}
export function Diagram({ D, u, labels, p, hot, toggle, renumber, pointPath, movesOn, alone = null }: Props) {
  const t = useT();
  const m = u * markScale(1 / u);
  const geo = useMemo(() => diagramGeometry(D, m), [D, m]);
  const color = (arc: number) => (labels ? labelColor(labels[arc], p) : undefined);
  const opacity = (comp: number) => (alone !== null && comp !== alone ? 0.25 : undefined);
  const crossingOpacity = (x: Analysis['crossings'][number]) =>
    alone !== null && (x.over.c !== alone || x.under.c !== alone) ? 0.25 : undefined;
  return (
    <>
      <g>
        {geo.arcs.map((a) => (
          <path
            key={a.id}
            d={a.path}
            className={`arc${hot.surface === 'boundary' && (alone === null || a.comp === alone) ? ' surface-edge' : ''}${hot.arc === a.id || hot.arcs?.includes(a.id) || hot.comp === a.comp || (Array.isArray(hot.signs) && hot.signs.includes(a.comp)) ? ' on' : ''}`}
            data-arc={a.id}
            data-comp={a.comp}
            style={{ stroke: color(a.id), opacity: opacity(a.comp) }}
          />
        ))}
      </g>
      <g>
        {geo.arcs.map((a) => (
          <text
            key={a.id}
            x={a.label[0]}
            y={a.label[1]}
            className={`tag${!pointPath && renumber ? ' strand-label' : ''}`}
            data-label-arc={a.id}
            style={{ opacity: opacity(a.comp) }}
            role={!pointPath && renumber ? 'button' : undefined}
            tabIndex={!pointPath && renumber ? 0 : undefined}
            aria-label={!pointPath && renumber ? t('board.numberFrom') : undefined}
            onClick={() => {
              if (!pointPath) renumber?.(a.id);
            }}
            onKeyDown={(e) => {
              if (!pointPath && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                renumber?.(a.id);
              }
            }}
          >
            {!pointPath && renumber && <title>{t('board.numberFrom')}</title>}x{sub(a.id + 1)}
            {labels && (
              <tspan className="val" dx={3 * m} style={{ fill: color(a.id) }}>
                {labels[a.id]}
              </tspan>
            )}
          </text>
        ))}
        {geo.arrows.map((a) => (
          <g key={a.arc} style={{ opacity: opacity(a.comp) }}>
            <path
              d="M-5 -4.5L1.5 0L-5 4.5"
              className="arrow"
              data-arrow-arc={a.arc}
              data-comp={a.comp}
              transform={a.transform}
              style={{ stroke: color(a.arc) }}
            />
            {D.nComps > 1 && a.label && (
              <text x={a.label[0]} y={a.label[1]} className="tag">
                K{sub(a.comp + 1)}
              </text>
            )}
          </g>
        ))}
        {geo.crossings.map((x) => (
          <text
            key={x.key}
            x={x.label[0]}
            y={x.label[1]}
            className="num"
            style={{ opacity: crossingOpacity(x) }}
          >
            {x.num}
          </text>
        ))}
      </g>
      {/* 13.D */}
      <g className="crossing-signs">
        {geo.crossings
          .filter(
            (x) =>
              (hot.signs === 'all' && (alone === null || (x.over.c === alone && x.under.c === alone))) ||
              (hot.signs === 'between' && x.over.c !== x.under.c) ||
              (Array.isArray(hot.signs) &&
                x.over.c !== x.under.c &&
                hot.signs.includes(x.over.c) &&
                hot.signs.includes(x.under.c)),
          )
          .map((x) => (
            <text
              key={x.key}
              className="crossing-sign"
              data-cross={x.num}
              data-sign={x.sign}
              x={2 * x.x - x.label[0]}
              y={2 * x.y - x.label[1]}
            >
              {x.sign > 0 ? '+' : '−'}
            </text>
          ))}
      </g>
      <g>
        {geo.crossings.map((x) => (
          <circle
            key={x.key}
            cx={x.x}
            cy={x.y}
            r={x.radius}
            className={`hit${hot.cross === x.num ? ' on' : ''}`}
            data-cross-key={x.key}
            data-cross={x.num}
            tabIndex={movesOn ? undefined : 0}
            role={movesOn ? undefined : 'button'}
            aria-label={movesOn ? undefined : t('board.crossing', { n: x.num })}
            onClick={(e) => {
              e.stopPropagation();
              if (!movesOn) toggle(x.key);
            }}
            onKeyDown={(e) => {
              if (!movesOn && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                toggle(x.key);
              }
            }}
          />
        ))}
      </g>
    </>
  );
}
