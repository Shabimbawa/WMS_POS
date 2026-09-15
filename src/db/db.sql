-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.supplier (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT supplier_pkey PRIMARY KEY (id)
);
CREATE TABLE public.product_category (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  size_kg numeric NOT NULL CHECK (size_kg > 0::numeric),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  selling_price numeric CHECK (selling_price IS NULL OR selling_price >= 0::numeric),
  variety text,
  is_available boolean NOT NULL DEFAULT false,
  code text,
  CONSTRAINT product_category_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  date_list_received date NOT NULL,
  reference text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shipment_pkey PRIMARY KEY (id),
  CONSTRAINT shipment_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(id)
);
CREATE TABLE public.container (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL,
  container_no text,
  is_company_truck boolean NOT NULL DEFAULT true,
  date_delivered date,
  date_unloaded date,
  status text NOT NULL DEFAULT 'DOCUMENTED'::text CHECK (status = ANY (ARRAY['DOCUMENTED'::text, 'ARRIVED_AT_PORT'::text, 'DELIVERED'::text, 'UNLOADED'::text, 'CANCELLED'::text])),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  items_match boolean,
  CONSTRAINT container_pkey PRIMARY KEY (id),
  CONSTRAINT container_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipment(id)
);
CREATE TABLE public.container_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL,
  product_category_id uuid NOT NULL,
  qty_sacks integer NOT NULL CHECK (qty_sacks >= 0),
  price_per_sack numeric CHECK (price_per_sack IS NULL OR price_per_sack >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actual_qty_sacks integer CHECK (actual_qty_sacks IS NULL OR actual_qty_sacks >= 0),
  CONSTRAINT container_item_pkey PRIMARY KEY (id),
  CONSTRAINT container_item_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.container(id),
  CONSTRAINT container_item_product_category_id_fkey FOREIGN KEY (product_category_id) REFERENCES public.product_category(id)
);
CREATE TABLE public.stock_status (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_category_id uuid NOT NULL UNIQUE,
  remaining_qty integer NOT NULL DEFAULT 0 CHECK (remaining_qty >= 0),
  selling_price numeric CHECK (selling_price IS NULL OR selling_price >= 0::numeric),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_status_pkey PRIMARY KEY (id),
  CONSTRAINT stock_status_product_category_id_fkey FOREIGN KEY (product_category_id) REFERENCES public.product_category(id)
);
CREATE TABLE public.profiles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  roles USER-DEFINED,
  user_id uuid,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.container_discrepancy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL,
  container_item_id uuid,
  product_category_id uuid NOT NULL,
  declared_qty integer CHECK (declared_qty IS NULL OR declared_qty >= 0),
  actual_qty integer CHECK (actual_qty IS NULL OR actual_qty >= 0),
  reason text NOT NULL CHECK (reason = ANY (ARRAY['SHORT'::text, 'OVER'::text, 'DAMAGED'::text, 'UNDECLARED'::text, 'OTHER'::text])),
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT container_discrepancy_pkey PRIMARY KEY (id),
  CONSTRAINT container_discrepancy_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.container(id),
  CONSTRAINT container_discrepancy_container_item_id_fkey FOREIGN KEY (container_item_id) REFERENCES public.container_item(id),
  CONSTRAINT container_discrepancy_product_category_id_fkey FOREIGN KEY (product_category_id) REFERENCES public.product_category(id)
);