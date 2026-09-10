-- Campos que el CRM y el resto del producto pueden leer sin parsear JSON.

alter table public.contacts
  add column if not exists intent_score int check (intent_score is null or intent_score between 1 and 5);

alter table public.lead_profiles
  add column if not exists savings numeric;

create or replace view public.crm_leads as
select
  c.id,
  c.agent,
  c.whatsapp_id as phone,
  c.phone_number,
  c.name,
  c.email,
  c.intent_score,
  conv.id as conversation_id,
  conv.stage,
  conv.last_message_at,
  conv.is_active,
  lp.bedrooms,
  lp.budget_max,
  lp.savings,
  lp.preferred_zones,
  lp.extra,
  appt.id as appointment_id,
  appt.status as appointment_status,
  appt.requested_for,
  appt.notes as appointment_notes,
  c.created_at,
  c.updated_at
from public.contacts c
left join public.conversations conv
  on conv.contact_id = c.id and conv.is_active = true
left join public.lead_profiles lp
  on lp.contact_id = c.id
left join lateral (
  select a.id, a.status, a.requested_for, a.notes
  from public.appointments a
  where a.contact_id = c.id
  order by a.created_at desc
  limit 1
) appt on true;
