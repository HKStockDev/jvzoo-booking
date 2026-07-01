import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchLoaderData } from "./extract-loader-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "seed-data");
const BASE = "https://rr-tours-front.onrender.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function collectTourRefs(home, toursPages) {
	const map = new Map();

	const add = (tour) => {
		if (!tour?.id || !tour?.url_key) return;
		map.set(tour.id, { id: tour.id, url_key: tour.url_key, name: tour.name });
	};

	for (const tour of home?.featuredToursResp?.tours ?? []) add(tour);
	for (const collection of home?.featuredCollectionsResp?.collections ?? []) {
		for (const tour of collection?.tours ?? []) add(tour);
	}
	for (const page of toursPages) {
		for (const tour of page?.toursResp?.tours ?? []) add(tour);
	}

	return [...map.values()];
}

async function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true });

	console.log("Fetching homepage...");
	const homeLoader = await fetchLoaderData(`${BASE}/`);
	const home = homeLoader["routes/Home/home"];
	const layout = homeLoader["routes/layout"];
	const root = homeLoader.root;

	fs.writeFileSync(path.join(OUT_DIR, "home.json"), JSON.stringify(homeLoader, null, 2));

	console.log("Fetching tours pages...");
	const toursPages = [];
	for (const page of [1, 2]) {
		const data = await fetchLoaderData(`${BASE}/tours?page=${page}`);
		toursPages.push(data["routes/Tour/tours"]);
		await sleep(400);
	}

	const tourRefs = collectTourRefs(home, toursPages);
	console.log(`Found ${tourRefs.length} unique tours to fetch details for`);

	const tourDetails = [];
	for (const [index, tour] of tourRefs.entries()) {
		const url = `${BASE}/tours/tour/${tour.id}/${tour.url_key}`;
		console.log(`[${index + 1}/${tourRefs.length}] ${tour.name}`);
		try {
			const data = await fetchLoaderData(url);
			const detail = data["routes/Tour/tour-details"];
			if (detail?.tour) tourDetails.push(detail);
		} catch (error) {
			console.warn(`  skipped ${tour.id}: ${error.message}`);
		}
		await sleep(500);
	}

	const all = {
		source: BASE,
		fetchedAt: new Date().toISOString(),
		home,
		layout,
		root,
		toursPages,
		tourDetails,
	};

	fs.writeFileSync(path.join(OUT_DIR, "all.json"), JSON.stringify(all, null, 2));
	console.log(`Saved ${path.join(OUT_DIR, "all.json")}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
