import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { Tabs } from 'radix-ui';
import type { Analysis } from '../core/knot';
import { checkRows, type Action, type Hot, type ReadoutData } from '../state/store';
import { blockLatex, type LatexKind } from '../core/latex';
import { writeClipboard } from '../platform/clipboard';
import { shouldStackMatrices } from './matrix-layout';
import { fmtInt, Polynomial, Xi } from './format';
import { useT } from '../i18n/useT';
import { Tip } from './Tip';
import { reduceModP, type Reduction } from '../core/reduction';
import type { Composition } from '../core/operations';
import { chosenMinor, defaultMinor, isDefaultMinor, type MinorChoice } from '../core/minors';
import type { WorkingDisplay, WorkingKind } from '../core/working';
import { MatrixWorking } from './MatrixWorking';

const zero = (
  <span className="matrix-zero" aria-label="0">
    ·
  </span>
);
function Matrix<T>({
  M,
  D,
  format,
  alex,
  setHot,
  hot = {},
  choice,
  onChoice,
}: {
  M: T[][];
  D: Analysis;
  format: (v: T) => ReactNode;
  alex?: boolean;
  setHot: (h: Hot) => void;
  hot?: Hot;
  choice: MinorChoice;
  onChoice?: (choice: MinorChoice) => void;
}) {
  const t = useT();
  const heading = (content: ReactNode, axis: 'row' | 'column', i: number) =>
    onChoice ? (
      <Tip text={t(axis === 'row' ? 'minor.deleteRow' : 'minor.deleteColumn')}>
        <button
          className="ghost minor-heading"
          {...{ [`data-minor-${axis}`]: i }}
          aria-label={t(axis === 'row' ? 'minor.row' : 'minor.column', { n: i + 1 })}
          aria-pressed={i === choice[axis]}
          onFocus={() => setHot(axis === 'column' ? { arc: i } : D.rows[i] ? { cross: D.rows[i]!.num } : {})}
          onBlur={() => setHot({})}
          onClick={() => onChoice({ ...choice, [axis]: i })}
        >
          {content}
        </button>
      </Tip>
    ) : (
      content
    );
  return (
    <div className="mxwrap">
      <table className="mx" onMouseLeave={() => setHot({})}>
        <thead>
          <tr>
            <th />
            {M.map((_, j) => (
              <th
                key={j}
                className={`${j === choice.column ? 'cut' : ''}${hot.arc === j ? ' hot-column' : ''}`}
                data-arc={j}
                onMouseEnter={() => setHot({ arc: j })}
              >
                {heading(<Xi i={j} />, 'column', j)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {M.map((row, r) => {
            const x = D.rows[r];
            return (
              <tr
                key={r}
                className={`${r === choice.row ? 'cut' : ''}${x && hot.cross === x.num ? ' hot-row' : ''}`}
                data-cross={x?.num}
                onMouseEnter={() => setHot(x ? { cross: x.num } : {})}
              >
                <th onMouseEnter={() => setHot(x ? { cross: x.num } : {})}>
                  {heading(
                    x ? (
                      <>
                        {x.num}
                        {alex && (x.sign > 0 ? ' +' : ' −')}
                      </>
                    ) : (
                      <span title={t('matrix.r1')}>R1</span>
                    ),
                    'row',
                    r,
                  )}
                </th>
                {row.map((v, j) => (
                  <td
                    key={j}
                    className={`${j === choice.column ? 'cut' : ''}${hot.arc === j ? ' hot-column' : ''}`}
                    data-arc={j}
                    onMouseEnter={() => setHot({ arc: j, cross: x?.num })}
                    onMouseLeave={() => setHot(x ? { cross: x.num } : {})}
                  >
                    {format(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
// 14.G: reduced rows are combinations of crossings, so they have no crossing
// hover target. Columns still refer to the original strands.
function ReducedMatrix({
  reduction,
  hot,
  setHot,
}: {
  reduction: Reduction;
  hot: Hot;
  setHot: (h: Hot) => void;
}) {
  return (
    <div className="reduction-body">
      <div className="mxwrap">
        <table className="mx reduction-matrix" onMouseLeave={() => setHot({})}>
          <thead>
            <tr>
              <th />
              {reduction.rref[0]?.map((_, column) => (
                <th
                  key={column}
                  data-arc={column}
                  className={hot.arc === column ? 'hot-column' : ''}
                  onMouseEnter={() => setHot({ arc: column })}
                >
                  <Xi i={column} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reduction.rref.map((row, i) => (
              <tr key={i}>
                <th />
                {row.map((value, column) => (
                  <td
                    key={column}
                    data-arc={column}
                    data-value={value}
                    className={`${reduction.pivots[i] === column ? 'pivot' : ''}${hot.arc === column ? ' hot-column' : ''}`}
                    onMouseEnter={() => setHot({ arc: column })}
                  >
                    {value === 0 ? zero : value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="reduction-lines">
        <span className="m reduction-free">
          {reduction.free.length ? (
            <>
              free:{' '}
              {reduction.free.map((column, i) => (
                <Fragment key={column}>
                  {i > 0 && ', '}
                  <Xi i={column} />
                </Fragment>
              ))}
            </>
          ) : (
            'no free variable'
          )}
        </span>
        {reduction.free.length > 0 &&
          reduction.expressions.map(({ column, terms }) => (
            <span className="m reduction-equation" key={column}>
              <Xi i={column} /> ≡{' '}
              {terms.length
                ? terms.map(({ column: free, coefficient }, i) => (
                    <Fragment key={free}>
                      {i > 0 && ' + '}
                      {coefficient !== 1 && coefficient}
                      <Xi i={free} />
                    </Fragment>
                  ))
                : '0'}
            </span>
          ))}
      </div>
    </div>
  );
}
export function MatrixTabs({
  D,
  data,
  labels,
  p,
  setHot,
  hot = {},
  dispatch,
  showReduction = labels !== null,
  composition,
  minorChoice = defaultMinor(D.nArcs),
  workingKind = 'coloring',
  canChooseMinor = true,
  onWorkingDisplay,
}: {
  D: Analysis;
  data: ReadoutData;
  labels: number[] | null;
  p: number;
  setHot: (h: Hot) => void;
  hot?: Hot;
  dispatch: Dispatch<Action>;
  showReduction?: boolean;
  composition?: Composition | null;
  minorChoice?: MinorChoice;
  workingKind?: WorkingKind;
  canChooseMinor?: boolean;
  onWorkingDisplay?: (display: WorkingDisplay) => void;
}) {
  const t = useT();
  const selectedMinor = useMemo(() => chosenMinor(D, minorChoice), [D, minorChoice.row, minorChoice.column]);
  const onChoice = canChooseMinor ? (choice: MinorChoice) => dispatch({ type: 'minor', choice }) : undefined;
  const defaultChoice = isDefaultMinor(minorChoice, D.nArcs);
  const [expansion, setExpansion] = useState<{ minor: typeof selectedMinor; kind: WorkingKind } | null>(null);
  const workingExpanded = expansion?.minor === selectedMinor && expansion.kind === workingKind;
  const reduction = useMemo(() => (showReduction ? reduceModP(D, p) : null), [D, p, showReduction]);
  const [selected, setSelected] = useState('color');
  const [stacked, setStacked] = useState(false);
  const root = useRef<HTMLElement>(null);
  const measureStack = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const section = root.current,
      side = section?.closest<HTMLElement>('.side');
    if (!section || !side) return;
    const measure = () => {
      // Add scrollTop so scrolling and the chosen matrix layout cannot affect
      // the space available below the unchanged invariants and mod-p blocks.
      const above = section.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop;
      const free =
        side.clientHeight -
        above -
        parseFloat(getComputedStyle(side).paddingBottom) -
        parseFloat(getComputedStyle(section).paddingTop) -
        1;
      const scrolls = getComputedStyle(side).overflowY === 'auto';
      const measuring = measureStack.current;
      if (!measuring) return;
      // Measure independently of the visible tab. Only the first two blocks
      // determine stacking; the others follow below in the scrolling column.
      measuring.style.width = `${section.clientWidth}px`;
      const heights = [...measuring.children].map((block) => block.getBoundingClientRect().height);
      setStacked(
        scrolls &&
          shouldStackMatrices(free, D.nArcs, showReduction, {
            coloring: heights[0],
            reduction: showReduction ? heights[1] : undefined,
            alexander: heights[showReduction ? (labels ? 3 : 2) : labels ? 2 : 1],
          }),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(side);
    observer.observe(section);
    if (measureStack.current) observer.observe(measureStack.current);
    for (const child of side.children) if (child !== section) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [D.nArcs, labels !== null, showReduction, t]);
  const tab =
    (selected === 'check' && !labels) || (selected === 'reduction' && !reduction) ? 'color' : selected;
  useEffect(() => {
    onWorkingDisplay?.({ visible: stacked || tab === 'working', expanded: workingExpanded });
  }, [stacked, tab, workingExpanded, onWorkingDisplay]);
  const copy = (kind: LatexKind) => (
    <Tip text={t('matrix.copyTip')}>
      <button
        className="ghost latex-copy"
        onClick={async () => {
          const text = blockLatex(D, labels, p, kind, showReduction, composition, minorChoice, workingKind);
          if (text === null) return;
          try {
            await writeClipboard(text);
            dispatch({ type: 'status', value: t('status.latexCopied') });
          } catch (error) {
            dispatch({
              type: 'status',
              value: t('status.copyFailure', {
                reason: error instanceof Error ? error.message : String(error),
              }),
            });
          }
        }}
      >
        LaTeX
      </button>
    </Tip>
  );
  // Each block leads with what it yields; the matrix is the working behind it, and the
  // convention it relies on is a tooltip on its name.
  const plainNote = (id: 'matrix.cut' | 'matrix.empty' | 'matrix.check') =>
    t(id, { p }).replace(/\{(\w)\}/g, '$1');
  const blocks: {
    value: string;
    kind: LatexKind;
    name: string;
    note: string;
    result: ReactNode;
    body: ReactNode;
  }[] = [
    {
      value: 'color',
      kind: 'coloring',
      name: 'Coloring matrix',
      note: D.nArcs > 1 ? t('minor.cut') : plainNote('matrix.empty'),
      result: (
        <>
          det <i>A</i>″ = {fmtInt(selectedMinor.detSigned)}
          {selectedMinor.integerNormalizedDiffers && (
            <>
              {' '}
              <span className="via">→</span> det(<i>{D.nComps > 1 ? 'L' : 'K'}</i>) = {String(D.det)}
            </>
          )}
        </>
      ),
      body: (
        <>
          <Matrix
            M={D.A}
            D={D}
            format={(v) => (v === 0n ? zero : fmtInt(v))}
            setHot={setHot}
            hot={hot}
            choice={minorChoice}
            onChoice={onChoice}
          />
          {!defaultChoice && (
            <p className="matrix-sub">
              <span className="m">
                det <i>A</i>″ = det <i>A</i>″<sub>default</sub>
                {selectedMinor.integerRelation === 'negative'
                  ? ' × (−1)'
                  : selectedMinor.integerRelation === 'same'
                    ? ' × 1'
                    : selectedMinor.integerRelation === 'zero'
                      ? ' = 0'
                      : ''}
              </span>
            </p>
          )}
        </>
      ),
    },
    ...(reduction
      ? [
          {
            value: 'reduction',
            kind: 'reduction' as const,
            name: 'Reduction',
            note: t('matrix.reductionNote'),
            result: (
              <span className="reduction-rank">
                rank<sub>{p}</sub> = {reduction.free.length}
              </span>
            ),
            body: <ReducedMatrix reduction={reduction} hot={hot} setHot={setHot} />,
          },
        ]
      : []),
    ...(labels
      ? [
          {
            value: 'check',
            kind: 'check' as const,
            name: 'Check',
            note: plainNote('matrix.check'),
            result: (
              <>
                2<i>x</i> − <i>y</i> − <i>z</i> ≡ 0 <span className="via">(mod {p})</span>
              </>
            ),
            body: (
              <div className="mxwrap">
                <table className="chk" onMouseLeave={() => setHot({})}>
                  <tbody>
                    {checkRows(D, labels).map(({ x, a, b, c, sum }) => (
                      <tr
                        key={x.key}
                        className={hot.cross === x.num ? 'hot-row' : ''}
                        data-cross={x.num}
                        data-sum={sum}
                        onMouseEnter={() => setHot({ cross: x.num })}
                      >
                        <td>{x.num}</td>
                        <td>
                          2<Xi i={x.overArc} /> − <Xi i={x.inArc} /> − <Xi i={x.outArc} />
                        </td>
                        <td>
                          2·{a} − {b} − {c} = {fmtInt(sum)} ≡ 0
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]
      : []),
    {
      value: 'alex',
      kind: 'alexander',
      name: 'Alexander matrix',
      note: t('minor.cut') + '; ' + t('matrix.signs') + (D.nComps > 1 ? t('matrix.link') : ''),
      result:
        composition?.op === 'split' || (selectedMinor.alex !== null && selectedMinor.alexRaw !== null) ? (
          <>
            {composition?.op === 'split' ? (
              <>
                Δ(<i>t</i>) = <Polynomial p={[]} />
              </>
            ) : (
              <>
                det = <Polynomial p={selectedMinor.alexRaw!} />
                {selectedMinor.alexNormalizedDiffers && (
                  <>
                    {' '}
                    <span className="via">→</span> Δ(<i>t</i>) = <Polynomial p={selectedMinor.alex!} />
                  </>
                )}
              </>
            )}
          </>
        ) : (
          '—'
        ),
      body:
        selectedMinor.alex !== null && selectedMinor.alexRaw !== null ? (
          <>
            <Matrix
              M={D.AT}
              D={D}
              format={(v) => (v.every((c) => c === 0n) ? zero : <Polynomial p={v} tight />)}
              alex
              setHot={setHot}
              hot={hot}
              choice={minorChoice}
              onChoice={onChoice}
            />
            <p className="matrix-sub">
              {!defaultChoice && (
                <span className="m">
                  {selectedMinor.alexanderRelation.kind === 'unit' ? (
                    <>
                      det <i>A</i>″ = det <i>A</i>″<sub>default</sub> × (
                      {selectedMinor.alexanderRelation.unit.sign < 0 ? '−' : ''}
                      {selectedMinor.alexanderRelation.unit.power === 0 ? (
                        '1'
                      ) : (
                        <>
                          <i>t</i>
                          {selectedMinor.alexanderRelation.unit.power !== 1 && (
                            <sup>{fmtInt(selectedMinor.alexanderRelation.unit.power)}</sup>
                          )}
                        </>
                      )}
                      )
                    </>
                  ) : selectedMinor.alexanderRelation.kind === 'zero' ? (
                    'det A″ = det A″default = 0'
                  ) : (
                    t('minor.different')
                  )}
                </span>
              )}
              <span className="m">|Δ(−1)| = {String(data.alexAtMinusOne)}</span>
            </p>
          </>
        ) : (
          <p className="quiet">
            {t(composition?.op === 'split' ? 'composition.splitCutoff' : 'matrix.limit')}
          </p>
        ),
    },
    {
      value: 'working',
      kind: 'working',
      name: 'Working',
      note: t('working.tip'),
      result: (
        <>
          det <i>A</i>″ ={' '}
          {workingKind === 'coloring' ? (
            fmtInt(selectedMinor.detSigned)
          ) : selectedMinor.alexRaw === null ? (
            '—'
          ) : (
            <Polynomial p={selectedMinor.alexRaw} />
          )}
        </>
      ),
      body: (
        <MatrixWorking
          minor={selectedMinor}
          kind={workingKind}
          onKind={(kind) => dispatch({ type: 'working-matrix', kind })}
          expanded={workingExpanded}
          onExpandedChange={(expanded) =>
            setExpansion(expanded ? { minor: selectedMinor, kind: workingKind } : null)
          }
        />
      ),
    },
  ];
  return (
    <section ref={root} className="matrices" data-layout={stacked ? 'stacked' : 'tabs'}>
      {stacked ? (
        <div className="matrix-stack">
          {blocks.map((block) => (
            <div key={block.value} className="matrix-section" data-kind={block.kind}>
              <div className="matrix-heading">
                <h2>
                  <Tip text={block.note}>
                    <span className="term" tabIndex={0}>
                      {block.name}
                    </span>
                  </Tip>
                </h2>
                {copy(block.kind)}
                <span className="m matrix-result">{block.result}</span>
              </div>
              <div className="block matrix-block">{block.body}</div>
            </div>
          ))}
        </div>
      ) : (
        <Tabs.Root
          value={tab}
          onValueChange={(v) => {
            setHot({});
            setSelected(v);
          }}
        >
          <div className="matrix-tab-row">
            <Tabs.List className="tabs" aria-label={t('matrix.label')}>
              {blocks.map((block) => {
                const trigger = (
                  <Tabs.Trigger key={block.value} className="tab" value={block.value}>
                    {block.name.replace(/ matrix$/, '')}
                    {/* dropped when the column is too narrow for the full names */}
                    {block.name.endsWith(' matrix') && <span className="tab-more"> matrix</span>}
                  </Tabs.Trigger>
                );
                return block.kind === 'working' ? (
                  <Tip key={block.value} text={block.note}>
                    {trigger}
                  </Tip>
                ) : (
                  trigger
                );
              })}
            </Tabs.List>
          </div>
          {blocks.map((block) => (
            <Tabs.Content
              key={block.value}
              className="block matrix-block"
              data-kind={block.kind}
              value={block.value}
            >
              <div className="matrix-panel-head">
                <Tip text={block.note}>
                  <p className="m matrix-result term" tabIndex={0}>
                    {block.result}
                  </p>
                </Tip>
                {copy(block.kind)}
              </div>
              {block.body}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      )}
      <div ref={measureStack} className="matrix-stack matrix-measure" aria-hidden="true" inert>
        {blocks
          .filter((block) => block.kind !== 'working')
          .map((block) => (
            <div key={block.value} className="matrix-section">
              <div className="matrix-measure-heading">
                <h2>{block.name}</h2>
                <span className="m matrix-result">{block.result}</span>
              </div>
              <div className="block matrix-block">{block.body}</div>
            </div>
          ))}
      </div>
    </section>
  );
}
