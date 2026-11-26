import { BedDouble, CheckCircle2, XCircle } from 'lucide-react';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { StatCard } from '../../../shared/components/StatCard';
import type { RoomCounters } from '../types';

export function RoomCountersPanel({ counters }: { counters: RoomCounters }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-live="polite">
        <StatCard label="Habitaciones totales" value={counters.total.total} icon={BedDouble} />
        <StatCard label="Habitaciones disponibles" value={counters.total.available} icon={CheckCircle2} />
        <StatCard label="Habitaciones ocupadas" value={counters.total.occupied} icon={XCircle} />
      </div>
      {counters.byDepartment.length > 0 && (
        <section className="rounded-lg border border-border bg-page p-4 sm:p-5" aria-labelledby="department-counters-title">
          <h2 id="department-counters-title" className="mb-4 text-base font-semibold text-heading">Ocupación por departamento</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {counters.byDepartment.map((department) => (
              <div key={department.departmentId} className="rounded-md bg-active p-3">
                <ProgressBar
                  label={`${department.departmentName}: ${department.occupied} ocupadas, ${department.available} disponibles de ${department.total}`}
                  value={department.total === 0 ? 0 : (department.occupied / department.total) * 100}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
