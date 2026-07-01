import { data, Outlet, redirect, type LoaderFunctionArgs } from "react-router";
import SidebarLayout from "~/components/Nav/nav-layout";
import { getCurrentUser } from "@workspace/shared/queries/auth.q";
import { forwardSetCookies } from "@workspace/shared/utils/auth-headers.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const resp = await getCurrentUser(request, "AD");

	if (!resp?.user || resp?.error) {
		const loginUrl = resp?.error?.message
			? `/login?error=${encodeURIComponent(resp.error.message)}`
			: "/login";
		throw redirect(loginUrl, { headers: forwardSetCookies(resp.headers) });
	}

	return data({ user: resp.user }, { headers: forwardSetCookies(resp.headers) });
}

export default function LayoutRoute() {
	return (
		<SidebarLayout>
			<Outlet />
		</SidebarLayout>
	);
}
