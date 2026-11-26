import { useEffect, useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../../../shared/components/DataTable';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { SearchBox } from '../../../shared/components/SearchBox';
import { Spinner } from '../../../shared/components/Spinner';
import { Tabs } from '../../../shared/components/Tabs';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { createMovement, createProduct, deleteProduct, getProduct, listProducts, listSupplierOptions, updateProduct } from '../api';
import { MovementHistory } from '../components/MovementHistory';
import { Pagination } from '../components/Pagination';
import { ProductBadges } from '../components/ProductBadges';
import { ProductDetail } from '../components/ProductDetail';
import { ProductForm } from '../components/ProductForm';
import { CONTROL_CLASSES, MEDICAL_CATEGORIES, MEDICATION_TYPES, SUPPLY_SUBCATEGORIES } from '../schemas';
import type { ControlClass, MedicalProductCategory, MedicationType, Product, SupplySubcategory } from '../types';

type FormState = { mode: 'create' } | { mode: 'edit'; product: Product } | null;
type InventoryTab = 'productos' | 'movimientos';

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('productos');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MedicalProductCategory | ''>('');
  const [subcategory, setSubcategory] = useState<SupplySubcategory | ''>('');
  const [availability, setAvailability] = useState('');
  const [lowStock, setLowStock] = useState<'' | 'true' | 'false'>('');
  const [supplierId, setSupplierId] = useState('');
  const [medicationType, setMedicationType] = useState<MedicationType | ''>('');
  const [controlClass, setControlClass] = useState<ControlClass | ''>('');
  const [requiresPrescription, setRequiresPrescription] = useState<'' | 'true' | 'false'>('');
  const [controlled, setControlled] = useState<'' | 'true' | 'false'>('');
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
    (signal) => listProducts({
      search: search.trim(), category, subcategory, availability, lowStock,
      supplierId: supplierId ? Number(supplierId) : '', medicationType, controlClass,
      requiresPrescription, controlled, page, pageSize,
    }, signal),
    [search, category, subcategory, availability, lowStock, supplierId, medicationType, controlClass, requiresPrescription, controlled, page, pageSize],
  );

  useEffect(() => {
    if (!productsQuery.data) return;
    const pages = Math.max(1, Math.ceil(productsQuery.data.total / pageSize));
    if (page > pages) setPage(pages);
  }, [productsQuery.data, page, pageSize]);

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setSearch(''); setCategory(''); setSubcategory(''); setAvailability(''); setLowStock(''); setSupplierId('');
    setMedicationType(''); setControlClass(''); setRequiresPrescription(''); setControlled(''); setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteProduct(deleteTarget.id);
      setDeleteTarget(null);
      setToast('Producto eliminado correctamente.');
      productsQuery.reload();
    } catch (error) {
      setActionError(toApiError(error).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns: readonly DataTableColumn<Product>[] = [
    { key: 'name', header: 'Producto', sortValue: (row) => row.name, render: (row) => <button type="button" onClick={() => setDetailId(row.id)} className="font-medium text-primary hover:underline">{row.name}</button> },
    { key: 'category', header: 'Categoría', sortValue: (row) => row.category },
    { key: 'classification', header: 'Clasificación', sortValue: (row) => row.classification },
    { key: 'medication', header: 'Medicamento', sortValue: (row) => row.medicationInfo?.type ?? '', render: (row) => row.medicationInfo ? `${row.medicationInfo.type} · ${row.medicationInfo.controlClass}` : '—' },
    { key: 'quantity', header: 'Existencia', sortValue: (row) => row.quantity, render: (row) => row.quantity.toLocaleString('es-MX') },
    { key: 'minStock', header: 'Stock mínimo', sortValue: (row) => row.minStock },
    { key: 'supplier', header: 'Proveedor', sortValue: (row) => row.supplier?.name ?? '', render: (row) => row.supplier?.name ?? '—' },
    { key: 'status', header: 'Estado', render: (row) => <ProductBadges product={row} /> },
    { key: 'actions', header: 'Acciones', render: (row) => (
      <div className="flex items-center gap-3">
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setDetailId(row.id)}>Detalle</button>
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setFormState({ mode: 'edit', product: row })}>Editar</button>
        <button type="button" className="font-medium text-danger hover:underline" onClick={() => setDeleteTarget(row)}>Eliminar</button>
      </div>
    ) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Inventario médico</h1>
          <p className="mt-1 text-sm text-muted">Gestiona insumos médicos y medicamentos, sus existencias y movimientos.</p>
        </div>
        {activeTab === 'productos' && <Button onClick={() => setFormState({ mode: 'create' })}>Nuevo producto</Button>}
      </div>
      <div role="note" className="rounded-md border border-status-purple-fg/30 bg-status-purple-bg px-4 py-3 text-sm text-status-purple-fg">
        Los datos de medicamentos son ficticios y se muestran únicamente con fines de demostración.
      </div>
      <Tabs
        label="Secciones del inventario médico"
        active={activeTab}
        onChange={setActiveTab}
        tabs={[{ id: 'productos', label: 'Productos' }, { id: 'movimientos', label: 'Movimientos' }]}
      />

      {activeTab === 'movimientos' ? <MovementHistory /> : (
        <>
          <section aria-label="Filtros de productos" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SearchBox value={search} onChange={(value) => { setSearch(value); resetPage(); }} placeholder="Buscar producto…" label="Buscar en inventario médico" />
              <Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <select aria-label="Categoría" value={category} onChange={(event) => { setCategory(event.target.value as MedicalProductCategory | ''); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Todas las categorías</option>
                {MEDICAL_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select aria-label="Subcategoría de insumo" value={subcategory} onChange={(event) => { setSubcategory(event.target.value as SupplySubcategory | ''); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Todas las subcategorías</option>
                {SUPPLY_SUBCATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select aria-label="Disponibilidad" value={availability} onChange={(event) => { setAvailability(event.target.value); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Toda disponibilidad</option><option value="disponible">disponible</option><option value="agotado">agotado</option>
              </select>
              <select aria-label="Stock bajo" value={lowStock} onChange={(event) => { setLowStock(event.target.value as '' | 'true' | 'false'); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Stock bajo: todos</option><option value="true">Solo stock bajo</option><option value="false">Sin stock bajo</option>
              </select>
              <select aria-label="Proveedor" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Todos los proveedores</option>
                {(suppliersQuery.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              <select aria-label="Tipo de medicamento" value={medicationType} onChange={(event) => { setMedicationType(event.target.value as MedicationType | ''); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Todos los tipos de medicamento</option>
                {MEDICATION_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select aria-label="Clasificación de control" value={controlClass} onChange={(event) => { setControlClass(event.target.value as ControlClass | ''); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Toda clasificación de control</option>
                {CONTROL_CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select aria-label="Receta requerida" value={requiresPrescription} onChange={(event) => { setRequiresPrescription(event.target.value as '' | 'true' | 'false'); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Receta: todos</option><option value="true">Requiere receta</option><option value="false">No requiere receta</option>
              </select>
              <select aria-label="Medicamento controlado" value={controlled} onChange={(event) => { setControlled(event.target.value as '' | 'true' | 'false'); resetPage(); }} className={INPUT_CLASSES}>
                <option value="">Controlados: todos</option><option value="true">Solo controlados</option><option value="false">No controlados</option>
              </select>
            </div>
          </section>
          {suppliersQuery.error && <ErrorBanner message={`No se pudieron cargar los proveedores. ${suppliersQuery.error.message}`} />}
          {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
          {productsQuery.error && <ErrorBanner message={productsQuery.error.message} />}
          {productsQuery.loading ? (
            <div className="flex items-center gap-2 py-8"><Spinner /><span>Cargando inventario médico…</span></div>
          ) : (
            <>
              <DataTable columns={columns} rows={productsQuery.data?.data ?? []} rowKey={(row) => row.id} caption="Productos del inventario médico" pageSize={pageSize} emptyMessage="No hay productos que coincidan con la búsqueda y los filtros." />
              <Pagination page={page} pageSize={pageSize} total={productsQuery.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="Paginación del inventario médico" />
            </>
          )}
        </>
      )}

      {formState && (
        <Modal open title={formState.mode === 'create' ? 'Nuevo producto médico' : `Editar · ${formState.product.name}`} onClose={() => setFormState(null)}>
          <ProductForm
            mode="medical"
            suppliers={suppliersQuery.data ?? []}
            product={formState.mode === 'edit' ? formState.product : null}
            onCancel={() => setFormState(null)}
            onSubmit={async (payload) => {
              if (formState.mode === 'create') await createProduct(payload);
              else await updateProduct(formState.product.id, payload);
              setFormState(null);
              setToast(formState.mode === 'create' ? 'Producto creado correctamente.' : 'Producto actualizado correctamente.');
              productsQuery.reload();
            }}
          />
        </Modal>
      )}
      <Modal open={detailId !== null} title="Detalle del producto" onClose={() => setDetailId(null)}>
        {detailId !== null && <ProductDetail productId={detailId} loadProduct={getProduct} canManage createMovement={createMovement} onChanged={productsQuery.reload} />}
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar producto"
        message={deleteTarget ? `¿Deseas eliminar “${deleteTarget.name}”? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={4000} />}
    </div>
  );
}

export default InventoryPage;
