import { Fragment } from 'react';
import type { Key, Params } from '../i18n';
import { useT } from '../i18n/useT';

export function Message({ id, params }: { id: Key; params?: Params }) {
  const t = useT();
  // Only known math tokens become markup; parameter values remain plain text.
  return t(id)
    .split(/(\{\w+\})/g)
    .map((part, i) => {
      const token = /^\{(\w+)\}$/.exec(part)?.[1];
      return (
        <Fragment key={i}>
          {token && /^[xyzAt]$/.test(token) ? <i>{token}</i> : token ? String(params?.[token] ?? part) : part}
        </Fragment>
      );
    });
}
