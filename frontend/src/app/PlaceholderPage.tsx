import { Link } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';
import { MESSAGES } from '../shared/lib/messages';
import { homeFor } from './navigation';

/** Página provisional de una sección que se implementa en la Etapa 6. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-heading">{title}</h1>
      <p className="text-muted">{MESSAGES.layout.placeholder}</p>
    </section>
  );
}

/** Ruta inexistente dentro de la aplicación. */
export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <section className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold text-heading">{MESSAGES.layout.notFoundTitle}</h1>
      <p className="text-muted">{MESSAGES.layout.notFoundText}</p>
      {user && (
        <Link to={homeFor(user.role)} className="font-medium text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {MESSAGES.layout.goHome}
        </Link>
      )}
    </section>
  );
}
