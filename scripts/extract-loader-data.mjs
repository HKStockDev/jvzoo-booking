import fs from "fs";

function extractStreamArray(html) {
	const marker = 'streamController.enqueue("';
	const start = html.indexOf(marker);
	if (start === -1) return null;
	let i = start + marker.length;
	let escaped = "";
	while (i < html.length) {
		const ch = html[i];
		if (ch === "\\") {
			const next = html[i + 1];
			if (next === '"') {
				escaped += '"';
				i += 2;
				continue;
			}
			if (next === "n") {
				escaped += "\n";
				i += 2;
				continue;
			}
			if (next === "\\") {
				escaped += "\\";
				i += 2;
				continue;
			}
			escaped += ch + next;
			i += 2;
			continue;
		}
		if (ch === '"') break;
		escaped += ch;
		i++;
	}
	return JSON.parse(escaped.trim());
}

function hydrate(arr) {
	const cache = new Array(arr.length);
	const resolving = new Set();

	function resolveIndex(idx) {
		if (idx === -5) return undefined;
		if (cache[idx] !== undefined) return cache[idx];
		if (resolving.has(idx)) return undefined;
		resolving.add(idx);
		cache[idx] = hydrateValue(arr[idx]);
		resolving.delete(idx);
		return cache[idx];
	}

	function shouldResolveIndex(item) {
		if (typeof item !== "number" || item < 0 || item >= arr.length) return false;
		const target = arr[item];
		return typeof target === "string" || (typeof target === "object" && target !== null);
	}

	function hydrateValue(value) {
		if (Array.isArray(value)) {
			return value.map((item) => (shouldResolveIndex(item) ? resolveIndex(item) : item));
		}

		if (value === null || typeof value !== "object") {
			return value;
		}

		const keys = Object.keys(value);
		if (keys.length > 0 && keys.every((k) => k.startsWith("_"))) {
			const obj = {};
			for (const [keyIdxKey, valueIdx] of Object.entries(value)) {
				const keyName = arr[Number(keyIdxKey.slice(1))];
				obj[keyName] = resolveIndex(valueIdx);
			}
			return obj;
		}

		return value;
	}

	for (let i = 0; i < arr.length; i++) {
		if (cache[i] === undefined) {
			cache[i] = hydrateValue(arr[i]);
		}
	}

	const loaderIdx = arr.indexOf("loaderData");
	if (loaderIdx === -1) return null;

	const loaderRef = arr[loaderIdx + 1];
	const loaderData = {};
	for (const [routeIdxKey, dataIdx] of Object.entries(loaderRef)) {
		const routeIdx = Number(routeIdxKey.slice(1));
		const routeName = arr[routeIdx];
		if (typeof routeName !== "string") continue;
		loaderData[routeName] = resolveIndex(dataIdx);
	}

	return loaderData;
}

export async function fetchLoaderData(url) {
	const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
	const html = await res.text();
	const stream = extractStreamArray(html);
	if (!stream) throw new Error(`No loader stream found for ${url}`);
	return hydrate(stream);
}

if (process.argv[1].endsWith("extract-loader-data.mjs")) {
	const url = process.argv[2] ?? "https://rr-tours-front.onrender.com/";
	const data = await fetchLoaderData(url);
	const outFile = process.argv[3] ?? "loader-data.json";
	fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
	console.log(`Wrote ${outFile}`);
	console.log("Routes:", Object.keys(data));
}
