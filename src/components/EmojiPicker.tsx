import { useEffect, useRef, useState } from 'react';

/** Lista curada de emojis — cobre tanto avatares de pessoas quanto ícones de categoria de gasto. */
const EMOJI_CHOICES = [
  '🙂', '😀', '🧑', '👩', '👨', '🧑‍💼', '👩‍💼', '👨‍💼', '🧑‍🔧', '👩‍🔧', '👨‍🔧', '🧑‍💻',
  '⛽', '🔧', '🛢️', '🧹', '🧴', '🧼', '📎', '👕', '📦', '🏷️', '🛵', '📅',
  '💊', '✳️', '🧽', '🚗', '🏍️', '💡', '📱', '🖨️', '🧯', '🔌', '🚿', '🧾',
  '💳', '🏠', '🌡️', '🩹', '🧻', '🪥', '📋', '💰', '⚙️', '📊', '🏪', '🚚',
];

/**
 * Campo de ícone com atalho visual: clicar no ícone atual abre uma grade de
 * emojis prontos pra escolher, em vez de precisar digitar/colar um emoji.
 */
export function EmojiPicker({ value, onChange, id }: { value: string; onChange: (emoji: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="emoji-picker" ref={containerRef}>
      <button
        id={id}
        type="button"
        className="emoji-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Escolher ícone"
      >
        <span>{value || '🙂'}</span>
        <span className="emoji-picker-trigger-hint">Trocar</span>
      </button>

      {open && (
        <div className="emoji-grid">
          {EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={'emoji-btn' + (emoji === value ? ' selected' : '')}
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
