import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEMO_STORAGE_BASE =
	"https://hyrmapvpqgfwgjrgubkr.supabase.co/storage/v1/object/public/images";
const SEED_ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

const supabase = createClient(
	process.env.VITE_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

function uniqBy(arr, keyFn) {
	const map = new Map();
	for (const item of arr) {
		const key = keyFn(item);
		if (key != null) map.set(key, item);
	}
	return [...map.values()];
}

function sanitizeWeekdays(weekdays) {
	if (!Array.isArray(weekdays)) return ALL_DAYS;
	const valid = weekdays.filter((d) => typeof d === "number" && d >= 1 && d <= 7);
	return valid.length ? [...new Set(valid)].sort() : ALL_DAYS;
}

async function upsert(table, rows, onConflict = "id") {
	if (!rows?.length) return;
	const { error } = await supabase.from(table).upsert(rows, { onConflict });
	if (error) throw new Error(`${table}: ${error.message}`);
	console.log(`  ✓ ${table} (${rows.length})`);
}

async function insertRows(table, rows) {
	if (!rows?.length) return;
	const { error } = await supabase.from(table).insert(rows);
	if (error && !error.message.includes("duplicate")) {
		throw new Error(`${table}: ${error.message}`);
	}
	console.log(`  ✓ ${table} (${rows.length})`);
}

async function ensureSeedAdmin() {
	const { data: roles, error: rolesError } = await supabase
		.from("user_roles")
		.select("id, role_name")
		.in("role_name", ["admin", "consumer"]);

	if (rolesError) throw new Error(`user_roles: ${rolesError.message}`);

	let adminRole = roles?.find((r) => r.role_name === "admin");
	if (!adminRole) {
		const { data, error } = await supabase
			.from("user_roles")
			.insert({ role_name: "admin" })
			.select("id, role_name")
			.single();
		if (error) throw new Error(`user_roles admin: ${error.message}`);
		adminRole = data;
	}

	if (!roles?.some((r) => r.role_name === "consumer")) {
		const { error } = await supabase.from("user_roles").insert({ role_name: "consumer" });
		if (error && !error.message.includes("duplicate")) {
			throw new Error(`user_roles consumer: ${error.message}`);
		}
	}

	const { data: existing } = await supabase.auth.admin.getUserById(SEED_ADMIN_ID);
	if (!existing?.user) {
		const { error } = await supabase.auth.admin.createUser({
			id: SEED_ADMIN_ID,
			email: "seed-admin@wandernest.local",
			password: "SeedAdmin123!",
			email_confirm: true,
			user_metadata: { first_name: "Seed", last_name: "Admin" },
		});
		if (error && !error.message.toLowerCase().includes("already")) {
			throw new Error(`auth admin: ${error.message}`);
		}
	}

	await upsert(
		"app_users",
		[
			{
				user_id: SEED_ADMIN_ID,
				first_name: "Seed",
				last_name: "Admin",
				phone_number: null,
				role: adminRole.id,
				status: true,
			},
		],
		"user_id",
	);
}

function collectImagePaths(all) {
	const images = new Set();
	const add = (value) => {
		if (typeof value === "string" && value.trim()) images.add(value.trim());
	};

	for (const cat of all.layout?.categoriesResp?.data ?? []) add(cat.image);
	for (const city of all.home?.citiesResp?.data ?? []) add(city.card_image);
	for (const hero of all.home?.heroSectionsResp ?? []) add(hero.image);
	for (const detail of all.tourDetails ?? []) {
		const tour = detail.tour;
		add(tour?.cover_image);
		for (const img of tour?.images ?? []) add(img);
		for (const tag of tour?.tags ?? []) add(tag.image);
	}
	return [...images];
}

async function copyImages(imagePaths) {
	const bucket = "images";
	const { data: buckets } = await supabase.storage.listBuckets();
	if (!buckets?.some((b) => b.name === bucket)) {
		const { error } = await supabase.storage.createBucket(bucket, { public: true });
		if (error && !error.message.toLowerCase().includes("already")) {
			console.warn(`  ! storage bucket "${bucket}": ${error.message}`);
			return;
		}
	}

	let copied = 0;
	for (const filePath of imagePaths) {
		const sourceUrl = `${DEMO_STORAGE_BASE}/${filePath}`;
		try {
			const res = await fetch(sourceUrl);
			if (!res.ok) continue;
			const blob = await res.blob();
			const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
				upsert: true,
				contentType: blob.type || "image/jpeg",
			});
			if (!error) copied++;
		} catch {
			// ignore missing demo assets
		}
	}
	console.log(`  ✓ storage/images (${copied}/${imagePaths.length} copied)`);
}

async function seedFromAll(all) {
	const categories = all.layout?.categoriesResp?.data ?? [];
	const cities = all.home?.citiesResp?.data ?? [];
	const heroes = all.home?.heroSectionsResp ?? [];
	const collections = all.home?.featuredCollectionsResp?.collections ?? [];
	const coupons = all.root?.couponsResp?.coupons ?? [];

	const metaRows = [];
	const categoryRows = [];
	const cityRows = [];
	const heroRows = [];
	const providerRows = [];
	const tagRows = [];
	const tourRows = [];
	const tourTagRows = [];
	const optionRows = [];
	const priceRows = [];
	const ruleRows = [];
	const slotRows = [];
	const collectionRows = [];
	const collectionCityRows = [];
	const collectionTourRows = [];
	const couponRows = [];
	const couponTourRows = [];
	const participantTypeRows = [];

	const metaByUrlKey = new Map();
	const addMeta = (row) => {
		if (!row?.url_key) return row?.id;
		if (metaByUrlKey.has(row.url_key)) return metaByUrlKey.get(row.url_key).id;
		metaByUrlKey.set(row.url_key, row);
		metaRows.push(row);
		return row.id;
	};

	for (const cat of categories) {
		const metaId = crypto.randomUUID();
		addMeta({
			id: metaId,
			url_key: cat.url_key,
			meta_title: cat.name,
			meta_description: cat.name,
			meta_keywords: cat.name,
		});
		categoryRows.push({
			id: cat.id,
			name: cat.name,
			image: cat.image,
			meta_details_id: metaId,
			sort_order: cat.id,
		});
	}

	for (const city of cities) {
		const metaId = crypto.randomUUID();
		addMeta({
			id: metaId,
			url_key: city.url_key,
			meta_title: city.name,
			meta_description: city.name,
			meta_keywords: city.name,
		});
		cityRows.push({
			id: city.id,
			name: city.name,
			card_image: city.card_image,
			full_image: city.card_image,
			meta_details_id: metaId,
		});
	}

	for (const hero of heroes) {
		heroRows.push({ id: hero.id, name: hero.name, image: hero.image });
	}

	for (const detail of all.tourDetails) {
		const tour = detail.tour;
		if (!tour?.id) continue;

		if (tour.provider?.id) {
			providerRows.push({ id: tour.provider.id, name: tour.provider.name });
		}

		for (const tag of tour.tags ?? []) {
			tagRows.push({ id: tag.id, name: tag.name, image: tag.image });
			tourTagRows.push({ tour_id: tour.id, tour_tag_id: tag.id });
		}

		const metaId = addMeta({
			id: tour.meta_details?.id ?? crypto.randomUUID(),
			url_key: tour.meta_details?.url_key ?? tour.id,
			meta_title: tour.meta_details?.meta_title ?? tour.name,
			meta_description: tour.meta_details?.meta_description ?? tour.name,
			meta_keywords: tour.meta_details?.meta_keywords ?? tour.name,
			created_at: tour.meta_details?.created_at,
			updated_at: tour.meta_details?.updated_at,
		});

		tourRows.push({
			id: tour.id,
			name: tour.name,
			isFeatured: tour.isFeatured ?? false,
			isActive: tour.isActive ?? true,
			cover_image: tour.cover_image,
			images: tour.images ?? [],
			overview: tour.overview ?? tour.name,
			highlights: tour.highlights ?? null,
			age_health_restrictions: tour.age_health_restrictions ?? null,
			know_before_you_go: tour.know_before_you_go ?? null,
			cancellation_policy: null,
			meta_details_id: metaId,
			address_name: tour.address_name ?? null,
			address_link: tour.address_link ?? null,
			tour_category_id: tour.tour_category_id,
			city_id: tour.city_id,
			provider: tour.provider?.id ?? null,
			free_cancelation_avilable: tour.free_cancelation_avilable ?? false,
			live_tour_guide: tour.live_tour_guide ?? false,
			live_tour_guide_langs: tour.live_tour_guide_langs ?? null,
			isWeelChairAccessible: tour.isWeelChairAccessible ?? false,
			duration_minutes: tour.duration_minutes ?? null,
			created_at: tour.created_at,
			updated_at: tour.updated_at,
			added_by: SEED_ADMIN_ID,
		});

		for (const option of tour.tour_options ?? []) {
			optionRows.push({
				id: option.id,
				tour_id: tour.id,
				name: option.name,
				inclusions: option.inclusions ?? null,
				exclusions: option.exclusions ?? null,
				note: option.note ?? null,
				sort_order: option.sort_order ?? 1,
				created_at: option.created_at,
				updated_at: option.updated_at,
				isOpenDated: option.isOpenDated ?? false,
			});

			for (const price of option.prices ?? []) {
				participantTypeRows.push({
					id: price.participant_type_id,
					name: price.participant_type?.name ?? `Type ${price.participant_type_id}`,
					age_min: price.participant_type?.age_min ?? 0,
					age_max: price.participant_type?.age_max ?? 99,
					created_at: price.participant_type?.created_at,
				});
				priceRows.push({
					id: price.id,
					tour_option_id: option.id,
					participant_type_id: price.participant_type_id,
					price: price.price,
					created_at: price.created_at,
				});
			}

			for (const rule of option.availability_rules ?? []) {
				ruleRows.push({
					id: rule.id,
					tour_option_id: option.id,
					start_date: rule.start_date,
					end_date: rule.end_date,
					is_active: rule.is_active ?? true,
					created_at: rule.created_at,
					weekdays: sanitizeWeekdays(rule.weekdays),
				});
				for (const slot of rule.time_slots ?? []) {
					slotRows.push({
						availability_rule_id: rule.id,
						label: slot.label,
						capacity: slot.capacity,
						is_active: slot.is_active ?? true,
						created_at: slot.created_at,
					});
				}
			}
		}
	}

	for (const collection of collections) {
		collectionRows.push({
			id: collection.id,
			name: collection.name,
			description: collection.description,
			isFeatured: collection.isFeatured ?? true,
		});
		for (const cc of collection.collection_cities ?? []) {
			collectionCityRows.push({
				id: cc.id,
				collection_id: collection.id,
				city_id: cc.city_id,
			});
		}
		for (const tour of collection.tours ?? []) {
			collectionTourRows.push({
				collection_id: collection.id,
				tour_id: tour.id,
			});
		}
	}

	for (const coupon of coupons) {
		couponRows.push({
			id: coupon.id,
			code: coupon.code,
			coupon_type: coupon.coupon_type,
			discount_type: coupon.discount_type,
			discount_value: coupon.discount_value,
			valid_from: coupon.valid_from,
			valid_until: coupon.valid_until,
			min_subtotal: coupon.min_subtotal ?? null,
			total_usage_limit: coupon.total_usage_limit ?? null,
			per_user_limit: coupon.per_user_limit ?? null,
			is_active: coupon.is_active ?? true,
			created_at: coupon.created_at,
			updated_at: coupon.updated_at,
		});
		for (const tour of coupon.tours ?? []) {
			for (const opt of tour.tour_options ?? []) {
				couponTourRows.push({
					coupon_id: coupon.id,
					tour_option_id: opt.id,
				});
			}
		}
	}

	await ensureSeedAdmin();

	console.log("Copying images from demo storage...");
	await copyImages(collectImagePaths(all));

	console.log("Seeding database...");
	await upsert("meta_details", uniqBy(metaRows, (r) => r.id));
	await upsert("participant_types", uniqBy(participantTypeRows, (r) => r.id));
	await upsert("activity_providers", uniqBy(providerRows, (r) => r.id));
	await upsert("tours_categories", uniqBy(categoryRows, (r) => r.id));
	await upsert("cities", uniqBy(cityRows, (r) => r.id));
	await upsert("tour_tags", uniqBy(tagRows, (r) => r.id));
	await upsert("hero_sections", uniqBy(heroRows, (r) => r.id));
	await upsert("tours", uniqBy(tourRows, (r) => r.id));
	await insertRows("tours_tags", uniqBy(tourTagRows, (r) => `${r.tour_id}:${r.tour_tag_id}`));
	await upsert("tour_options", uniqBy(optionRows, (r) => r.id));
	await upsert("tour_option_prices", uniqBy(priceRows, (r) => r.id));
	await upsert("availability_rules", uniqBy(ruleRows, (r) => r.id));
	await insertRows("time_slots", uniqBy(slotRows, (r) => `${r.availability_rule_id}:${r.label}`));
	await upsert("collections", uniqBy(collectionRows, (r) => r.id));
	await upsert("collection_cities", uniqBy(collectionCityRows, (r) => r.id));
	await insertRows(
		"collection_tours",
		uniqBy(collectionTourRows, (r) => `${r.collection_id}:${r.tour_id}`),
	);
	await upsert("coupons", uniqBy(couponRows, (r) => r.id));
	await insertRows(
		"coupon_tours",
		uniqBy(couponTourRows, (r) => `${r.coupon_id}:${r.tour_option_id}`),
	);
}

async function main() {
	if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
	}

	const allPath = path.join(__dirname, "seed-data/all.json");
	if (!fs.existsSync(allPath)) {
		throw new Error("Missing scripts/seed-data/all.json — run: npm run seed:fetch");
	}

	const all = JSON.parse(fs.readFileSync(allPath, "utf8"));
	await seedFromAll(all);
	console.log("Seed complete.");
}

main().catch((error) => {
	console.error("Seed failed:", error.message);
	process.exit(1);
});
