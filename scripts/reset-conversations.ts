import { getSupabase } from "../src/lib/supabase";

const supabase = getSupabase();

const { count: contactsBefore } = await supabase
  .from("contacts")
  .select("id", { count: "exact", head: true });
const { count: messagesBefore } = await supabase
  .from("messages")
  .select("id", { count: "exact", head: true });

const { error: contactError } = await supabase
  .from("contacts")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
if (contactError) throw contactError;

const { error: eventError } = await supabase
  .from("processed_events")
  .delete()
  .neq("idempotency_key", "");
if (eventError) throw eventError;

const { count: contactsAfter } = await supabase
  .from("contacts")
  .select("id", { count: "exact", head: true });
const { count: messagesAfter } = await supabase
  .from("messages")
  .select("id", { count: "exact", head: true });

console.log(
  JSON.stringify({
    msg: "conversations_reset",
    supabase: {
      contacts: { before: contactsBefore ?? 0, after: contactsAfter ?? 0 },
      messages: { before: messagesBefore ?? 0, after: messagesAfter ?? 0 },
    },
  }),
);
