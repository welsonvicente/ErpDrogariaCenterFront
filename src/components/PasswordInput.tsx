import { useState, type InputHTMLAttributes } from 'react';

/** Campo de senha/PIN com o "olhinho" para mostrar/esconder o valor digitado. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input {...props} type={visivel ? 'text' : 'password'} style={{ ...props.style, width: '100%', paddingRight: 40 }} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          color: 'var(--ink-soft)',
          padding: 4,
        }}
      >
        {visivel ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
