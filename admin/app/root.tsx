import { data, Links, Meta, Outlet, redirect, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import ErrorPage from "~/components/Error/ErrorPage";
import { ThemeProvider } from "~/components/Theme/theme-provder";
import { TopLoadingBar } from "~/components/Loaders/TopLoadingBar";
import { Toaster } from "~/components/ui/sonner";
import { getCurrentUser } from "@workspace/shared/queries/auth.q";
import { forwardSetCookies } from "@workspace/shared/utils/auth-headers.server";
import { genAuthSecurity } from "@workspace/shared/utils/auth-utils.server";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap",
	},
];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const { authId, headers: securityHeaders } = genAuthSecurity(request);

	if (url.pathname.startsWith("/login")) {
		if (authId && !url.searchParams.has("error")) {
			const resp = await getCurrentUser(request, "AD");
			if (resp?.user) {
				throw redirect("/", { headers: forwardSetCookies(resp.headers) });
			}
			return data({ user: null }, { headers: forwardSetCookies(resp.headers) });
		}

		return data({ user: null }, { headers: forwardSetCookies(securityHeaders) });
	}

	return data({}, { headers: forwardSetCookies(securityHeaders) });
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning={true}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" href="/favicon-48x.png" type="image/png" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return (
		<ThemeProvider>
			<TopLoadingBar />
			<Outlet />
			<Toaster />
		</ThemeProvider>
	);
}

export function ErrorBoundary() {
	return <ErrorPage />;
}
