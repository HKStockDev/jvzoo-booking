import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import viteCompression from "vite-plugin-compression";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, path.resolve(__dirname, "../"), "");

	return {
		plugins: [
			tailwindcss(),
			reactRouter(),
			tsconfigPaths({
				projects: [
					path.resolve(__dirname, "tsconfig.json"),
					path.resolve(__dirname, "../shared/tsconfig.json"),
				],
			}),
			viteCompression({
				verbose: true,
				disable: false,
				algorithm: "brotliCompress",
				ext: ".br",
			}),
		],
		resolve: {
			alias: {
				"~": path.resolve(__dirname, "./app"),
				"@workspace/shared": path.resolve(__dirname, "../shared/src"),
				// /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
				"@tabler/icons-react": "@tabler/icons-react/dist/esm/icons/index.mjs",
			},
		},
		optimizeDeps: {
			exclude: ["@tanstack/react-query"],
			include: [
				"@tabler/icons-react",
				"lucide-react",
				"@radix-ui/react-dropdown-menu",
				"@radix-ui/react-tooltip",
				"@radix-ui/react-dialog",
			],
		},
		define: {
			"process.env.VITE_ENV": JSON.stringify(env.VITE_ENV),
			"process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
			"process.env.VITE_PROJECT_ID": JSON.stringify(env.VITE_PROJECT_ID),
			"process.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
			"process.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL),
			"process.env.VITE_MAIN_APP_URL": JSON.stringify(env.VITE_MAIN_APP_URL),
			"process.env.VITE_RECAPTCHA_SITE_KEY": JSON.stringify(env.VITE_RECAPTCHA_SITE_KEY),
			"process.env.JVZOO_SECRET_KEY": JSON.stringify(env.JVZOO_SECRET_KEY),
			"process.env.JVZOO_CHECKOUT_URL": JSON.stringify(env.JVZOO_CHECKOUT_URL),
			"process.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(env.SUPABASE_SERVICE_ROLE_KEY),
			"process.env.RESEND_API_KEY": JSON.stringify(env.RESEND_API_KEY),
			"process.env.ENABLE_DEV_TEST_MODE": JSON.stringify(env.ENABLE_DEV_TEST_MODE),
			"process.env.RECAPTCHA_SECRET_KEY": JSON.stringify(env.RECAPTCHA_SECRET_KEY),
			"process.env.REDIS_URL": JSON.stringify(env.REDIS_URL),
			"process.env.DATABASE_URL": JSON.stringify(env.DATABASE_URL),
		},
		server: {
			host: true,
			port: 5175,
		},
	};
});
