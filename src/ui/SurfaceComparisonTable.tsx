import type { ReactNode } from 'react';

/** The pictures and both tables use the same label / S / relation / T columns. */
export function SurfaceComparisonTable({
  children,
  boundary = false,
}: {
  children: ReactNode;
  boundary?: boolean;
}) {
  return (
    <table className="surface-comparison-table" aria-label={boundary ? '∂S vs ∂T' : 'S vs T'}>
      <colgroup>
        <col className="comparison-label-column" />
        <col />
        <col className="comparison-sign-column" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <td />
          <th scope="col">
            <span className="comparison-sr-only">{boundary ? '∂S' : 'S'}</span>
          </th>
          <td />
          <th scope="col">
            <span className="comparison-sr-only">{boundary ? '∂T' : 'T'}</span>
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
