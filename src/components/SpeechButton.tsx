import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import type { Note } from '../../shared/notes';

export default function SpeechButton({ note }: { note: Note }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const source = `/api/notes/${encodeURIComponent(note.id)}/audio?revision=${note.revision}`;
  useEffect(() => {
    const element = audio.current!;
    return () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, []);
  function play() {
    const element = audio.current!;
    if (state === 'playing' || state === 'loading') {
      element.pause();
      setState('idle');
      return;
    }
    setState('loading');
    if (!element.getAttribute('src') || state === 'error') element.src = source;
    else element.currentTime = 0;
    // Call play within the tap, before awaiting the network, so iPhone can authorize playback.
    void element.play().catch((error: Error) => {
      if (error.name !== 'AbortError') setState('error');
    });
  }
  return (
    <span
      className="speech-control"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="speech-button"
        type="button"
        aria-label={
          state === 'playing'
            ? '停止播放例句'
            : state === 'loading'
              ? '取消例句发音'
              : '播放例句发音'
        }
        aria-pressed={state === 'playing'}
        aria-busy={state === 'loading'}
        onClick={play}
      >
        {state === 'loading' ? (
          <LoaderCircle size={18} className="spin" />
        ) : state === 'playing' ? (
          <Square size={15} />
        ) : (
          <Volume2 size={19} />
        )}
      </button>
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setState('playing')}
        onEnded={() => setState('idle')}
        onError={() => setState('error')}
      />
      {state === 'error' && (
        <span className="speech-error" role="status">
          发音暂时不可用，点击重试。
        </span>
      )}
    </span>
  );
}
