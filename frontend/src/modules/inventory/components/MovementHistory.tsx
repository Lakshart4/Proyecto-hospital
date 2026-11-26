import { useEffect, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../../shared/components/DataTable';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { formatDateTime } from '../../../shared/lib/formatters';
import { useApi } from '../../../shared/hooks/useApi';
import { listMovements } from '../api';
import { MOVEMENT_TYPES, PRODUCT_CATEGORIES } from '../schemas';
import type { InventoryMovement, MovementType, ProductCategory } from '../types';
import { Pagination } from './Pagination';

export function MovementHistory() {
  const [productId, setProductId] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [type, setType] = useState<MovementType | ''>('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const validRange = !from || !to || from <= to;
  const query = useApi(
    (signal) => listMovements({
      productId: /^\d+$/.test(productId) ? Number(productId) : '',
      category,
      type,
      userId: /^\d+$/.test(userId) ? Number(userId) : '',
      from,
      to,
      page,
      pageSize,
    }, signal),
    [productId, category, type, userId, from, to, page, pageSize],
    { enabled: validRange },
  );

  useEffect(() => {
    if (!query.data) return;
    const pages = Math.max(1, Math.ceil(query.data.total / pageSize));
    if (page > pages) setPage(pages);
  }, [query.data, page, pageSize]);

  const resetPage = () => setPage(1);
  const columns: readonly DataTableColumn<InventoryMovement>[] = [
    { key: 'createdAt', header: 'Fecha y hora', sortValue: (row) => row.createdAt, render: (row) => formatDateTime(row.createdAt) },
    { key: 'product', header: 'Producto', sortValue: (row) => row.product?.name ?? String(row.productId), render: (row) => row.product?.name ?? `Producto ${row.productId}` },
    { key: 'category', header: 'Categoría', sortValue: (row) => row.product?.category ?? '', render: (row) => row.product?.category ?? '—' },
    { key: 'type', header: 'Tipo', sortValue: (row) => row.type },
    { key: 'before', header: 'Anterior', sortValue: (row) => row.quantityBefore },
    { key: 'after', header: 'Resultante', sortValue: (row) => row.quantityAfter },
    { key: 'reason', header: 'Motivo', sortValue: (row) => row.reason, render: (row) => <span className="block max-w-xs whitespace-normal">{row.reason}</span> },
    { key: 'user', header: 'Usuario', sortValue: (row) => row.user?.name ?? '', render: (row) => row.user?.name ?? `Usuario ${row.userId}` },
  ];

  return (
    <section className="flex flex-col gap-4" aria-labelledby="movement-history-title">
      <div>
        <h2 id="movement-history-title" className="text-lg font-semibold text-heading">Movimientos de ambos inventarios</h2>
        <p className="text-sm text-muted">Consulta los cambios de existencia por producto, categoría, tipo, usuario y periodo.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="flex flex-col gap-1 text-sm font-medium">ID de producto
          <input inputMode="numeric" value={productId} onChange={(event) => { setProductId(event.target.value.replace(/\D/g, '')); resetPage(); }} className={INPUT_CLASSES} placeholder="Todos" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Categoría
          <select value={category} onChange={(event) => { setCategory(event.target.value as ProductCategory | ''); resetPage(); }} className={INPUT_CLASSES}>
            <option value="">Todas</option>
            {PRODUCT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Tipo
          <select value={type} onChange={(event) => { setType(event.target.value as MovementType | ''); resetPage(); }} className={INPUT_CLASSES}>
            <option value="">Todos</option>
            {MOVEMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">ID de usuario
          <input inputMode="numeric" value={userId} onChange={(event) => { setUserId(event.target.value.replace(/\D/g, '')); resetPage(); }} className={INPUT_CLASSES} placeholder="Todos" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Desde
          <input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); resetPage(); }} className={INPUT_CLASSES} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Hasta
          <input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); resetPage(); }} className={INPUT_CLASSES} />
        </label>
      </div>
      {!validRange && <ErrorBanner message="La fecha inicial no puede ser posterior a la fecha final." />}
      {query.error && <ErrorBanner message={query.error.message} />}
      {query.loading ? (
        <div className="flex items-center gap-2 py-6"><Spinner /><span>Cargando movimientos…</span></div>
      ) : validRange && (
        <>
          <DataTable columns={columns} rows={query.data?.data ?? []} rowKey={(row) => row.id} caption="Historial de movimientos de inventario" pageSize={pageSize} emptyMessage="No hay movimientos que coincidan con los filtros." />
          <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} disabled={query.loading} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="Paginación de movimientos" />
        </>
      )}
    </section>
  );
}
