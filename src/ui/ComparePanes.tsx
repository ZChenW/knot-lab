import { useT } from '../i18n/useT';
import { useState } from 'react';
import { initialView, viewBox } from '../core/diagram';
import { Stage, type StageProps } from './Stage';
export function ComparePanes(props: StageProps) {
  const t = useT();
  const [view, setView] = useState(initialView),
    [drop, setDrop] = useState(false);
  return (
    <div
      className="compare"
      onDragOver={(e) => {
        e.preventDefault();
        setDrop(e.target instanceof Element && !!e.target.closest('.original'));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(false);
        props.loadImage(e.dataTransfer.files[0] ?? null);
      }}
    >
      <section className={`stage original paper${drop ? ' drop' : ''}`} aria-label={t('board.original')}>
        <svg className="original-svg" viewBox={viewBox(view)} role="img" aria-label={t('board.picture')}>
          <image
            href={props.state.image!}
            x={0}
            y={0}
            width={800}
            height={600}
            preserveAspectRatio="xMidYMid meet"
            opacity={1}
          />
        </svg>
        <span className="pane-name">{t('board.original')}</span>
      </section>
      <Stage {...props} onView={setView} />
    </div>
  );
}
