// Esquemas del Módulo_Inventario_Limpieza (Req. 23).
//
// Comparte los formatos de Producto y Movimiento con el inventario médico, pero su
// servicio restringe siempre la categoría a `material de limpieza`.

export {
  movementBodySchema,
  productBodySchema,
  productIdParamSchema,
  productListQuerySchema,
  productMovementsQuerySchema,
  type MovementBody,
  type ProductBody,
  type ProductListQuery,
  type ProductMovementsQuery,
} from './inventory';
