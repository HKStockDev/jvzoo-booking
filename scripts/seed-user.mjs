import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SEED_USERS = {
	admin: {
		id: "a0000000-0000-4000-8000-000000000001",
		email: process.env.SEED_ADMIN_EMAIL ?? "seed-admin@wandernest.local",
		password: process.env.SEED_ADMIN_PASSWORD ?? "SeedAdmin123!",
		firstName: "Seed",
		lastName: "Admin",
		phone: null,
		role: "admin",
	},
	consumer: {
		id: "a0000000-0000-4000-8000-000000000002",
		email: process.env.SEED_CONSUMER_EMAIL ?? "seed-consumer@wandernest.local",
		password: process.env.SEED_CONSUMER_PASSWORD ?? "SeedConsumer123!",
		firstName: "Seed",
		lastName: "Consumer",
		phone: "+971500000000",
		role: "consumer",
	},
};

const supabase = createClient(
	process.env.VITE_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

async function ensureRole(roleName) {
	const { data: existing, error: fetchError } = await supabase
		.from("user_roles")
		.select("id, role_name")
		.eq("role_name", roleName)
		.maybeSingle();

	if (fetchError) throw new Error(`user_roles: ${fetchError.message}`);
	if (existing) return existing;

	const { data, error } = await supabase
		.from("user_roles")
		.insert({ role_name: roleName })
		.select("id, role_name")
		.single();

	if (error) throw new Error(`user_roles ${roleName}: ${error.message}`);
	return data;
}

async function ensureSeedUser(user) {
	const role = await ensureRole(user.role);

	const { data: existing } = await supabase.auth.admin.getUserById(user.id);
	if (!existing?.user) {
		const { error } = await supabase.auth.admin.createUser({
			id: user.id,
			email: user.email,
			password: user.password,
			email_confirm: true,
			user_metadata: {
				first_name: user.firstName,
				last_name: user.lastName,
				...(user.phone ? { phone_number: user.phone } : {}),
			},
		});
		if (error && !error.message.toLowerCase().includes("already")) {
			throw new Error(`auth ${user.role}: ${error.message}`);
		}
	} else {
		const { error } = await supabase.auth.admin.updateUserById(user.id, {
			email: user.email,
			password: user.password,
			email_confirm: true,
			user_metadata: {
				first_name: user.firstName,
				last_name: user.lastName,
				...(user.phone ? { phone_number: user.phone } : {}),
			},
		});
		if (error) throw new Error(`auth update ${user.role}: ${error.message}`);
	}

	const { error: profileError } = await supabase.from("app_users").upsert(
		{
			user_id: user.id,
			first_name: user.firstName,
			last_name: user.lastName,
			phone_number: user.phone,
			role: role.id,
			status: true,
		},
		{ onConflict: "user_id" },
	);

	if (profileError) throw new Error(`app_users ${user.role}: ${profileError.message}`);

	console.log(`✓ ${user.role} user ready`);
	console.log(`  Email:    ${user.email}`);
	console.log(`  Password: ${user.password}`);
	console.log(`  Confirmed: yes`);
}

async function main() {
	if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
	}

	const target = (process.argv[2] ?? "consumer").toLowerCase();
	const users =
		target === "all"
			? [SEED_USERS.admin, SEED_USERS.consumer]
			: target === "admin"
				? [SEED_USERS.admin]
				: target === "consumer"
					? [SEED_USERS.consumer]
					: null;

	if (!users) {
		throw new Error('Usage: node scripts/seed-user.mjs [consumer|admin|all]');
	}

	for (const user of users) {
		await ensureSeedUser(user);
	}
}

main().catch((error) => {
	console.error("Seed user failed:", error.message);
	process.exit(1);
});
