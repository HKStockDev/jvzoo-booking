import { CheckoutService } from "@workspace/shared/services/checkout.service";
import { ApiError } from "@workspace/shared/utils/ApiError";
import { type ActionFunctionArgs } from "react-router";
import z from "zod";

const schema = z.object({
	bookingRef: z.string().min(1, "Booking reference is required"),
	customer_email: z.string().email().optional(),
});

export const action = async ({ request }: ActionFunctionArgs) => {
	if (request.method !== "POST") {
		return {
			url: null,
			error: new ApiError("Invalid request method", 405, []),
		};
	}

	const reqBody = await request.json();

	if (reqBody === null) {
		return {
			url: null,
			error: new ApiError("Invalid request body", 400, []),
		};
	}

	const parseResult = schema.safeParse(reqBody);

	if (!parseResult.success) {
		return {
			url: null,
			error: new ApiError(parseResult.error.message ?? "Invalid data for checkout", 400, [
				parseResult.error,
			]),
		};
	}

	const checkoutSvc = new CheckoutService(request);

	const resp = await checkoutSvc.createCheckoutUrl({
		bookingRef: parseResult.data.bookingRef,
		customer_email: parseResult.data.customer_email,
	});

	return {
		url: resp.url,
		sessionId: resp.url,
		error: resp.error,
	};
};
