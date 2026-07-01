/** Forward every Set-Cookie from Supabase SSR (often multiple chunked cookies). */
export function forwardSetCookies(source: Headers, target = new Headers()): Headers {
	if (typeof source.getSetCookie === "function") {
		for (const cookie of source.getSetCookie()) {
			target.append("Set-Cookie", cookie);
		}
		return target;
	}

	const cookie = source.get("Set-Cookie");
	if (cookie) target.append("Set-Cookie", cookie);

	return target;
}
