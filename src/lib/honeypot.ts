// Stops naive form-filling bots on the REST submit routes only; no protection against scripted or agent callers, which the write rate limits cover.
export function validateHoneypot(body: { website_url?: string; b_phone?: string }) {
  // If the 'website_url' or 'b_phone' fields (common honeypot names) are filled, it's a bot
  if (body.website_url || body.b_phone) {
    console.warn("Honeypot triggered, blocking request");
    return false;
  }
  return true;
}
