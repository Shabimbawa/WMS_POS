-- ============================================================
-- Optional: flattened view for the supplier notebook
--
-- Only needed if you want to sort container rows by
-- date_list_received. PostgREST cannot order a parent result set
-- by a referenced table's column, so the join has to be
-- pre-flattened server side.
--
-- Point getSupplierNotebook at 'v_container_notebook' instead of
-- 'container' and all three dates become plain top-level columns.
-- Line items still need a second query or an embed.
-- ============================================================

create or replace view v_container_notebook as
select
    c.id,
    c.container_no,
    c.is_company_truck,
    c.status,
    c.date_delivered,
    c.date_unloaded,
    c.notes,
    s.id                  as shipment_id,
    s.date_list_received,
    s.reference,
    sup.id                as supplier_id,
    sup.name              as supplier_name,
    sup.code              as supplier_code
from container c
join shipment s   on s.id = c.shipment_id
join supplier sup on sup.id = s.supplier_id;