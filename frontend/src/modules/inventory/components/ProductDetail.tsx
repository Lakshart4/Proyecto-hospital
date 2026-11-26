import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { DataTable, type DataTableColumn } from '../../../shared/components/DataTable';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { formatDateTime } from '../../../shared/lib/formatters';
import { useApi } from '../../../shared/hooks/useApi';
import { listProductMovements } from '../api';
import type { InventoryMovement, MovementPayload, Product } from '../types';
import { MovementDialog } from './MovementDialog';
import { ProductBadges } from './ProductBadges';

export interface ProductDetailProps {
  productId: number;
  loadProduct: (id: number, signal?: AbortSignal) => Promise<Product>;
  canManage?: boolean;
  createMovement?: (productId: number, payload: MovementPayload) => Promise<InventoryMovement>;
  onChanged?: () => void;
}

export function ProductDetail({ productId, loadProduct, canManage = false, createMovement, onChanged }: ProductDetailProps) {
  const productQuery = useApi((signal) => loadProduct(productId, signal), [productId, loadProduct]);
  const movementsQuery = useApi((signal) => listProductMovements(productId, signal), [productId], { enabled: canManage });
  const [movementOpen, setMovementOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const columns: readonly DataTableColumn<InventoryMovement>[] = [
    { key: 'createdAt', header: 'Fecha y hora', sortValue: (row) => row.createdAt, render: (row) => formatDateTime(row.createdAt) },
    { key: 'type', header: 'Tipo', sortValue: (row) => row.type },
    { key: 'before', header: 'Cantidad anterior', sortValue: (row) => row.quantityBefore },
    { key: 'after', header: 'Cantidad resultante', sortValue: (row) => row.quantityAfter },
    { key: 'difference', header: 'Cambio', sortValue: (row) => row.quantityAfter - row.quantityBefore, render: (row) => {
      const difference = row.quantityAfter - row.quantityBefore;
      return `${difference > 0 ? '+' : ''}${difference.toLocaleString('es-MX')}`;
    } },
    { key: 'reason', header: 'Motivo', sortValue: (row) => row.reason, render: (row) => <span className="block max-w-xs whitespace-normal">{row.reason}</span> },
    { key: 'user', header: 'Usuario', sortValue: (row) => row.user?.name ?? '', render: (row) => row.user?.name ?? `Usuario ${row.userId}` },
  ];

  if (productQuery.loading) {
    return <div className="flex items-center gap-2 py-6"><Spinner /><span>Cargando detalle del producto…</span></div>;
  }
  if (productQuery.error) return <ErrorBanner message={productQuery.error.message} />;
  const product = productQuery.data;
  if (!product) return null;
  const medication = product.medicationInfo;

  return (
    <div className="flex max-h-[78vh] flex-col gap-6 overflow-y-auto pr-1">
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      <section aria-labelledby="product-summary" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="product-summary" className="text-xl font-semibold text-heading">{product.name}</h3>
            <p className="text-sm text-muted">{product.category} · {product.classification}</p>
          </div>
          <ProductBadges product={product} />
        </div>
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-active p-4 md:grid-cols-4">
          <div><dt className="text-xs font-medium text-muted">Existencia</dt><dd className="text-lg font-semibold">{product.quantity.toLocaleString('es-MX')}</dd></div>
          <div><dt className="text-xs font-medium text-muted">Stock mínimo</dt><dd className="text-lg font-semibold">{product.minStock.toLocaleString('es-MX')}</dd></div>
          <div><dt className="text-xs font-medium text-muted">Disponibilidad</dt><dd>{product.availability}</dd></div>
          <div><dt className="text-xs font-medium text-muted">Proveedor</dt><dd>{product.supplier?.name ?? `Proveedor ${product.supplierId}`}</dd></div>
        </dl>
        {medication && (
          <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
            <div><dt className="text-xs font-medium text-muted">Tipo de medicamento</dt><dd>{medication.type}</dd></div>
            <div><dt className="text-xs font-medium text-muted">Principio activo</dt><dd>{medication.activeIngredient}</dd></div>
            {medication.type === 'de patente' && <div><dt className="text-xs font-medium text-muted">Nombre comercial</dt><dd>{medication.tradeName}</dd></div>}
            <div><dt className="text-xs font-medium text-muted">Clasificación de control</dt><dd>{medication.controlClass}</dd></div>
            <div><dt className="text-xs font-medium text-muted">Receta requerida</dt><dd>{medication.requiresPrescription ? 'Sí' : 'No'}</dd></div>
          </dl>
        )}
        {canManage && createMovement && (
          <div className="flex justify-end"><Button onClick={() => setMovementOpen(true)}>Registrar movimiento</Button></div>
        )}
      </section>

      {canManage && (
        <section aria-labelledby="product-movements" className="flex flex-col gap-3">
          <div>
            <h3 id="product-movements" className="text-lg font-semibold text-heading">Historial de movimientos</h3>
            <p className="text-sm text-muted">Registros inmodificables, del más reciente al más antiguo.</p>
          </div>
          {movementsQuery.error && <ErrorBanner message={movementsQuery.error.message} />}
          {movementsQuery.loading ? (
            <div className="flex items-center gap-2 py-4"><Spinner /><span>Cargando movimientos…</span></div>
          ) : (
            <DataTable columns={columns} rows={movementsQuery.data ?? []} rowKey={(row) => row.id} caption={`Movimientos de ${product.name}`} emptyMessage="Este producto no tiene movimientos registrados." />
          )}
        </section>
      )}

      {movementOpen && createMovement && (
        <MovementDialog
          product={product}
          onClose={() => setMovementOpen(false)}
          onSubmit={async (payload) => {
            setActionError(null);
            await createMovement(product.id, payload);
          }}
          onSaved={() => {
            setMovementOpen(false);
            productQuery.reload();
            movementsQuery.reload();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
