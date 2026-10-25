// the relay's health as JSON (the /health page and the water tower read it)
export const GET = ({ locals }) => locals.relay.status();
