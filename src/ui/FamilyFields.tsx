import { useId, useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { validFamily, type Family } from '../core/families';
import type { Action } from '../state/store';
import { useT } from '../i18n/useT';
import { Tip } from './Tip';
import { Select } from 'radix-ui';

export function FamilyFields({ family, dispatch }: { family: Family; dispatch: Dispatch<Action> }) {
  const t = useT(),
    errorId = useId();
  const [draft, setDraft] = useState({ params: family.params, values: family.params.map(String) });
  const [focused, setFocused] = useState<number | null | undefined>(undefined);
  // 14.H: only consecutive changes from this focus share an undo snapshot.
  const edit = useRef<string | null>(null);
  const signature = `${family.kind}:${family.params.join()}`;
  // Apply interactive display formatting before paint; static markup keeps the numeric text.
  useLayoutEffect(() => setFocused(null), []);
  let values = draft.values;
  if (draft.params.join() !== family.params.join()) {
    values = family.params.map(String);
    setDraft({ params: family.params, values });
  }
  const numbers = values.map((s) =>
    /^[+-]?\d+$/.test(s.replace(/−/g, '-')) ? Number(s.replace(/−/g, '-')) : NaN,
  );
  const valid = validFamily({ kind: family.kind, params: numbers });
  const names =
    family.kind === 'torus'
      ? ['p', 'q']
      : family.kind === 'twist'
        ? ['n']
        : family.kind === 'sum'
          ? ['kind', 'n']
          : ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, values.length);
  const invalid = (i: number) => {
    const n = numbers[i];
    if (!Number.isSafeInteger(n)) return true;
    if (family.kind === 'twist') return n < 0 || n > 30;
    if (family.kind === 'sum') return i === 0 ? n !== 0 && n !== 1 : n < 1 || n > 6;
    if (family.kind === 'pretzel')
      return Math.abs(n) > 15 || numbers.reduce((sum, x) => sum + Math.abs(x), 0) > 60;
    return (
      (i === 0 ? n < 1 : Math.abs(n) < 1) ||
      Math.min(numbers[0] * (Math.abs(numbers[1]) - 1), Math.abs(numbers[1]) * (numbers[0] - 1)) > 60
    );
  };
  const columns = (delta: 1 | -1) => {
    const next = delta === 1 ? [...values, '1'] : values.slice(0, -1);
    if (next.length < 2 || next.length > 6) return;
    const params = next.map((s) =>
      /^[+-]?\d+$/.test(s.replace(/−/g, '-')) ? Number(s.replace(/−/g, '-')) : NaN,
    );
    edit.current = null;
    const candidate = { kind: family.kind, params };
    setDraft({ params: family.params, values: next });
    if (validFamily(candidate) && params.join() !== family.params.join())
      dispatch({ type: 'family', family: candidate });
  };
  return (
    <div className="family-parameters">
      <div className="family-notation">
        {family.kind === 'sum' ? (
          <>
            <i>K</i>
            <sub>n</sub> ={' '}
          </>
        ) : family.kind === 'twist' ? (
          <>
            <i>n</i> ={' '}
          </>
        ) : (
          <>{family.kind === 'torus' ? 'T' : 'P'}(</>
        )}
        {names.map((name, i) => {
          if (family.kind === 'sum' && i === 0)
            return (
              <Select.Root
                key={name}
                value={String(family.params[0])}
                onValueChange={(value) => {
                  edit.current = null;
                  const params = [Number(value), family.params[1]];
                  setDraft({ params, values: params.map(String) });
                  dispatch({ type: 'family', family: { kind: 'sum', params } });
                }}
              >
                <Select.Trigger className="ghost family-kind" aria-label={t('family.sumKind')}>
                  <Select.Value>{family.params[0] === 0 ? 'Trefoil' : 'Figure-eight'}</Select.Value>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content
                    className="picker-menu"
                    position="popper"
                    sideOffset={6}
                    collisionPadding={12}
                  >
                    <Select.Viewport>
                      {['Trefoil', 'Figure-eight'].map((label, index) => (
                        <Select.Item
                          key={label}
                          className="picker-item"
                          value={String(index)}
                          textValue={label}
                        >
                          <Select.ItemText>{label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            );
          const value = focused === undefined || focused === i ? values[i] : values[i].replace(/^-/, '−');
          return (
            <span key={name}>
              {i > 0 &&
                (family.kind === 'sum' ? (
                  <>
                    , <i>n</i> ={' '}
                  </>
                ) : (
                  ', '
                ))}
              <input
                className="p-field family-field"
                type="text"
                inputMode="text"
                size={Math.max(1, value.length)}
                style={{ width: `calc(${value.length}ch + 0.5em)` }}
                aria-label={t('family.parameter', { name })}
                aria-invalid={invalid(i)}
                aria-describedby={!valid ? errorId : undefined}
                value={value}
                onFocus={() => {
                  edit.current = null;
                  setFocused(i);
                }}
                onBlur={() => {
                  edit.current = null;
                  setFocused(null);
                }}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = e.target.value;
                  const params = next.map((s) =>
                    /^[+-]?\d+$/.test(s.replace(/−/g, '-')) ? Number(s.replace(/−/g, '-')) : NaN,
                  );
                  const candidate = { kind: family.kind, params };
                  if (validFamily(candidate)) {
                    setDraft({ params, values: next });
                    if (params.join() !== family.params.join()) {
                      dispatch({ type: 'family', family: candidate, coalesce: edit.current === signature });
                      edit.current = `${family.kind}:${params.join()}`;
                    }
                  } else setDraft({ params: family.params, values: next });
                }}
              />
            </span>
          );
        })}
        {family.kind !== 'twist' && family.kind !== 'sum' && ')'}
        {family.kind === 'pretzel' && (
          <span className="family-columns">
            <Tip text={t('family.addColumn')}>
              <button
                className="ghost"
                aria-label={t('family.addColumn')}
                aria-disabled={values.length === 6}
                onClick={() => values.length < 6 && columns(1)}
              >
                +
              </button>
            </Tip>
            <Tip text={t('family.removeColumn')}>
              <button
                className="ghost"
                aria-label={t('family.removeColumn')}
                aria-disabled={values.length === 2}
                onClick={() => values.length > 2 && columns(-1)}
              >
                −
              </button>
            </Tip>
          </span>
        )}
      </div>
      {!valid && (
        <p className="family-error" id={errorId} role="status">
          {t(
            family.kind === 'pretzel'
              ? 'family.boundaryPretzelInvalid'
              : family.kind === 'torus'
                ? 'family.boundaryTorusInvalid'
                : family.kind === 'twist'
                  ? 'family.boundaryTwistInvalid'
                  : 'family.sumInvalid',
          )}
        </p>
      )}
    </div>
  );
}
