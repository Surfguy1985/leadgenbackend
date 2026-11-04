/** Recommended Supabase email-template target: /auth/confirm?token_hash={{ .TokenHash }}&type=email. Same handler as /auth/callback (which also handles PKCE ?code=). */
export { GET } from "../callback/route";
