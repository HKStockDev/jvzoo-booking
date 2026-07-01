export function isProductionEnv(): boolean {
	return process.env.VITE_ENV === "production" || process.env.NODE_ENV === "production";
}

export function isResendConfigured(): boolean {
	return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Non-production local/staging setup without real third-party credentials. */
export function isDevTestMode(): boolean {
	if (process.env.ENABLE_DEV_TEST_MODE === "true") return true;
	return !isProductionEnv();
}

/** Admin OTP login without Resend — skip email delivery and accept any verification code. */
export function isOtpBypassMode(): boolean {
	return !isResendConfigured() || isDevTestMode();
}
