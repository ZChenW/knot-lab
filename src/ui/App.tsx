import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Tooltip } from 'radix-ui';
import {
  createInitialState,
  reducer,
  selectAnalysis,
  selectLabels,
  selectReadout,
  selectReadoutState,
  checkRows,
  type Hot,
  type Action,
} from '../state/store';
import { TriangleStage } from './TriangleStage';
import { analyse as analyseNet, type Triangulation, type Net } from '../core/triangulation';
import type { TriangleExample } from '../core/triangle-examples';
import { triangulationLatex } from '../core/triangle-readout';
import { BandStage } from './BandStage';
import { bandSurface, type BandNumbers, type BandSurface } from '../core/bands';
import type { BandSelection } from '../core/band-examples';
import { bandsLatex } from '../core/band-readout';
import { Stage, type MovePreview } from './Stage';
import { analyzeDiagram } from '../core/knot';
import { availableMoves, applyMove, gaussCode, type AvailableMove, type GaussCode } from '../core/moves';
import { compareAnalyses, type MoveComparison } from '../core/compare';
import { ComparePanes } from './ComparePanes';
import { Readout } from './Readout';
import { useVersus } from './Versus';
import { parse, serialize } from '../core/file';
import { exportSVG } from '../core/export';
// 14.I
import { sheetSVG } from '../core/sheet';
import { isDesktop, openImage, openText, saveText, writeText, saveBytes, setTitle } from '../platform/files';
import { blobDataURL, exportFonts, rasterize } from './export';
import { compositionTitle, examples, familyTitle } from './KnotPicker';
import { familyFileName } from '../core/families';
import { createSessionWriter, sessionStorage } from '../state/session';
import type { FileActions } from './FileMenu';
import { getLang, setLang, subscribe, t, type Lang } from '../i18n';
import { blockLatex, seifertLatex, type LatexKind } from '../core/latex';
import { SideDivider, useSideWidth } from './SideDivider';
import { componentCorrespondence } from '../core/components';
import { seifertSurface, seifertNumbers, type SeifertNumbers } from '../core/seifert';
import type { WorkingDisplay } from '../core/working';

export interface KnotLabHook {
  readonly language: Lang;
  setLanguage: (lang: Lang) => void;
  serialize: () => string;
  load: (text: string) => void;
  exportSVG: () => string;
  exportPNG: () => Promise<string>;
  // 14.I
  exportSheetSVG: () => string;
  exportSheetPNG: () => Promise<string>;
  triangulation: () => Triangulation | null;
  triangleDocument: () => Net | null;
  selectTriangleExample: (key: TriangleExample | '') => void;
  bands: () => BandNumbers | null;
  bandDocument: () => BandSurface | null;
  selectBandExample: (key: BandSelection | '') => void;
  latex: (kind: LatexKind | 'bands' | 'triangulation') => string | null;
  // 18.P
  moves: () => AvailableMove[];
  applyMove: (index: number) => boolean;
  gaussCode: () => GaussCode;
  seifert: () => SeifertNumbers;
}
declare global {
  interface Window {
    knotLab: KnotLabHook;
  }
}
export function App() {
  const side = useSideWidth();
  const [state, reduce] = useReducer(reducer, undefined, () => createInitialState());
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [currentFile, setCurrentFile] = useState<{ name: string; path: string; saved: string } | null>(null);
  const dispatch = useCallback((action: Action) => {
    if (
      isDesktop &&
      (action.type === 'preset' ||
        action.type === 'family' ||
        action.type === 'band-example' ||
        action.type === 'triangle-example')
    )
      setCurrentFile(null);
    reduce(action);
  }, []);
  const [hot, updateHot] = useState<Hot>({});
  const [workingDisplay, setWorkingDisplay] = useState<WorkingDisplay>({ visible: false, expanded: false });
  // 14.G: pins live only in this mount. Track pair identity through deletion
  // and reindexing, rather than accidentally pinning a different pair.
  const [signPin, setSignPin] = useState<{
    signs: NonNullable<Hot['signs']>;
    pairIds?: [number | undefined, number | undefined];
  } | null>(null);
  const pinnedSigns = useMemo(() => {
    if (!signPin) return undefined;
    if (!signPin.pairIds) return signPin.signs;
    const pair = signPin.pairIds.map((id) => state.comps.findIndex((c) => c.id === id));
    return pair.every((i) => i >= 0) ? (pair as [number, number]) : undefined;
  }, [signPin, state.comps]);
  useEffect(() => {
    if (signPin && pinnedSigns === undefined) setSignPin(null);
  }, [signPin, pinnedSigns]);
  const pinSigns = (signs: NonNullable<Hot['signs']>) =>
    setSignPin(
      String(signs) === String(pinnedSigns)
        ? null
        : {
            signs,
            ...(Array.isArray(signs)
              ? {
                  pairIds: [state.comps[signs[0]]?.id, state.comps[signs[1]]?.id] as [
                    number | undefined,
                    number | undefined,
                  ],
                }
              : {}),
          },
    );
  const boardHot = useMemo(() => ({ ...hot, signs: hot.signs ?? pinnedSigns }), [hot, pinnedSigns]);
  // 13.D: pointer movement along the same strand does not render the readout again.
  const setHot = useCallback(
    (next: Hot) =>
      updateHot((prev) =>
        prev.arc === next.arc &&
        String(prev.arcs) === String(next.arcs) &&
        prev.cross === next.cross &&
        prev.comp === next.comp &&
        prev.surface === next.surface &&
        prev.triangleBoundary === next.triangleBoundary &&
        prev.trianglePoint === next.trianglePoint &&
        String(prev.trianglePoints) === String(next.trianglePoints) &&
        String(prev.triangleIds) === String(next.triangleIds) &&
        String(prev.triangleEdges) === String(next.triangleEdges) &&
        prev.bandBoundary === next.bandBoundary &&
        String(prev.bandIds) === String(next.bandIds) &&
        String(prev.signs) === String(next.signs)
          ? prev
          : next,
      ),
    [],
  );
  const D = useMemo(() => selectAnalysis(state), [state.comps, state.over]);
  const moveComparison = useMemo<MoveComparison | null>(() => {
    if (
      movePreview &&
      state.movesOn &&
      movePreview.before.comps === state.comps &&
      movePreview.before.over === state.over
    ) {
      const after = analyzeDiagram(movePreview.result.diagram);
      return {
        kind: movePreview.result.kind,
        sign: movePreview.result.sign,
        before: D,
        after,
        rows: compareAnalyses(D, after, state.p),
        ...(movePreview.result.distant ? { distant: true } : {}),
      };
    }
    if (!state.lastMove) return null;
    const before = selectAnalysis(state.lastMove.before);
    return {
      kind: state.lastMove.kind,
      sign: state.lastMove.sign,
      before,
      after: D,
      rows: compareAnalyses(before, D, state.p),
    };
  }, [movePreview, state.movesOn, state.comps, state.over, state.lastMove, state.p, D]);
  // 19.A
  const versusData = useVersus(state);
  const { labels } = useMemo(
    () => selectLabels(state, D),
    [state.p, state.tryP, state.coeffs, state.shift, state.comps, D],
  );
  // 19.C: the board keeps the entire link; only the readout uses the projection.
  const readoutState = useMemo(() => selectReadoutState(state), [state]);
  const readoutD = useMemo(() => selectAnalysis(readoutState), [readoutState.comps, readoutState.over]);
  const readoutLabels = useMemo(() => selectLabels(readoutState, readoutD), [readoutState, readoutD]);
  const surface = useMemo(
    () => (state.surfaceOn && !state.bandBoard && !state.triangleBoard ? seifertSurface(readoutState) : null),
    [state.surfaceOn, readoutState.comps, readoutState.over, state.bandBoard, state.triangleBoard],
  );
  const correspondence = useMemo(
    () =>
      state.alone === null
        ? null
        : componentCorrespondence(D, readoutD, state.alone, state.comps[state.alone].pts.length),
    [D, readoutD, state.alone, state.comps],
  );
  const readoutHot: Hot = correspondence
    ? {
        ...hot,
        arc:
          (hot.arc ?? hot.arcs?.[0]) === undefined
            ? undefined
            : (correspondence.arcs[(hot.arc ?? hot.arcs?.[0])!] ?? undefined),
        cross:
          hot.cross === undefined ? undefined : correspondence.crossings.indexOf(hot.cross) + 1 || undefined,
      }
    : hot;
  const setReadoutHot = (next: Hot) => {
    if (!correspondence) return setHot(next);
    setHot({
      ...next,
      arc: undefined,
      ...(next.arc === undefined
        ? {}
        : { arcs: correspondence.arcs.flatMap((arc, i) => (arc === next.arc ? [i] : [])) }),
      cross: next.cross === undefined ? undefined : correspondence.crossings[next.cross - 1],
    });
  };
  const name = currentFile?.name;
  const suggestedName =
    name ??
    (state.family
      ? familyFileName(state.family)
      : `${
          examples
            .find((e) => e.key === state.preset)
            ?.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') ?? 'knot'
        }.knot`);
  const statusError = useCallback((error: unknown) => {
    dispatch({
      type: 'status',
      value: error instanceof Error ? error.message : t('status.fileFailure', { reason: String(error) }),
    });
  }, []);
  const load = useCallback((text: string) => {
    const diagram = parse(text);
    setHot({});
    dispatch({ type: 'load', diagram });
  }, []);
  const svg = useCallback(() => {
    if (state.triangleBoard) throw new Error(t('tri.noFiles'));
    if (state.bandBoard) throw new Error(t('bands.noFiles'));
    return exportSVG(D, labels, state.p, exportFonts, {
      signs: pinnedSigns,
      surface: surface ?? undefined,
      alone: state.alone,
    });
  }, [D, labels, state.p, pinnedSigns, surface, state.alone, state.bandBoard, state.triangleBoard]);
  // 14.I: pass the screen's selector results, labeling and pinned signs through
  // unchanged. Working follows the visible tab/stack and its expanded state.
  const sheet = useCallback(() => {
    if (state.triangleBoard) throw new Error(t('tri.noFiles'));
    if (state.bandBoard) throw new Error(t('bands.noFiles'));
    const example = examples.find((e) => e.key === state.preset);
    const family = state.family;
    const title = state.composition
      ? compositionTitle(state.composition)
      : family
        ? familyTitle(family, D.nComps)
        : (example?.name ?? 'Your drawing');
    const n = readoutD.crossings.length;
    const meta =
      state.alone !== null
        ? `K${String(state.alone + 1).replace(/\d/g, (v) => '₀₁₂₃₄₅₆₇₈₉'[Number(v)])} alone · ${n} ${n === 1 ? 'crossing' : 'crossings'}`
        : state.comps.length
          ? [
              readoutD.nComps === 1 ? 'Knot' : `${readoutD.nComps}-component link`,
              `${n} ${n === 1 ? 'crossing' : 'crossings'}`,
              readoutD.alternating ? 'alternating diagram' : 'non-alternating diagram',
            ]
              .filter(Boolean)
              .join(' · ')
          : t('readout.hint');
    return sheetSVG(
      {
        D: readoutD,
        diagram: { D, labels, p: state.p },
        surface: surface ?? undefined,
        alone: state.alone,
        data: selectReadout(readoutD, readoutState.p, readoutState.family),
        info: readoutLabels.info,
        labels: readoutLabels.labels,
        checks: readoutLabels.labels ? checkRows(readoutD, readoutLabels.labels) : [],
        p: readoutState.p,
        tryP: readoutState.tryP,
        composition: readoutState.composition,
        minorChoice: readoutState.minor,
        working: workingDisplay.visible
          ? { kind: readoutState.workingMatrix, expanded: workingDisplay.expanded }
          : undefined,
        titleMath: !!state.composition,
        // 19.A
        versus: versusData
          ? {
              title: state.versus!.title,
              rows: versusData.rows,
              outcome: versusData.outcome,
              thumb: versusData.thumb,
            }
          : null,
        title,
        symbol: family ? undefined : example,
        notation: family
          ? family.kind === 'twist'
            ? `n = ${family.params[0]}`
            : family.kind === 'sum'
              ? `K${String(family.params[1]).replace(/\d/g, (v) => '₀₁₂₃₄₅₆₇₈₉'[Number(v)])} (${family.params[0] === 0 ? 'Trefoil' : 'Figure-eight'}, n = ${family.params[1]})`
              : `${family.kind === 'torus' ? 'T' : 'P'}(${family.params.map((v) => String(v).replace(/^-/, '−')).join(', ')})`
          : undefined,
        meta,
        showReduction: !!readoutLabels.info && (readoutLabels.info.colorable || readoutState.tryP !== ''),
        signs: pinnedSigns,
        move: moveComparison ?? undefined,
      },
      exportFonts,
    );
  }, [
    D,
    state.comps.length,
    state.preset,
    state.family,
    state.composition,
    state.p,
    state.tryP,
    labels,
    pinnedSigns,
    versusData,
    readoutD,
    readoutState,
    readoutLabels,
    workingDisplay,
    state.alone,
    moveComparison,
    surface,
    state.triangleBoard,
    state.bandBoard,
  ]);
  const reader = useRef<FileReader | null>(null);
  const loadImage = useCallback(
    (file: File | null) => {
      if (state.triangleBoard || state.bandBoard || !file || !/^image\//.test(file.type)) return false;
      reader.current?.abort();
      const fr = new FileReader();
      reader.current = fr;
      fr.onload = () => {
        if (typeof fr.result === 'string') dispatch({ type: 'image', value: fr.result });
      };
      fr.readAsDataURL(file);
      return true;
    },
    [state.bandBoard, state.triangleBoard],
  );
  const fileActions: FileActions = useMemo(
    () => ({
      image: async () => {
        try {
          const file = await openImage();
          if (file && !loadImage(file))
            dispatch({ type: 'status', value: t('status.notPicture', { name: file.name }) });
        } catch (error) {
          statusError(error);
        }
      },
      open: async () => {
        try {
          const file = await openText();
          if (!file) return;
          load(file.text);
          if (isDesktop && file.path)
            setCurrentFile({ name: file.name, path: file.path, saved: serialize(parse(file.text)) });
          dispatch({ type: 'status', value: t('status.opened', { name: file.name }) });
        } catch (error) {
          statusError(error);
        }
      },
      save: async () => {
        if (state.triangleBoard || state.bandBoard) return;
        if (!state.comps.length && !currentFile) return;
        try {
          const text = serialize({
            ...state,
            versus:
              state.versus?.diagram.bandBoard || state.versus?.diagram.triangleBoard ? null : state.versus,
          });
          if (isDesktop && currentFile) {
            await writeText(currentFile.path, text);
            setCurrentFile({ ...currentFile, saved: text });
            dispatch({ type: 'status', value: t('status.saved', { name: currentFile.name }) });
          } else {
            const saved = await saveText(text, suggestedName);
            if (!saved) return;
            if (isDesktop && saved.path) setCurrentFile({ name: saved.name, path: saved.path, saved: text });
            dispatch({ type: 'status', value: t('status.saved', { name: saved.name }) });
          }
        } catch (error) {
          statusError(error);
        }
      },
      saveAs: async () => {
        if (state.triangleBoard || state.bandBoard) return;
        if (!state.comps.length && !currentFile) return;
        try {
          const text = serialize({
            ...state,
            versus:
              state.versus?.diagram.bandBoard || state.versus?.diagram.triangleBoard ? null : state.versus,
          });
          const saved = await saveText(text, suggestedName);
          if (!saved) return;
          if (isDesktop && saved.path) setCurrentFile({ name: saved.name, path: saved.path, saved: text });
          dispatch({ type: 'status', value: t('status.saved', { name: saved.name }) });
        } catch (error) {
          statusError(error);
        }
      },
      hasFile: !state.bandBoard && !state.triangleBoard && !!currentFile,
      svg: async () => {
        if (state.triangleBoard || state.bandBoard || !state.comps.length) return;
        try {
          const saved = await saveBytes(
            new TextEncoder().encode(svg()),
            suggestedName.replace(/\.knot$/i, '') + '.svg',
            { name: t('filter.svg'), extensions: ['svg'] },
          );
          if (saved) dispatch({ type: 'status', value: t('status.exported', { name: saved }) });
        } catch (error) {
          statusError(error);
        }
      },
      png: async () => {
        if (state.triangleBoard || state.bandBoard || !state.comps.length) return;
        try {
          const png = await rasterize(svg());
          const saved = await saveBytes(
            new Uint8Array(await png.arrayBuffer()),
            suggestedName.replace(/\.knot$/i, '') + '.png',
            { name: t('filter.png'), extensions: ['png'] },
          );
          if (saved) dispatch({ type: 'status', value: t('status.exported', { name: saved }) });
        } catch (error) {
          statusError(error);
        }
      },
      // 14.I
      sheetSVG: async () => {
        if (state.triangleBoard || state.bandBoard || !state.comps.length) return;
        try {
          const saved = await saveBytes(
            new TextEncoder().encode(sheet()),
            suggestedName.replace(/\.knot$/i, '') + '-page.svg',
            { name: t('filter.svg'), extensions: ['svg'] },
          );
          if (saved) dispatch({ type: 'status', value: t('status.exported', { name: saved }) });
        } catch (error) {
          statusError(error);
        }
      },
      sheetPNG: async () => {
        if (state.triangleBoard || state.bandBoard || !state.comps.length) return;
        try {
          const png = await rasterize(sheet());
          const saved = await saveBytes(
            new Uint8Array(await png.arrayBuffer()),
            suggestedName.replace(/\.knot$/i, '') + '-page.png',
            { name: t('filter.png'), extensions: ['png'] },
          );
          if (saved) dispatch({ type: 'status', value: t('status.exported', { name: saved }) });
        } catch (error) {
          statusError(error);
        }
      },
    }),
    [state, currentFile, suggestedName, svg, sheet, load, statusError, loadImage],
  );
  const session = useRef<ReturnType<typeof createSessionWriter> | null>(null);
  useEffect(() => {
    const writer = createSessionWriter(sessionStorage(), state);
    session.current = writer;
    window.addEventListener('pagehide', writer.flush);
    return () => {
      window.removeEventListener('pagehide', writer.flush);
      writer.dispose();
      session.current = null;
    };
    // The writer observes subsequent diagram changes, not the initial mount.
  }, []);
  useEffect(() => {
    session.current?.update(state);
  }, [
    state.comps,
    state.over,
    state.p,
    state.preset,
    state.family,
    state.minor,
    state.versus,
    state.surfaceOn,
    state.triangleBoard,
    state.bandBoard,
  ]);
  const fileText = useMemo(() => {
    if (!isDesktop || state.bandBoard || state.triangleBoard) return '';
    try {
      return serialize({
        ...state,
        versus: state.versus?.diagram.bandBoard || state.versus?.diagram.triangleBoard ? null : state.versus,
      });
    } catch {
      // An unsavable drawing remains visible and differs from the saved file.
      return null;
    }
  }, [
    state.comps,
    state.over,
    state.p,
    state.minor,
    state.versus,
    state.surfaceOn,
    state.bandBoard,
    state.triangleBoard,
  ]);
  useEffect(() => {
    if (!isDesktop) return;
    void setTitle(currentFile?.name ?? null, !!currentFile && currentFile.saved !== fileText).catch(
      statusError,
    );
  }, [currentFile, fileText, statusError]);
  useEffect(() => {
    const hook: KnotLabHook = {
      get language() {
        return getLang();
      },
      setLanguage: setLang,
      serialize: () => {
        if (state.triangleBoard) throw new Error(t('tri.noFiles'));
        if (state.bandBoard) throw new Error(t('bands.noFiles'));
        return serialize({
          ...state,
          versus:
            state.versus?.diagram.bandBoard || state.versus?.diagram.triangleBoard ? null : state.versus,
        });
      },
      triangulation: () => (state.triangleBoard ? analyseNet(state.triangleBoard.net) : null),
      triangleDocument: () => (state.triangleBoard ? structuredClone(state.triangleBoard.net) : null),
      selectTriangleExample: (key) => dispatch({ type: 'triangle-example', key }),
      bands: () => (state.bandBoard ? bandSurface(state.bandBoard.surface) : null),
      bandDocument: () => (state.bandBoard ? structuredClone(state.bandBoard.surface) : null),
      selectBandExample: (key) => dispatch({ type: 'band-example', key }),
      load,
      exportSVG: svg,
      exportPNG: async () => blobDataURL(await rasterize(svg())),
      // 14.I
      exportSheetSVG: sheet,
      exportSheetPNG: async () => blobDataURL(await rasterize(sheet())),
      latex: (kind) =>
        kind === 'triangulation'
          ? state.triangleBoard
            ? triangulationLatex(analyseNet(state.triangleBoard.net), state.triangleBoard.delta)
            : null
          : kind === 'bands'
            ? state.bandBoard
              ? bandsLatex(bandSurface(state.bandBoard.surface))
              : null
            : kind === 'seifert'
              ? surface
                ? seifertLatex(surface)
                : null
              : blockLatex(
                  readoutD,
                  readoutLabels.labels,
                  readoutState.p,
                  kind,
                  !!readoutLabels.info && (readoutLabels.info.colorable || readoutState.tryP !== ''),
                  readoutState.composition,
                  readoutState.minor,
                  readoutState.workingMatrix,
                ),
      moves: () => (state.triangleBoard || state.bandBoard ? [] : availableMoves(state, D)),
      applyMove: (index) => {
        if (state.triangleBoard || state.bandBoard || !Number.isInteger(index)) return false;
        const move = availableMoves(state, D)[index];
        if (!move || !applyMove(state, move).ok) return false;
        dispatch({ type: 'move', move });
        return true;
      },
      gaussCode: () => gaussCode(D),
      seifert: () => seifertNumbers(readoutD),
    };
    window.knotLab = hook;
    return () => {
      if (window.knotLab === hook) delete (window as Partial<Window>).knotLab;
    };
  }, [state, load, svg, sheet, readoutD, readoutLabels, readoutState, surface]);
  useEffect(() => subscribe(() => dispatch({ type: 'dismiss-status' })), []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const t = e.target;
      const editing =
        t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));
      const textEditing =
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          t.tagName === 'TEXTAREA' ||
          (t instanceof HTMLInputElement &&
            !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(t.type)));
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === 'o' && !e.shiftKey) {
          e.preventDefault();
          if (!e.repeat && !textEditing) fileActions.open();
        } else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (!e.repeat && !textEditing) {
            if (e.shiftKey && isDesktop) fileActions.saveAs();
            else fileActions.save();
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.repeat && !editing) {
        const key = e.key.toLowerCase();
        if (key === 'z' || (key === 'y' && !e.shiftKey)) {
          e.preventDefault();
          setHot({});
          dispatch({ type: key === 'y' || e.shiftKey ? 'redo' : 'undo' });
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [fileActions]);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.kind === 'file' && loadImage(item.getAsFile())) {
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('paste', paste);
      reader.current?.abort();
    };
  }, [loadImage]);
  useEffect(() => {
    if (!state.status) return;
    const timer = window.setTimeout(() => dispatch({ type: 'dismiss-status' }), 4500);
    return () => window.clearTimeout(timer);
  }, [state.status]);
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={300} disableHoverableContent>
      <main
        className={`app${!state.bandBoard && !state.triangleBoard && state.mode === 'compare' && state.image ? ' comparing' : ''}`}
        style={side.style}
      >
        {state.triangleBoard ? (
          <TriangleStage state={state} hot={hot} dispatch={dispatch} fileActions={fileActions} />
        ) : state.bandBoard ? (
          <BandStage state={state} hot={hot} dispatch={dispatch} fileActions={fileActions} />
        ) : state.mode === 'compare' && state.image ? (
          <ComparePanes
            state={state}
            D={D}
            labels={labels}
            hot={boardHot}
            dispatch={dispatch}
            setHot={setHot}
            loadImage={loadImage}
            fileActions={fileActions}
            onMovePreview={setMovePreview}
          />
        ) : (
          <Stage
            state={state}
            D={D}
            labels={labels}
            hot={boardHot}
            dispatch={dispatch}
            setHot={setHot}
            loadImage={loadImage}
            fileActions={fileActions}
            onMovePreview={setMovePreview}
          />
        )}
        <SideDivider width={side.width} windowWidth={side.windowWidth} setWidth={side.setWidth} />
        <Readout
          state={state}
          D={readoutD}
          info={readoutLabels.info}
          labels={readoutLabels.labels}
          dispatch={dispatch}
          setHot={setReadoutHot}
          hot={readoutHot}
          pinnedSigns={state.alone === null || pinnedSigns === 'all' ? pinnedSigns : undefined}
          pinSigns={pinSigns}
          moveComparison={moveComparison}
          surface={surface}
          onWorkingDisplay={setWorkingDisplay}
        />
      </main>
    </Tooltip.Provider>
  );
}
