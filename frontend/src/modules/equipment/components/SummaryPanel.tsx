import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { useApi } from '../../../shared/hooks/useApi';
import { getEquipmentSummary, listDepartments } from '../api';
import { EmptyState, LoadingState } from './LoadingState';

export function SummaryPanel() {
  const summaryQuery = useApi((signal) => getEquipmentSummary(signal), []);
  const departmentsQuery = useApi((signal) => listDepartments(signal), []);
  const summary = summaryQuery.data;

  const departmentIds = summary?.byDepartment.map((item) => item.departmentId) ?? [];
  const departmentName = (id: number) => departmentsQuery.data?.find((item) => item.id === id)?.name ?? `Departamento ${id}`;
  const quantityAt = (category: string, departmentId: number) =>
    summary?.cells.find((cell) => cell.category === category && cell.departmentId === departmentId)?.quantity ?? 0;

  return (
    <section aria-label="Resumen de equipamiento" className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-heading">Equipamiento por categoría y departamento</h2>
        <p className="text-sm text-muted">Las cantidades representan unidades, no registros individuales.</p>
      </div>
      {summaryQuery.error && <ErrorBanner title="No se pudo cargar el resumen" message={summaryQuery.error.message} />}
      {departmentsQuery.error && <ErrorBanner title="No se pudieron cargar los nombres de departamento" message={departmentsQuery.error.message} />}
      {summaryQuery.loading && !summary ? (
        <LoadingState message="Calculando resumen…" />
      ) : summaryQuery.error ? null : !summary || summary.total === 0 ? (
        <EmptyState title="Resumen sin datos" message="Registra equipos para consultar los totales por categoría y departamento." />
      ) : (
        <div className="w-full overflow-x-auto rounded-lg border border-border bg-page">
          <table className="min-w-max w-full divide-y divide-border text-left text-sm">
            <caption className="sr-only">Resumen de cantidades de equipos por categoría y departamento</caption>
            <thead className="bg-active text-heading">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Categoría</th>
                {departmentIds.map((id) => <th key={id} scope="col" className="px-4 py-3 text-right font-semibold">{departmentName(id)}</th>)}
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total por categoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.byCategory.map((row) => (
                <tr key={row.category}>
                  <th scope="row" className="px-4 py-3 font-medium text-ink">{row.category}</th>
                  {departmentIds.map((id) => <td key={id} className="px-4 py-3 text-right text-ink">{quantityAt(row.category, id)}</td>)}
                  <td className="px-4 py-3 text-right font-semibold text-heading">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-active font-semibold text-heading">
              <tr>
                <th scope="row" className="px-4 py-3">Total por departamento</th>
                {summary.byDepartment.map((item) => <td key={item.departmentId} className="px-4 py-3 text-right">{item.quantity}</td>)}
                <td className="px-4 py-3 text-right" aria-label={`Total general: ${summary.total}`}>{summary.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
