BEGIN;

ALTER TABLE medicine_lots ALTER COLUMN status SET NOT NULL;
ALTER TABLE purchases ALTER COLUMN status SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN review_status SET NOT NULL;
ALTER TABLE inventory_transactions ALTER COLUMN transaction_type SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN action SET NOT NULL;

CREATE INDEX idx_medicine_lots_supplier ON medicine_lots(supplier_id);
CREATE INDEX idx_medicine_lots_purchase_item ON medicine_lots(purchase_item_id);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_invoice ON purchases(invoice_id);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_medicine ON purchase_items(medicine_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_medicine ON sale_items(medicine_id);
CREATE INDEX idx_sale_items_medicine_lot ON sale_items(medicine_lot_id);
CREATE INDEX idx_inventory_transactions_medicine_lot ON inventory_transactions(medicine_lot_id);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);

COMMIT;
