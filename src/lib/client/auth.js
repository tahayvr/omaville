// Sign-in from the page (Better Auth's client): a provider's login, and signing out.
import { createAuthClient } from "better-auth/svelte";

const client = createAuthClient();
export const signIn = (provider) => client.signIn.social({ provider, callbackURL: "/", errorCallbackURL: "/?signin=denied" });
export const signOut = () => client.signOut().then(() => location.reload());
