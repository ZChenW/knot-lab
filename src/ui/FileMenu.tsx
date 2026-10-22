import { useT } from '../i18n/useT';
import { DropdownMenu } from 'radix-ui';
import { isDesktop } from '../platform/files';

export interface FileActions {
  open: () => void;
  save: () => void;
  saveAs: () => void;
  hasFile?: boolean;
  svg: () => void;
  png: () => void;
  // 14.I
  sheetSVG: () => void;
  sheetPNG: () => void;
  /** choose the picture to trace over */
  image: () => void;
}
export function FileMenu({ actions, hasCurves }: { actions: FileActions; hasCurves: boolean }) {
  const t = useT();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="ghost">{t('toolbar.file')}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="picker-menu file-menu"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <DropdownMenu.Item className="picker-item" onSelect={actions.open}>
            {t('menu.open')}
            <span className="file-shortcut">Ctrl+O</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="picker-item"
            disabled={!hasCurves && !actions.hasFile}
            onSelect={actions.save}
          >
            {t('menu.saveCurrent')}
            <span className="file-shortcut">Ctrl+S</span>
          </DropdownMenu.Item>
          {isDesktop && (
            <DropdownMenu.Item
              className="picker-item"
              disabled={!hasCurves && !actions.hasFile}
              onSelect={actions.saveAs}
            >
              {t('menu.saveAs')}
              <span className="file-shortcut">Ctrl+Shift+S</span>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="file-separator" />
          <DropdownMenu.Item className="picker-item" disabled={!hasCurves} onSelect={actions.svg}>
            {t('menu.svg')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className="picker-item" disabled={!hasCurves} onSelect={actions.png}>
            {t('menu.png')}
          </DropdownMenu.Item>
          {/* 14.I */}
          <DropdownMenu.Separator className="file-separator" />
          <DropdownMenu.Item className="picker-item" disabled={!hasCurves} onSelect={actions.sheetSVG}>
            {t('menu.sheetSVG')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className="picker-item" disabled={!hasCurves} onSelect={actions.sheetPNG}>
            {t('menu.sheetPNG')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
