import { getLang, setLang } from '../i18n';
import { useT } from '../i18n/useT';
import { useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type RefObject } from 'react';
import type { Action, State } from '../state/store';
import { Tip } from './Tip';
import { Help } from './Help';
import { isDesktop } from '../platform/files';
import { FileMenu, type FileActions } from './FileMenu';
import { toolbarFits } from './toolbarFit';
import { diagramTitle } from './Versus';
import { DropdownMenu } from 'radix-ui';
import { PhoneDialog } from './PhoneDialog';
export interface ToolbarProps {
  state: State;
  dispatch: Dispatch<Action>;
  loadImage: (file: File | null) => boolean;
  toolsRef: RefObject<HTMLDivElement | null>;
  fileActions?: FileActions;
}
export function Toolbar({ state, dispatch, loadImage, toolsRef, fileActions }: ToolbarProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const pictureTools = useRef<HTMLSpanElement>(null);
  const [phone, setPhone] = useState(false);
  const [secondLine, setSecondLine] = useState(false);
  const hasImage = !state.bandBoard && !state.triangleBoard && !!state.image;
  const diagramEnabled = !state.bandBoard && !state.triangleBoard;
  const hasContent = state.triangleBoard
    ? !!state.triangleBoard.net.triangles.length
    : state.bandBoard
      ? !!state.bandBoard.surface.disks.length
      : !!state.comps.length;
  const hasPictureTools = hasImage && state.mode === 'trace';
  const hasFiles = !!fileActions;
  const lang = getLang();
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const groups = [...element.querySelectorAll<HTMLElement>('.tool-group')];
    const measure = () => {
      if (!hasPictureTools) {
        setSecondLine(false);
        return;
      }
      // Sum unshrinking controls, not the groups' wrapped widths. Always measure
      // the inline 84px slider, even when the visible second-line slider is 120px.
      const widths = groups.map((group) => {
        const controls = [...group.children].filter((child) => child !== pictureTools.current);
        let width =
          controls.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) +
          Math.max(0, controls.length - 1) * 2;
        if (group.dataset.group === 'picture') {
          width +=
            2 + 84 + 2 + (pictureTools.current?.querySelector('button')?.getBoundingClientRect().width ?? 0);
        }
        return width;
      });
      const gap = parseFloat(getComputedStyle(element).columnGap);
      setSecondLine(!toolbarFits(element.getBoundingClientRect().width, widths, gap));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    groups.forEach((group) => observer.observe(group));
    if (pictureTools.current) observer.observe(pictureTools.current);
    measure();
    // The font can load without changing an already-wrapped row's dimensions.
    void document.fonts.ready.then(() => {
      if (row.current === element) measure();
    });
    return () => observer.disconnect();
  }, [hasImage, hasPictureTools, hasFiles, lang, state.mode]);
  return (
    <div className={`tools${hasPictureTools && secondLine ? ' second-line' : ''}`} ref={toolsRef}>
      <div className="tools-row" ref={row}>
        <div className="tool-group" data-group="history">
          <Tip text={t('toolbar.undoTip')}>
            <button
              className="ghost"
              aria-disabled={!state.history.length}
              onClick={() => state.history.length && dispatch({ type: 'undo' })}
            >
              {t('toolbar.undo')}
            </button>
          </Tip>
          <Tip text={t('toolbar.redoTip')}>
            <button
              className="ghost"
              aria-disabled={!state.future.length}
              onClick={() => state.future.length && dispatch({ type: 'redo' })}
            >
              {t('toolbar.redo')}
            </button>
          </Tip>
        </div>
        <div className="tool-group" data-group="diagram">
          <Tip text={t('toolbar.alternateTip')}>
            <button
              className="ghost"
              aria-disabled={!diagramEnabled || !state.over.size}
              onClick={() => diagramEnabled && state.over.size && dispatch({ type: 'alternate' })}
            >
              {t('toolbar.alternate')}
            </button>
          </Tip>
          <Tip text={t('toolbar.componentMirrorTip')}>
            <button
              className="ghost"
              aria-disabled={!diagramEnabled || !state.over.size}
              onClick={() => diagramEnabled && state.over.size && dispatch({ type: 'mirror' })}
            >
              {t('toolbar.mirror')}
            </button>
          </Tip>
          <Tip text={t('toolbar.tidyTip')}>
            <button
              className="ghost tidy"
              aria-disabled={!diagramEnabled || !state.comps.length}
              onClick={() => diagramEnabled && state.comps.length && dispatch({ type: 'tidy' })}
            >
              {t('toolbar.tidy')}
            </button>
          </Tip>
          <Tip text={t('toolbar.movesTip')}>
            <button
              className="ghost moves-toggle"
              aria-pressed={diagramEnabled && state.movesOn}
              aria-disabled={!diagramEnabled}
              onClick={() => diagramEnabled && dispatch({ type: 'moves', on: !state.movesOn })}
            >
              {t('toolbar.moves')}
            </button>
          </Tip>
          <Tip text={t('surface.toggleTip')}>
            <button
              className="ghost surface-toggle"
              aria-pressed={diagramEnabled && state.surfaceOn}
              aria-disabled={!diagramEnabled}
              onClick={() => diagramEnabled && dispatch({ type: 'surface', on: !state.surfaceOn })}
            >
              {t('surface.toggle')}
            </button>
          </Tip>
          {/* 19.A */}
          <Tip
            text={t(
              state.bandBoard || state.triangleBoard
                ? 'bands.compareTip'
                : state.versus || hasContent
                  ? 'versus.compareTip'
                  : 'versus.empty',
            )}
          >
            <button
              className="ghost versus-toggle"
              aria-pressed={!!state.versus}
              aria-disabled={!state.versus && !hasContent}
              onClick={() =>
                state.versus
                  ? dispatch({ type: 'versus-end' })
                  : hasContent && dispatch({ type: 'versus-pin', title: diagramTitle(state) })
              }
            >
              {t('versus.compare')}
            </button>
          </Tip>
        </div>
        <div className="tool-group" data-group="picture">
          {diagramEnabled && state.mode === 'compare' ? (
            <Tip text={t('toolbar.backTip')}>
              <button className="ghost" onClick={() => dispatch({ type: 'mode', value: 'trace' })}>
                {t('toolbar.back')}
              </button>
            </Tip>
          ) : isDesktop && fileActions ? (
            // 23.P: on the desktop the picture comes from a file or from the phone
            <DropdownMenu.Root>
              <Tip text={t('toolbar.traceTip')}>
                <DropdownMenu.Trigger asChild disabled={!diagramEnabled}>
                  <button className="ghost trace-menu" aria-disabled={!diagramEnabled}>
                    {t('toolbar.trace')}
                  </button>
                </DropdownMenu.Trigger>
              </Tip>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="picker-menu file-menu"
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                >
                  <DropdownMenu.Item className="picker-item" onSelect={() => fileActions.image()}>
                    {t('phone.menuFile')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="picker-item" onSelect={() => setPhone(true)}>
                    {t('phone.menuPhone')}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <Tip text={t('toolbar.traceTip')}>
              <button
                className="ghost"
                aria-disabled={!diagramEnabled}
                // the web page asks through the browser's own dialog
                onClick={() => diagramEnabled && input.current?.click()}
              >
                {t('toolbar.trace')}
              </button>
            </Tip>
          )}
          {hasPictureTools && (
            <span className="imgtools" ref={pictureTools}>
              <input
                type="range"
                min={5}
                max={100}
                value={state.opacity * 100}
                style={{ '--opacity': `${((state.opacity * 100 - 5) / 95) * 100}%` } as CSSProperties}
                aria-label={t('toolbar.opacity')}
                title={t('toolbar.opacity')}
                onChange={(e) => dispatch({ type: 'opacity', value: Number(e.target.value) / 100 })}
              />
              <Tip text={t('toolbar.doneTip')}>
                <button
                  className="ghost confirm"
                  aria-disabled={!diagramEnabled || !state.comps.length}
                  onClick={() => state.comps.length && dispatch({ type: 'mode', value: 'compare' })}
                >
                  {t('toolbar.done')}
                </button>
              </Tip>
            </span>
          )}
        </div>
        <div className="tool-group" data-group="remove">
          {hasImage && (
            <Tip text={t('toolbar.removeTip')}>
              <button className="ghost" onClick={() => dispatch({ type: 'image', value: null })}>
                {t('toolbar.remove')}
              </button>
            </Tip>
          )}
          <Tip
            text={t(
              state.triangleBoard ? 'tri.clearTip' : state.bandBoard ? 'bands.clearTip' : 'toolbar.clearTip',
            )}
          >
            <button
              className="ghost"
              aria-disabled={!hasContent}
              onClick={() => hasContent && dispatch({ type: 'clear' })}
            >
              {t('toolbar.clear')}
            </button>
          </Tip>
        </div>
        <div className="tool-group app-tools" data-group="app">
          {fileActions && (
            <FileMenu actions={fileActions} hasCurves={diagramEnabled && !!state.comps.length} />
          )}
          <Help />
          <Tip text={t('language.tip')}>
            <button
              className="ghost language"
              aria-label={t('language.tip')}
              onClick={() => setLang(getLang() === 'zh' ? 'en' : 'zh')}
            >
              {t('language.label')}
            </button>
          </Tip>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          loadImage(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {isDesktop && (
        <PhoneDialog open={phone} onClose={() => setPhone(false)} onPhoto={(file) => void loadImage(file)} />
      )}
    </div>
  );
}
