// corporate patrons' logos, proxied from the patrons site's image folder (config.patrons: site + images) (same origin, so WebGL may read them)
export const GET = ({ locals, params }) => locals.relay.logo(params.file);
