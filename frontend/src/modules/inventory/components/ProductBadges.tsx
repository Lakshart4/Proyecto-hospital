import { StatusBadge } from '../../../shared/components/StatusBadge';
import type { Product } from '../types';

export function ProductBadges({ product }: { product: Product }) {
  const controlled = product.category === 'medicamento' && product.medicationInfo?.controlClass === 'controlado';
  return (
    <div className="flex flex-wrap gap-1">
      {product.quantity === 0 && <StatusBadge value="agotado" tone="danger" />}
      {product.lowStock && <StatusBadge value="Stock bajo" tone="danger" />}
      {controlled && <StatusBadge value="Controlado" tone="purple" />}
      {!product.lowStock && !controlled && <StatusBadge value={product.availability} tone="success" />}
    </div>
  );
}
