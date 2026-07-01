import { PaymentService } from "@workspace/shared/services/payment.service";
import type { ActionFunctionArgs } from "react-router";
import type { JvzooIpnPayload } from "@workspace/shared/services/jvzoo.service";

async function parseIpnPayload(request: Request): Promise<JvzooIpnPayload> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const json = await request.json();
		const payload: JvzooIpnPayload = {};
		for (const [key, value] of Object.entries(json)) {
			if (typeof value === "string") payload[key] = value;
		}
		return payload;
	}

	const formData = await request.formData();
	const payload: JvzooIpnPayload = {};
	for (const [key, value] of formData.entries()) {
		if (typeof value === "string") payload[key] = value;
	}
	return payload;
}

export const action = async ({ request }: ActionFunctionArgs) => {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	try {
		const payload = await parseIpnPayload(request);
		const paymentSvc = new PaymentService(request);
		const result = await paymentSvc.handleJvzooIpn(payload);

		if (!result.success) {
			console.error("[JVZIPN] Processing failed:", result.error);
			return new Response(result.error ?? "IPN processing failed", { status: 400 });
		}

		return new Response("OK", { status: 200 });
	} catch (error: any) {
		console.error("[JVZIPN] Unexpected error:", error);
		return new Response("Internal server error", { status: 500 });
	}
};
