import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { canManageStock } from '../../lib/types';
import { type Item, useItemStock, useItems } from '../../lib/queries/items';
import { useSuppliers } from '../../lib/queries/suppliers';
import ItemModal from './ItemModal';
import DeleteItemModal from './DeleteItemModal';
import ItemsTable from './ItemsTable';
import StockStatusTable from './StockStatusTable';
import { SkeletonRows } from '../../components/Skeleton';

export default function ItemsSection() {
  const { auth } = useAuth();
  const { data: items, isLoading: itemsLoading } = useItems();
  const { data: stock, isLoading: stockLoading } = useItemStock();
  const { data: suppliers } = useSuppliers();

  const [editModal, setEditModal] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  const isAdmin = canManageStock(auth?.role);

  return (
    <>
      <div className="card">
        <h2>สถานะสต๊อก</h2>
        {stockLoading ? <SkeletonRows rows={5} /> : <StockStatusTable stock={stock ?? []} />}
      </div>

      {isAdmin && (
        <div className="card section-gap">
          <div className="card-head">
            <h2>สินค้าในคลัง</h2>
            <button onClick={() => setEditModal({ open: true, item: null })}>+ เพิ่มสินค้าใหม่</button>
          </div>
          {itemsLoading ? (
            <SkeletonRows rows={5} />
          ) : (
            <ItemsTable
              items={items ?? []}
              onEdit={(item) => setEditModal({ open: true, item })}
              onDelete={(item) => setDeleteTarget(item)}
            />
          )}
        </div>
      )}

      {editModal.open && (
        <ItemModal
          item={editModal.item}
          suppliers={suppliers ?? []}
          onClose={() => setEditModal({ open: false, item: null })}
        />
      )}
      {deleteTarget && <DeleteItemModal item={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </>
  );
}
