create extension if not exists pgcrypto;

create type public.lead_stage as enum (
  'new',
  'discovering',
  'qualified',
  'appointment_requested',
  'handed_off',
  'nurturing',
  'closed'
);

create type public.message_direction as enum ('inbound', 'outbound');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  whatsapp_id text not null unique,
  phone_number text,
  name text,
  email text,
  consent_to_contact boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kapso_conversation_id text unique,
  stage public.lead_stage not null default 'new',
  current_step text not null default 'identify_intent',
  summary text,
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_conversation_per_contact
  on public.conversations(contact_id)
  where is_active;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kapso_message_id text unique,
  direction public.message_direction not null,
  message_type text not null default 'text',
  body text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);

create table public.lead_profiles (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  operation text check (operation in ('buy', 'rent', 'sell', 'unknown')),
  property_type text,
  preferred_zones text[] not null default '{}',
  budget_min numeric,
  budget_max numeric,
  currency text,
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  move_timeline text,
  preferred_contact_time text,
  urgency text,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  kind text not null check (kind in ('call', 'visit')),
  requested_for timestamptz,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'cancelled', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'cancelled', 'failed')),
  reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index pending_follow_ups_idx
  on public.follow_ups(scheduled_for)
  where status = 'pending';

create table public.processed_events (
  idempotency_key text primary key,
  event_name text not null,
  processed_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger lead_profiles_set_updated_at
before update on public.lead_profiles
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.lead_profiles enable row level security;
alter table public.appointments enable row level security;
alter table public.follow_ups enable row level security;
alter table public.processed_events enable row level security;
