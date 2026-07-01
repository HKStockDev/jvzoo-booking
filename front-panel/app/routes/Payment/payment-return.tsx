import { redirect, type LoaderFunctionArgs } from "react-router";

/** JVZoo thank-you redirect — forwards query params to the booking success page */
export const loader = async ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);
	const bookingRef = url.searchParams.get("bookingRef");

	if (!bookingRef) {
		return redirect("/booking/payment-cancel");
	}

	const tour = url.searchParams.get("tour");
	const successUrl = new URL(`/booking/${bookingRef}/payment-success`, url.origin);
	if (tour) successUrl.searchParams.set("tour", tour);

	return redirect(successUrl.pathname + successUrl.search);
};
