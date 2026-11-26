import { useState } from 'react';
import { MESSAGES } from '../lib/messages';

/** Imagen ficticia local que se muestra si no hay foto o si no carga. */
export const DEFAULT_AVATAR_SRC = '/avatars/default.svg';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-24 w-24' } as const;

/** Foto circular con imagen por defecto. */
export function Avatar({ src, alt = MESSAGES.avatar.defaultAlt, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const source = src && !failed ? src : DEFAULT_AVATAR_SRC;
  return (
    <img
      src={source}
      alt={alt}
      onError={() => setFailed(true)}
      className={`${SIZES[size]} shrink-0 rounded-full border border-border bg-active object-cover`}
    />
  );
}
