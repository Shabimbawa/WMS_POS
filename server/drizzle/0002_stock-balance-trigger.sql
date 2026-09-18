create or replace function initialize_product_stock_balance()
returns trigger
language plpgsql
as $$
begin
  insert into stock_balance (product_category_id, remaining_qty)
  values (new.id, 0)
  on conflict (product_category_id) do nothing;
  return new;
end;
$$;
--> statement-breakpoint
create trigger product_category_initialize_stock_balance
after insert on product_category
for each row execute function initialize_product_stock_balance();
