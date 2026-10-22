import { useT } from '../i18n/useT';
import { useMemo, type Dispatch } from 'react';
import type { Analysis, PInfo } from '../core/knot';
import { selectReadout, selectReadoutState, type Action, type Hot, type State } from '../state/store';
import { KnotPicker } from './KnotPicker';
import { TriangleReadout } from './TriangleReadout';
import { BandReadout } from './BandReadout';
import { FamilyFields } from './FamilyFields';
import { FAMILY_DEFAULTS } from '../core/families';
import { Invariants } from './Invariants';
import { ModP } from './ModP';
import { MatrixTabs } from './MatrixTabs';
import { MoveBlock } from './MoveBlock';
import type { MoveComparison } from '../core/compare';
import { sub } from './format';
import { Versus } from './Versus';
import { Seifert } from './Seifert';
import type { SeifertNumbers } from '../core/seifert';
import type { WorkingDisplay } from '../core/working';
export function Readout({
  state,
  D,
  info,
  labels,
  dispatch,
  setHot,
  hot = {},
  pinnedSigns,
  pinSigns,
  moveComparison,
  onWorkingDisplay,
  surface,
}: {
  state: State;
  D: Analysis;
  info: PInfo | null;
  labels: number[] | null;
  dispatch: Dispatch<Action>;
  setHot: (h: Hot) => void;
  hot?: Hot;
  pinnedSigns?: Hot['signs'];
  pinSigns?: (signs: NonNullable<Hot['signs']>) => void;
  moveComparison?: MoveComparison | null;
  onWorkingDisplay?: (display: WorkingDisplay) => void;
  surface?: SeifertNumbers | null;
}) {
  const t = useT();
  const view = useMemo(() => selectReadoutState(state), [state]);
  const data = useMemo(() => selectReadout(D, view.p, view.family), [D, view.p, view.family]);
  const n = D.crossings.length;
  const meta = [
    D.nComps === 1 ? 'Knot' : `${D.nComps}-component link`,
    `${n} ${n === 1 ? 'crossing' : 'crossings'}`,
    D.alternating ? 'alternating diagram' : 'non-alternating diagram',
  ]
    .filter(Boolean)
    .join(' · ');
  if (state.triangleBoard) return <TriangleReadout state={state} dispatch={dispatch} setHot={setHot} />;
  if (state.bandBoard) return <BandReadout state={state} dispatch={dispatch} setHot={setHot} />;
  return (
    <aside
      className="side"
      aria-label={t('readout.label')}
      onMouseOver={(e) => {
        if (!(e.target instanceof Element)) return;
        const arc = e.target.closest<HTMLElement>('[data-arc]')?.dataset.arc;
        const cross = e.target.closest<HTMLElement>('[data-cross]')?.dataset.cross;
        const signs = e.target.closest<HTMLElement>('[data-signs]')?.dataset.signs;
        const surface = e.target.closest<HTMLElement>('[data-surface-hover]')?.dataset
          .surfaceHover as Hot['surface'];
        setHot({
          ...(surface ? { surface } : {}),
          ...(signs
            ? {
                signs:
                  signs === 'all' || signs === 'between'
                    ? signs
                    : (signs.split(',').map(Number) as [number, number]),
              }
            : {}),
          ...(arc !== undefined ? { arc: Number(arc) } : {}),
          ...(cross !== undefined ? { cross: Number(cross) } : {}),
        });
      }}
      onMouseLeave={() => setHot({})}
    >
      {state.versus && !state.versus.diagram.triangleBoard && !state.versus.diagram.bandBoard && (
        <Versus state={state} dispatch={dispatch} />
      )}
      <header className="head">
        <KnotPicker
          value={state.preset}
          onTriangle={(key) => {
            setHot({});
            dispatch({ type: 'triangle-example', key });
          }}
          onBand={(key) => {
            setHot({});
            dispatch({ type: 'band-example', key });
          }}
          family={state.family}
          composition={state.composition}
          components={state.comps.length}
          onCombine={(op, entry) => {
            setHot({});
            dispatch({
              type: 'combine',
              op,
              operand:
                'preset' in entry
                  ? entry
                  : { family: { kind: entry.kind, params: state.familyParams[entry.kind] } },
            });
          }}
          onFamily={(kind) => {
            setHot({});
            dispatch({ type: 'family', family: { kind, params: FAMILY_DEFAULTS[kind] } });
          }}
          onChange={(key) => {
            setHot({});
            dispatch({ type: 'preset', key });
          }}
        />
        {state.alone === null && state.family && (
          <FamilyFields key={state.family.kind} family={state.family} dispatch={dispatch} />
        )}
        <p className="meta">
          {state.alone !== null
            ? `K${sub(state.alone + 1)} alone · ${n} ${n === 1 ? 'crossing' : 'crossings'}`
            : state.comps.length
              ? meta
              : t('readout.hint')}
        </p>
      </header>
      {state.comps.length > 0 && (
        <>
          {moveComparison && <MoveBlock comparison={moveComparison} p={state.p} />}
          <Invariants
            D={D}
            data={data}
            composition={view.composition}
            setHot={setHot}
            pinnedSigns={pinnedSigns}
            pinSigns={pinSigns}
          />
          {surface && <Seifert surface={surface} dispatch={dispatch} setHot={setHot} />}
          <ModP
            state={view}
            D={D}
            data={data}
            info={info}
            labels={labels}
            dispatch={dispatch}
            setHot={setHot}
            hot={hot}
          />
          <MatrixTabs
            D={D}
            data={data}
            labels={labels}
            p={view.p}
            setHot={setHot}
            hot={hot}
            dispatch={dispatch}
            showReduction={!!info && (info.colorable || view.tryP !== '')}
            composition={view.composition}
            minorChoice={view.minor}
            workingKind={view.workingMatrix}
            canChooseMinor={state.alone === null}
            onWorkingDisplay={onWorkingDisplay}
          />
        </>
      )}
    </aside>
  );
}
