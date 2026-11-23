import { createRemoteJWKSet, jwtVerify } from "jose";

// "Sign in with Google" gives the browser a signed ID token. We check three things before trusting it:
// the signature (against Google's public keys), that it was issued by Google, and that it was issued for OUR app
// (the audience is our client id), so a token made for some other website cannot be replayed here.

export interface GoogleProfile {
  sub: string; // Google's permanent id for the person
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function createGoogleVerifier(clientId: string) {
  return async (credential: string): Promise<GoogleProfile> => {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      emailVerified: payload.email_verified === true,
      name: String(payload.name ?? ""),
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    };
  };
}
