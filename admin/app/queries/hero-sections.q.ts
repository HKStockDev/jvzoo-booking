import { cacheService } from "@workspace/shared/services/cache.service";
import { HeroSectionsService } from "@workspace/shared/services/hero-sections.service";
import { CACHE_KEYS } from "@workspace/shared/utils/cache-keys";

export const heroSectionQuery = async ({ request, id }: { request: Request; id: number }) => {
	const queryFn = async () => {
		const svc = new HeroSectionsService(request);
		const resp = await svc.getHeroSectionById(id);
		return resp;
	};

	const result = await cacheService.get(CACHE_KEYS.heroSections.details(id), queryFn);
	return result;
};

export const allHeroSectionsQuery = async ({ request }: { request: Request }) => {
	const queryFn = async () => {
		const svc = new HeroSectionsService(request);
		const resp = await svc.getAllHeroSections();
		return resp;
	};

	const result = await cacheService.get(CACHE_KEYS.heroSections.list("AD"), queryFn);
	return result;
};
