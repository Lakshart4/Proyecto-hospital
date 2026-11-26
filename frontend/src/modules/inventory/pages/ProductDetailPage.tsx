import { Link, useParams } from 'react-router-dom';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { createMovement, getProduct } from '../api';
import { ProductDetail } from '../components/ProductDetail';

/** Página independiente integrable en `/inventario/:id`; el listado también ofrece el detalle en diálogo. */
export function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return <ErrorBanner message="El identificador del producto no es válido." />;
  }
  return (
    <div className="flex flex-col gap-5">
      <Link to="/inventario" className="w-fit text-sm font-medium text-primary hover:underline">← Volver al inventario médico</Link>
      <h1 className="text-2xl font-bold text-heading">Detalle del producto</h1>
      <ProductDetail productId={id} loadProduct={getProduct} canManage createMovement={createMovement} />
    </div>
  );
}

export default ProductDetailPage;
