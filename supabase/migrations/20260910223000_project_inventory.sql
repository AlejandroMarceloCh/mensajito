-- Tipologías e inventario por proyecto (disponibles = total - sold)

alter table public.projects
  add column if not exists total_units int,
  add column if not exists sold_units int,
  add column if not exists available_units int;

create table if not exists public.project_units (
  id uuid primary key default gen_random_uuid(),
  project_slug text not null references public.projects (slug) on delete cascade,
  kind text not null check (kind in ('departamento', 'casa')),
  bedrooms int not null,
  bathrooms int not null,
  area_m2 int not null,
  price int not null,
  monthly int not null,
  total int not null,
  sold int not null,
  unique (project_slug, kind, bedrooms)
);

alter table public.project_units enable row level security;

insert into public.project_units (
  project_slug, kind, bedrooms, bathrooms, area_m2, price, monthly, total, sold
) values
  ('surco-parques', 'departamento', 2, 2, 68, 318000, 1650, 45, 28),
  ('surco-parques', 'departamento', 3, 2, 92, 465000, 2350, 30, 19),
  ('comas-norte', 'departamento', 2, 1, 58, 145000, 780, 80, 52),
  ('comas-norte', 'departamento', 3, 2, 74, 228000, 1180, 40, 22),
  ('carabayllo-sol', 'departamento', 2, 1, 52, 118000, 620, 60, 21),
  ('carabayllo-sol', 'casa', 3, 2, 86, 175000, 890, 24, 9),
  ('san-miguel-mar', 'departamento', 1, 1, 42, 245000, 1280, 20, 17),
  ('san-miguel-mar', 'departamento', 2, 2, 64, 328000, 1690, 48, 31),
  ('san-miguel-mar', 'departamento', 3, 2, 88, 410000, 2100, 16, 8),
  ('ate-bosques', 'departamento', 2, 2, 61, 168000, 890, 70, 38),
  ('ate-bosques', 'departamento', 3, 2, 79, 255000, 1320, 36, 14),
  ('trujillo-ribera', 'departamento', 2, 1, 56, 132000, 710, 54, 16),
  ('trujillo-ribera', 'departamento', 3, 2, 78, 198000, 1050, 28, 7)
on conflict (project_slug, kind, bedrooms) do update set
  bathrooms = excluded.bathrooms,
  area_m2 = excluded.area_m2,
  price = excluded.price,
  monthly = excluded.monthly,
  total = excluded.total,
  sold = excluded.sold;

update public.projects p
set
  total_units = s.total,
  sold_units = s.sold,
  available_units = s.total - s.sold
from (
  select project_slug, sum(total) as total, sum(sold) as sold
  from public.project_units
  group by project_slug
) s
where p.slug = s.project_slug;
