import { useEffect, useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../../../shared/components/DataTable';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { SearchBox } from '../../../shared/components/SearchBox';
import { Spinner } from '../../../shared/components/Spinner';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import { Pagination } from '../../inventory/components/Pagination';
import { ProductBadges } from '../../inventory/components/ProductBadges';
import { ProductDetail } from '../../inventory/components/ProductDetail';
import { ProductForm } from '../../inventory/components/ProductForm';
import type { Product } from '../../inventory/types';
import {
  createCleaningMovement,
  createCleaningProduct,
  deleteCleaningProduct,
  getCleaningProduct,
  listCleaningProducts,
  listSupplierOptions,
  updateCleaningProduct,
} from '../api';

type FormState = { mode: 'create' } | { mode: 'edit'; product: Product } | null;

export interface CleaningInventoryPageProps {
  /** Permite forzar la presentación de consulta en integraciones; nunca eleva permisos del rol. */
  readOnly?: boolean;
}

export function CleaningInventoryPage({ readOnly = false }: CleaningInventoryPageProps) {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' && !readOnly;
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('');
  const [lowStock, setLowStock] = useState<'' | 'true' | 'false'>('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formState, setFormState] = useState<FormState>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const suppliersQuery = useApi((signal) => listSupplierOptions(signal), []);
  const productsQuery = useApi(
    (signal) => listCleaningProducts({ search: search.trim(), availability, lowStock, supplierId: supplierId ? Number(supplierId) : '', page, pageSize }, signal),
    [search, availability, lowStock, supplierId, page, pageSize],
  );

  useEffect(() => {
    if (!productsQuery.data) return;
    const pages = Math.max(1, Math.ceil(productsQuery.data.total / pageSize));
    if (page > pages) setPage(pages);
  }, [productsQuery.data, page, pageSize]);

  const handleDelete = async () => {
    if (!deleteTarget || deleting || !canManage) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteCleaningProduct(deleteTarget.id);
      setDeleteTarget(null);
      setToast('Producto de limpieza eliminado correctamente.');
      productsQuery.reload();
    } catch (error) {
      setDeleteTarget(null);
      setActionError(toApiError(error).message);
    } finally {
      setDeleting(false);
    }
  };

  const columns: readonly DataTableColumn<Product>[] = [
    { key: 'name', header: 'Producto', sortValue: (row) => row.name, render: (row) => <button type="button" onClick={() => setDetailId(row.id)} className="font-medium text-primary hover:underline">{row.name}</button> },
    { key: 'classification', header: 'Clasificación', sortValue: (row) => row.classification },
    { key: 'quantity', header: 'Existencia', sortValue: (row) => row.quantity, render: (row) => row.quantity.toLocaleString('es-MX') },
    { key: 'minStock', header: 'Stock mínimo', sortValue: (row) => row.minStock },
    { key: 'supplier', header: 'Proveedor', sortValue: (row) => row.supplier?.name ?? '', render: (row) => row.supplier?.name ?? '—' },
    { key: 'status', header: 'Estado', render: (row) => <ProductBadges product={row} /> },
    { key: 'detail', header: 'Consulta', render: (row) => <button type="button" className="font-medium text-primary hover:underline" onClick={() => setDetailId(row.id)}>Ver detalle</button> },
    ...(canManage ? [{
      key: 'actions', header: 'Acciones', render: (row: Product) => (
        <div className="flex items-center gap-3">
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setFormState({ mode: 'edit', product: row })}>Editar</button>
          <button type="button" className="font-medium text-danger hover:underline" onClick={() => setDeleteTarget(row)}>Eliminar</button>
        </div>
      ),
    }] as const : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Inventario de limpieza</h1>
          <p className="mt-1 text-sm text-muted">Consulta independiente de materiales de limpieza y sus existencias.</p>
        </div>
        {canManage && <Button onClick={() => setFormState({ mode: 'create' })}>Nuevo producto de limpieza</Button>}
      </div>
      {!canManage && (
        <div role="note" className="rounded-md bg-active px-4 py-3 text-sm text-ink">Vista de solo lectura. Puedes consultar productos y disponibilidad, pero no modificar el inventario.</div>
      )}
      <section aria-label="Filtros del inventario de limpieza" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar material de limpieza…" label="Buscar en inventario de limpieza" />
          <Button variant="secondary" onClick={() => { setSearch(''); setAvailability(''); setLowStock(''); setSupplierId(''); setPage(1); }}>Limpiar filtros</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select aria-label="Disponibilidad" value={availability} onChange={(event) => { setAvailability(event.target.value); setPage(1); }} className={INPUT_CLASSES}>
            <option value="">Toda disponibilidad</option><option value="disponible">disponible</option><option value="agotado">agotado</option>
          </select>
          <select aria-label="Stock bajo" value={lowStock} onChange={(event) => { setLowStock(event.target.value as '' | 'true' | 'false'); setPage(1); }} className={INPUT_CLASSES}>
            <option value="">Stock bajo: todos</option><option value="true">Solo stock bajo</option><option value="false">Sin stock bajo</option>
          </select>
          <select aria-label="Proveedor" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPage(1); }} className={INPUT_CLASSES}>
            <option value="">Todos los proveedores</option>
            {(suppliersQuery.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </div>
      </section>
      {suppliersQuery.error && <ErrorBanner message={`No se pudieron cargar los proveedores. ${suppliersQuery.error.message}`} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {productsQuery.error && <ErrorBanner message={productsQuery.error.message} />}
      {productsQuery.loading ? (
        <div className="flex items-center gap-2 py-8"><Spinner /><span>Cargando inventario de limpieza…</span></div>
      ) : (
        <>
          <DataTable columns={columns} rows={productsQuery.data?.data ?? []} rowKey={(row) => row.id} caption="Productos del inventario de limpieza" pageSize={pageSize} emptyMessage="No hay materiales de limpieza que coincidan con la búsqueda y los filtros." />
          <Pagination page={page} pageSize={pageSize} total={productsQuery.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="Paginación del inventario de limpieza" />
        </>
      )}

      {canManage && formState && (
        <Modal open title={formState.mode === 'create' ? 'Nuevo producto de limpieza' : `Editar · ${formState.product.name}`} onClose={() => setFormState(null)}>
          <ProductForm
            mode="cleaning"
            suppliers={suppliersQuery.data ?? []}
            product={formState.mode === 'edit' ? formState.product : null}
            onCancel={() => setFormState(null)}
            onSubmit={async (payload) => {
              const cleaningPayload = { ...payload, category: 'material de limpieza' as const };
              if (formState.mode === 'create') await createCleaningProduct(cleaningPayload);
              else await updateCleaningProduct(formState.product.id, cleaningPayload);
              setFormState(null);
              setToast(formState.mode === 'create' ? 'Producto de limpieza creado correctamente.' : 'Producto de limpieza actualizado correctamente.');
              productsQuery.reload();
            }}
          />
        </Modal>
      )}
      <Modal open={detailId !== null} title="Detalle del material de limpieza" onClose={() => setDetailId(null)}>
        {detailId !== null && (
          <ProductDetail
            productId={detailId}
            loadProduct={getCleaningProduct}
            canManage={canManage}
            createMovement={canManage ? createCleaningMovement : undefined}
            onChanged={productsQuery.reload}
          />
        )}
      </Modal>
      {canManage && (
        <ConfirmDialog
          open={deleteTarget !== null}
          title="Eliminar producto de limpieza"
          message={deleteTarget ? `¿Deseas eliminar “${deleteTarget.name}”? Esta acción no se puede deshacer.` : ''}
          confirmLabel="Eliminar"
          loading={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => !deleting && setDeleteTarget(null)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={4000} />}
    </div>
  );
}

export default CleaningInventoryPage;
