import { AuthService } from "@workspace/shared/services/auth.service";
import type { AdminUser, FullCurrentUser } from "@workspace/shared/types/user";
import { forwardSetCookies } from "@workspace/shared/utils/auth-headers.server";
import { genAuthSecurity } from "@workspace/shared/utils/auth-utils.server";

export const getCurrentUser = async (request: Request, app: "AD" | "FP" = "FP") => {
	const { authId, headers: securityHeaders } = genAuthSecurity(request);
	const authSvc = new AuthService(request, { headers: securityHeaders });

	const userSession = app === "FP" ? await authSvc.getFullCurrentUser() : await authSvc.getCurrentUser();

	const headers = forwardSetCookies(securityHeaders);
	forwardSetCookies(authSvc.headers, headers);

	return {
		user: (userSession?.user as FullCurrentUser | AdminUser) ?? null,
		error: userSession?.error ?? null,
		authId,
		headers,
	};
};
