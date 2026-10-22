import { Popover } from 'radix-ui';
import { useT } from '../i18n/useT';
import { Message } from './Message';
export function Help() {
  const t = useT();
  return (
    <Popover.Root>
      <Popover.Trigger className="ghost">{t('toolbar.help')}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="help"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={16}
          aria-label={t('help.title')}
        >
          <h2>{t('help.title')}</h2>
          <dl>
            <dt>{t('help.drawTerm')}</dt>
            <dd>{t('help.pointDraw')}</dd>
            <dt>{t('help.adjustTerm')}</dt>
            <dd>{t('help.adjust')}</dd>
            <dt>{t('help.crossingsTerm')}</dt>
            <dd>{t('help.crossings')}</dd>
            <dt>{t('help.movesTerm')}</dt>
            <dd>
              {t('help.moves')} {t('help.movePersistence')}
            </dd>
            <dt>{t('help.traceTerm')}</dt>
            <dd>{t('help.trace')}</dd>
            <dt>{t('help.viewTerm')}</dt>
            <dd>{t('help.view')}</dd>
            <dt>{t('help.hoverTerm')}</dt>
            <dd>
              <Message id="help.diagramHover" />
            </dd>
            <dt>{t('help.readoutTerm')}</dt>
            <dd>{t('help.readout')}</dd>
            <dt>{t('help.filesTerm')}</dt>
            <dd>{t('help.files')}</dd>
            <dt>{t('help.conventionsTerm')}</dt>
            <dd>
              <Message id="help.conventions" />
            </dd>
            <dt>{t('help.versusTerm')}</dt>
            <dd>{t('help.versus')}</dd>
          </dl>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
