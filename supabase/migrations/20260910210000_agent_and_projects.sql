-- Dual agent + catalog. Apply after 20260910204500_initial_lead_memory.sql

alter table public.contacts
  add column if not exists agent text not null default 'sales';

alter table public.contacts
  drop constraint if exists contacts_agent_check;

alter table public.contacts
  add constraint contacts_agent_check check (agent in ('sales', 'housing'));

alter table public.contacts
  drop constraint if exists contacts_whatsapp_id_key;

create unique index if not exists contacts_agent_whatsapp_id_idx
  on public.contacts (agent, whatsapp_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  district text not null,
  city text not null,
  bedrooms int[] not null,
  price_from int not null,
  price_to int not null,
  monthly_from int not null,
  programs text[] not null,
  delivery_stage text not null,
  highlights text[] not null default '{}',
  active boolean not null default true
);

alter table public.projects enable row level security;

insert into public.projects (
  slug, name, district, city, bedrooms, price_from, price_to, monthly_from, programs, delivery_stage, highlights
) values
  (
    'surco-parques', 'Parques de Surco', 'Santiago de Surco', 'Lima',
    ARRAY[2,3], 318000, 465000, 1650, ARRAY['mivivienda'], 'entrega 2027',
    ARRAY['cerca al parque de la amistad','áreas comunes','cuota inicial financiable']
  ),
  (
    'comas-norte', 'Alameda Norte', 'Comas', 'Lima',
    ARRAY[2,3], 145000, 228000, 780, ARRAY['mivivienda','techo_propio'], 'en construcción',
    ARRAY['apto Techo Propio','cerca a avenida Túpac Amaru','bono del buen pagador']
  ),
  (
    'carabayllo-sol', 'Sol de Carabayllo', 'Carabayllo', 'Lima',
    ARRAY[2,3], 118000, 175000, 620, ARRAY['techo_propio'], 'preventa',
    ARRAY['BFH aplicable','casas y departamentos','proyectos de interés social']
  ),
  (
    'san-miguel-mar', 'Mar Pacífico', 'San Miguel', 'Lima',
    ARRAY[1,2,3], 245000, 410000, 1280, ARRAY['mivivienda'], 'entrega inmediata',
    ARRAY['cerca al malecón','1 a 3 dormitorios','sala de ventas en el edificio']
  ),
  (
    'ate-bosques', 'Bosques de Ate', 'Ate', 'Lima',
    ARRAY[2,3], 168000, 255000, 890, ARRAY['mivivienda'], 'en construcción',
    ARRAY['valor Mivivienda','parques internos','fácil acceso a Javier Prado']
  ),
  (
    'trujillo-ribera', 'Ribera del Moche', 'Víctor Larco', 'Trujillo',
    ARRAY[2,3], 132000, 198000, 710, ARRAY['mivivienda','techo_propio'], 'preventa',
    ARRAY['provincias','programas FMV','cuotas accesibles']
  )
on conflict (slug) do nothing;
