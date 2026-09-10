import { upsertContact, insertMessage } from "../src/db";
import { runAgent } from "../src/agent";

const contact = await upsertContact({
  agent: "sales",
  phone: "51900000000",
  username: "prueba",
});

const userText = "Hola, busco un depa de 2 dormitorios en Surco";
await insertMessage({
  contactId: contact.id,
  conversationId: contact.conversationId,
  role: "human",
  content: userText,
});

const reply = await runAgent({ agent: "sales", contact, userText });
console.log(reply);
