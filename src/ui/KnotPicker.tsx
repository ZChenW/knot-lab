import { useT } from '../i18n/useT';
import { Select, Tooltip } from 'radix-ui';
import { Fragment, useRef, useState } from 'react';
import type { PresetKey } from '../core/knot';
import type { Family, FamilyKind } from '../core/families';
import { compositionOperands, type Composition, type CompositionOp } from '../core/operations';
import { Tip } from './Tip';
import { BAND_EXAMPLES, BAND_PAIRS, type BandSelection } from '../core/band-examples';
import { TRIANGLE_EXAMPLES, type TriangleExample } from '../core/triangle-examples';
import type { TriangleDocument, BandDocument } from '../state/store';
export const examples: {
  key: PresetKey;
  name: string;
  base: string;
  index: string;
  power?: string;
  sum?: 'granny' | 'square';
  group: 'Knots' | 'Links';
}[] = [
  { key: 'unknot', name: 'Unknot', base: '0', index: '1', group: 'Knots' },
  { key: 'trefoilR', name: 'Right-handed trefoil', base: '3', index: '1', group: 'Knots' },
  { key: 'trefoilL', name: 'Left-handed trefoil', base: '3', index: '1', group: 'Knots' },
  { key: 'fig8', name: 'Figure-eight', base: '4', index: '1', group: 'Knots' },
  { key: 'k51', name: 'Cinquefoil', base: '5', index: '1', group: 'Knots' },
  { key: 'k52', name: 'Three-twist knot', base: '5', index: '2', group: 'Knots' },
  { key: 'k61', name: 'Stevedore knot', base: '6', index: '1', group: 'Knots' },
  { key: 'k71', name: 'Septafoil', base: '7', index: '1', group: 'Knots' },
  { key: 'k819', name: 'Torus knot T(3,4)', base: '8', index: '19', group: 'Knots' },
  { key: 'granny', name: 'Granny knot', base: '3', index: '1', sum: 'granny', group: 'Knots' },
  { key: 'square', name: 'Square knot', base: '3', index: '1', sum: 'square', group: 'Knots' },
  { key: 'unlink', name: 'Unlink', base: '0', index: '1', power: '2', group: 'Links' },
  { key: 'hopf', name: 'Hopf link', base: '2', index: '1', power: '2', group: 'Links' },
  { key: 'whitehead', name: 'Whitehead link', base: '5', index: '1', power: '2', group: 'Links' },
  { key: 'borromean', name: 'Borromean rings', base: '6', index: '2', power: '3', group: 'Links' },
];
function Symbol({ example: e }: { example: (typeof examples)[number] }) {
  return (
    <span className="knot-symbol">
      {e.base}
      {e.power ? (
        <span className="symbol-stack">
          <sup>{e.power}</sup>
          <sub>{e.index}</sub>
        </span>
      ) : (
        <sub>{e.index}</sub>
      )}
      {e.sum && (
        <>
          {' '}
          # 3<sub>1</sub>
          {e.sum === 'square' && <sup>m</sup>}
        </>
      )}
    </span>
  );
}
export const familyTitle = (family: Family, components: number) =>
  family.kind === 'sum'
    ? 'Connected sum'
    : family.kind === 'twist'
      ? 'Twist knot'
      : `${family.kind === 'torus' ? 'Torus' : 'Pretzel'} ${components === 1 ? 'knot' : 'link'}`;
export function compositionTitle(composition: Composition): string {
  const sub = (s: string) => s.replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
  const sup = (s: string) => s.replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return compositionOperands(composition)
    .map((operand) => {
      const e = examples.find((e) => e.key === operand.preset);
      const symbol = e
        ? `${e.base}${sub(e.index)}${e.power ? sup(e.power) : ''}${e.sum ? ` # 3₁${e.sum === 'square' ? 'ᵐ' : ''}` : ''}`
        : operand.placeholder;
      return `${operand.separator ? (operand.separator === 'sum' ? ' # ' : ' ⊔ ') : ''}${symbol}`;
    })
    .join('');
}
export function compositionNames(composition: Composition): string {
  return compositionOperands(composition)
    .map(
      (operand) =>
        `${operand.separator ? (operand.separator === 'sum' ? ' # ' : ' ⊔ ') : ''}${examples.find((e) => e.key === operand.preset)?.name ?? operand.placeholder}`,
    )
    .join('');
}
export function KnotPicker({
  value,
  onChange,
  family,
  components = 1,
  onFamily,
  composition,
  onCombine,
  bandBoard,
  onBand,
  triangleBoard,
  onTriangle,
}: {
  value: PresetKey | '';
  triangleBoard?: TriangleDocument | null;
  onTriangle?: (key: TriangleExample | '') => void;
  bandBoard?: BandDocument | null;
  onBand?: (key: BandSelection | '') => void;
  onChange: (key: PresetKey) => void;
  family?: Family | null;
  components?: number;
  onFamily?: (kind: FamilyKind) => void;
  composition?: Composition | null;
  onCombine?: (op: CompositionOp, entry: { preset: PresetKey } | { kind: FamilyKind }) => void;
}) {
  const t = useT();
  const example = examples.find((e) => e.key === value);
  const [open, setOpen] = useState(false);
  const [combine, setCombine] = useState<CompositionOp | null>(null);
  const [rowTooltip, setRowTooltip] = useState<CompositionOp | null>(null);
  const [keyboardTooltip, setKeyboardTooltip] = useState<CompositionOp | null>(null);
  const pointerFocus = useRef(false);
  // Selecting a navigation row changes the level in this same Radix Select;
  // suppress only that selection's close, retaining Escape/outside dismissal.
  const navigating = useRef(false);
  const prefix = combine ? 'operand:' : '';
  const operands = composition ? compositionOperands(composition) : [];
  const trigger = (
    <Select.Trigger
      className={`pick${composition ? ' composition-pick' : ''}`}
      aria-label={t('picker.label')}
    >
      <Select.Value placeholder="Your drawing">
        {triangleBoard ? (
          t(triangleBoard.example ? `tri.${triangleBoard.example}` : 'tri.custom')
        ) : bandBoard ? (
          t(bandBoard.example ? `bands.${bandBoard.example}` : 'bands.custom')
        ) : composition ? (
          <span className="composition-title">
            {operands.slice(0, 3).map((operand, i) => {
              const e = examples.find((e) => e.key === operand.preset);
              return (
                <Fragment key={i}>
                  {operand.separator && (operand.separator === 'sum' ? ' # ' : ' ⊔ ')}
                  {e ? <Symbol example={e} /> : <i>{operand.placeholder}</i>}
                </Fragment>
              );
            })}
            {operands.length > 3 && ' …'}
          </span>
        ) : family ? (
          familyTitle(family, components)
        ) : example ? (
          <>
            <span>{example.name}</span>
            <Symbol example={example} />
          </>
        ) : (
          'Your drawing'
        )}
      </Select.Value>
      <Select.Icon asChild>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5.5l4 4 4-4" />
        </svg>
      </Select.Icon>
    </Select.Trigger>
  );
  return (
    <Select.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && navigating.current) {
          navigating.current = false;
          return;
        }
        setOpen(next);
        if (!next) {
          setCombine(null);
          setRowTooltip(null);
          setKeyboardTooltip(null);
        }
      }}
      value={
        triangleBoard
          ? `triangle:${triangleBoard.example}`
          : bandBoard
            ? `band:${bandBoard.example}`
            : composition
              ? 'composition'
              : family
                ? `family:${family.kind}`
                : value
      }
      onValueChange={(key) => {
        if (key.startsWith('triangle:')) {
          onTriangle?.(key.slice(9) as TriangleExample | '');
          return;
        }
        if (key.startsWith('band:')) {
          onBand?.(key.slice(5) as BandSelection | '');
          return;
        }
        if (key.startsWith('combine:') || key === 'back') {
          if (components === 0) return;
          setRowTooltip(null);
          setKeyboardTooltip(null);
          navigating.current = true;
          setCombine(key === 'back' ? null : (key.slice(8) as CompositionOp));
          return;
        }
        const selected = key.replace(/^operand:/, '');
        if (combine)
          onCombine?.(
            combine,
            selected.startsWith('family:')
              ? { kind: selected.slice(7) as FamilyKind }
              : { preset: selected as PresetKey },
          );
        else if (selected.startsWith('family:')) onFamily?.(selected.slice(7) as FamilyKind);
        else onChange(selected as PresetKey);
      }}
    >
      {composition ? <Tip text={compositionNames(composition)}>{trigger}</Tip> : trigger}
      <Select.Portal>
        <Select.Content
          className="picker-menu"
          key={combine ?? 'examples'}
          data-level={combine ? 'combine' : 'examples'}
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerMoveCapture={() => {
            pointerFocus.current = true;
            setKeyboardTooltip(null);
          }}
          onKeyDownCapture={() => {
            pointerFocus.current = false;
          }}
        >
          <Select.Viewport className="picker-viewport">
            {combine && (
              <Select.Group>
                <Select.Label className="picker-label">{t(`composition.${combine}`)}</Select.Label>
                <Select.Item className="picker-item" value="back" textValue={t('composition.back')}>
                  <Select.ItemText>‹ {t('composition.back')}</Select.ItemText>
                </Select.Item>
              </Select.Group>
            )}
            {(['Knots', 'Links'] as const).map((group) => (
              <Select.Group key={group}>
                <Select.Label className="picker-label">{group}</Select.Label>
                {examples
                  .filter((e) => e.group === group)
                  .map((e) => (
                    <Select.Item
                      className="picker-item"
                      key={e.key}
                      value={`${prefix}${e.key}`}
                      textValue={e.name}
                    >
                      <Select.ItemText>{e.name}</Select.ItemText>
                      <Select.ItemIndicator className="picker-check">
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                          <path d="M3 7l2.5 2.5L11 4" />
                        </svg>
                      </Select.ItemIndicator>
                      <Symbol example={e} />
                    </Select.Item>
                  ))}
              </Select.Group>
            ))}
            <Select.Group>
              <Select.Label className="picker-label">Families</Select.Label>
              {(
                [
                  ['torus', 'Torus T(p, q)'],
                  ['twist', 'Twist knot'],
                  ['pretzel', 'Pretzel P(a, b, …)'],
                  ['sum', 'Connected sum Kₙ'],
                ] as const
              ).map(([kind, name]) => (
                <Select.Item
                  className="picker-item"
                  key={kind}
                  value={`${prefix}family:${kind}`}
                  textValue={name}
                >
                  <Select.ItemText>{name}</Select.ItemText>
                  <Select.ItemIndicator className="picker-check">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M3 7l2.5 2.5L11 4" />
                    </svg>
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Group>
            {!combine && (
              <Select.Group>
                <Select.Label className="picker-label">{t('composition.combine')}</Select.Label>
                {(['sum', 'split'] as const).map((op) => (
                  <Tooltip.Root
                    key={op}
                    open={rowTooltip === op || keyboardTooltip === op}
                    onOpenChange={(next) =>
                      setRowTooltip((current) => (next ? op : current === op ? null : current))
                    }
                  >
                    <Select.Item asChild value={`combine:${op}`} textValue={t(`composition.${op}`)}>
                      <Tooltip.Trigger asChild>
                        <div
                          className="picker-item"
                          data-combine-op={op}
                          aria-disabled={components === 0}
                          // Select focuses after scrolling. Tooltip's ensuing
                          // scroll dismissal must not hide a keyboard explanation.
                          onFocus={() => {
                            if (!pointerFocus.current) setKeyboardTooltip(op);
                          }}
                          onBlur={() => {
                            setKeyboardTooltip((current) => (current === op ? null : current));
                            setRowTooltip((current) => (current === op ? null : current));
                          }}
                          onPointerDown={() => {
                            pointerFocus.current = true;
                            setKeyboardTooltip(null);
                            setRowTooltip(null);
                          }}
                          onPointerUp={(e) => {
                            if (!components) e.preventDefault();
                          }}
                          onClick={(e) => {
                            if (!components) e.preventDefault();
                          }}
                          onKeyDown={(e) => {
                            if (!components && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
                          }}
                        >
                          <Select.ItemText>{t(`composition.${op}`)}</Select.ItemText>
                          <span className="combine-chevron" aria-hidden="true">
                            ›
                          </span>
                        </div>
                      </Tooltip.Trigger>
                    </Select.Item>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="tooltip"
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        collisionPadding={12}
                        onEscapeKeyDown={() => {
                          setKeyboardTooltip(null);
                          setRowTooltip(null);
                          setOpen(false);
                        }}
                      >
                        {t(components ? `composition.${op}` : 'composition.empty')}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ))}
              </Select.Group>
            )}
            {!combine && onBand && (
              <Select.Group>
                <Select.Label className="picker-label">{t('bands.menu')}</Select.Label>
                {(['', ...BAND_EXAMPLES, ...BAND_PAIRS] as const).map((key) => (
                  <Select.Item
                    className="picker-item"
                    key={key}
                    value={`band:${key}`}
                    textValue={t(key ? `bands.${key}` : 'bands.custom')}
                  >
                    <Select.ItemText>{t(key ? `bands.${key}` : 'bands.custom')}</Select.ItemText>
                    <Select.ItemIndicator className="picker-check">
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M3 7l2.5 2.5L11 4" />
                      </svg>
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
                {onTriangle && (
                  <>
                    <Select.Label className="picker-label">{t('tri.menu')}</Select.Label>
                    {(['', ...TRIANGLE_EXAMPLES] as const).map((key) => (
                      <Select.Item
                        className="picker-item"
                        key={`tri:${key}`}
                        value={`triangle:${key}`}
                        textValue={t(key ? `tri.${key}` : 'tri.custom')}
                      >
                        <Select.ItemText>{t(key ? `tri.${key}` : 'tri.custom')}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </>
                )}
              </Select.Group>
            )}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
