import { Search } from 'lucide-react';
import { useId } from 'react';
import { MESSAGES } from '../lib/messages';
import { INPUT_CLASSES } from './FormField';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/** Búsqueda por texto de los listados (Req. 15.15). */
export function SearchBox({ value, onChange, label = MESSAGES.common.search, placeholder = MESSAGES.common.searchPlaceholder }: SearchBoxProps) {
  const id = useId();
  return (
    <div className="relative w-full max-w-sm">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASSES} pl-9`}
      />
    </div>
  );
}
