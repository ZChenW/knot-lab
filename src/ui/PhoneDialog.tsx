// 23.P: the code for the phone, as in Matrix Pad. The first photo that arrives becomes the
// picture to trace and the dialog closes.
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { useT } from '../i18n/useT';
import { getLang, type Key } from '../i18n';
import {
  phoneError,
  startPhone,
  stopPhone,
  takePhoto,
  type PhoneCode,
  type PhoneMode,
} from '../platform/phone';

const MODE_KEY = 'knot-lab.phoneMode';
function savedMode(): PhoneMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'internet' ? 'internet' : 'lan';
  } catch {
    return 'lan';
  }
}

export function PhoneDialog({
  open,
  onClose,
  onPhoto,
}: {
  open: boolean;
  onClose: () => void;
  onPhoto: (file: File) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<PhoneMode>(savedMode);
  const [code, setCode] = useState<PhoneCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const session = useRef(0);
  const deadline = useRef(0);

  // A newer request, or closing the dialog, makes an older answer irrelevant.
  useEffect(() => {
    if (!open) return;
    const mine = ++session.current;
    setCode(null);
    setError(null);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* the mode is only a convenience */
    }
    startPhone(mode, getLang()).then(
      (answer) => {
        if (mine !== session.current) return;
        deadline.current = Date.now() + answer.expires_in * 1000;
        setLeft(answer.expires_in);
        setCode(answer);
      },
      (failure) => {
        if (mine !== session.current) return;
        const { key, p0 } = phoneError(failure);
        setError(t(key as Key, { p0 }));
      },
    );
    return () => {
      session.current++;
    };
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count down, and collect what arrives.
  useEffect(() => {
    if (!open || !code) return;
    const mine = session.current;
    const clock = setInterval(() => {
      const seconds = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setLeft(seconds);
      if (!seconds) onClose();
    }, 1000);
    let stopped = false;
    (async () => {
      while (!stopped && mine === session.current) {
        let photo: Blob | null | 'closed' = null;
        try {
          photo = await takePhoto();
        } catch {
          photo = null;
        }
        if (stopped || mine !== session.current) return;
        if (photo === 'closed') return onClose();
        if (photo) {
          onPhoto(new File([photo], 'phone', { type: photo.type }));
          return onClose();
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    })();
    return () => {
      stopped = true;
      clearInterval(clock);
    };
  }, [open, code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) void stopPhone();
  }, [open]);

  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="phone-overlay" />
        <Dialog.Content className="phone-dialog" aria-describedby={undefined}>
          <Dialog.Title className="phone-title">{t('phone.title')}</Dialog.Title>
          <div className="phone-modes" role="group" aria-label={t('phone.modes')}>
            {(['lan', 'internet'] as const).map((m) => (
              <button
                key={m}
                className="ghost"
                aria-pressed={mode === m}
                onClick={() => (m !== mode ? setMode(m) : error && setMode((x) => x))}
              >
                {t(m === 'lan' ? 'phone.lan' : 'phone.internet')}
              </button>
            ))}
          </div>
          <div className="phone-code" data-state={error ? 'error' : code ? 'ready' : 'waiting'}>
            {code ? (
              <img alt={t('phone.qr')} src={`data:image/svg+xml;utf8,${encodeURIComponent(code.qr)}`} />
            ) : (
              <p role="status">{error ?? t(mode === 'internet' ? 'phone.connecting' : 'phone.opening')}</p>
            )}
          </div>
          {code && <p className="phone-url">{code.url}</p>}
          {code && (
            <p className="phone-note">
              {t(mode === 'internet' ? 'phone.noteInternet' : 'phone.note', { time })}
            </p>
          )}
          <div className="phone-actions">
            <button className="ghost" onClick={onClose}>
              {t('phone.close')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
